import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'
import { ORDER_TRANSITIONS, allowedTransitions, evaluateGuard } from '@/lib/workflow'
import { hasPerm } from '@/lib/rbac'
import { recordMovement } from '@/lib/stock'

// ─── GET /api/orders/[id] — جزئیات کامل سفارش ───
export const GET = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const order = await db.productionOrder.findUnique({
    where: { id },
    include: {
      product: true,
      productRevision: true,
      bom: { include: { items: { include: { component: { include: { supplier: true } } }, orderBy: { sortOrder: 'asc' } } } },
      owner: { select: { id: true, fullName: true } },
      createdBy: { select: { fullName: true } },
      customer: { select: { id: true, code: true, name: true } },
      steps: { orderBy: { stepIndex: 'asc' }, include: { records: { include: { operator: { select: { fullName: true } }, device: { select: { serial: true } } } } } },
      materials: { include: { component: true } },
      devices: { include: { _count: { select: { tests: true, reworks: true } } } },
      tests: { orderBy: { createdAt: 'asc' } },
      ncrs: true,
    },
  })
  if (!order) throw faError('سفارش یافت نشد.', 404)

  const operators = await db.user.findMany({
    where: { role: { in: ['OPERATOR', 'PRODUCTION_MGR', 'ADMIN'] }, status: 'ACTIVE' },
    select: { id: true, fullName: true, role: true },
  })

  const transitions = await allowedTransitions('order', order.status, user.role, order.id)
  return ok({ order, transitions, operators })
})

// ─── POST /api/orders/[id] — اقدامات ───
const actionSchema = z.object({
  action: z.enum(['transition', 'record-step', 'firmware', 'note', 'assign']),
  to: z.string().optional(),
  stepId: z.string().optional(),
  deviceId: z.string().nullable().optional(),
  applyAll: z.boolean().optional(),
  result: z.enum(['DONE', 'FAIL', 'SKIPPED']).optional(),
  notes: z.string().max(3000).optional(),
  ownerId: z.string().optional(),
  text: z.string().max(2000).optional(),
  firmwareVersion: z.string().max(50).optional(),
  softwareVersion: z.string().max(50).optional(),
  programMethod: z.string().max(200).optional(),
  programVerified: z.boolean().optional(),
})

export const POST = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const body = await readJson(req, actionSchema)

  const order = await db.productionOrder.findUnique({
    where: { id },
    include: { product: true, productRevision: true, bom: { include: { items: true } }, steps: true, materials: true, devices: true },
  })
  if (!order) throw faError('سفارش یافت نشد.', 404)

  // ═══ ثبت عملیات تولید توسط اپراتور ═══
  if (body.action === 'record-step') {
    if (!hasPerm(user.role, 'production.recordStep')) throw faError('شما مجوز ثبت عملیات تولید را ندارید.', 403)
    if (order.status !== 'IN_PRODUCTION') throw faError('ثبت عملیات فقط برای سفارش «در حال تولید» مجاز است.')
    const step = order.steps.find((s) => s.id === body.stepId)
    if (!step) throw faError('مرحله انتخابی معتبر نیست.')
    if (step.status === 'DONE' && !body.applyAll) throw faError('این مرحله قبلاً تکمیل شده است.')
    if (step.required && body.result === 'SKIPPED') throw faError('مراحل اجباری قابل رد شدن نیستند.')

    const devices = order.devices
    const targets = body.applyAll
      ? devices.filter((d) => d.status !== 'SCRAPPED')
      : [devices.find((d) => d.id === body.deviceId)].filter(Boolean)
    if (targets.length === 0 && devices.length > 0 && !body.applyAll) throw faError('دستگاه انتخاب نشده است.')

    const result = body.result ?? 'DONE'
    const now = new Date()

    // ایجاد رکورد اپراتور
    const createData = (targets.length > 0 ? targets : [null]).map((d) => ({
      stepId: step.id, deviceId: d?.id ?? null, operatorId: user.id, result,
      startedAt: now, finishedAt: now, notes: body.notes,
    }))
    await db.stepRecord.createMany({ data: createData })

    // به‌روزرسانی وضعیت مرحله و دستگاه‌ها
    if (result === 'DONE') {
      for (const d of targets) {
        if (d && step.stepIndex > (d as { currentStepIndex: number }).currentStepIndex) {
          await db.device.update({ where: { id: d.id }, data: { currentStepIndex: step.stepIndex } })
        }
      }
      const doneCount = await db.stepRecord.count({ where: { stepId: step.id, result: 'DONE', deviceId: { not: null } } })
      const allDone = devices.length === 0 ? true : doneCount >= devices.length
      await db.orderStep.update({
        where: { id: step.id },
        data: { status: allDone ? 'DONE' : 'IN_PROGRESS', operatorId: user.id, startedAt: step.startedAt ?? now, finishedAt: allDone ? now : null, notes: body.notes },
      })
    } else if (result === 'FAIL') {
      // عدم انطباق فرایندی خودکار
      const ncrCode = `NCR-1404-${String(await db.nonconformity.count() + 1).padStart(3, '0')}`
      await db.nonconformity.create({
        data: {
          code: ncrCode, type: 'PROCESS', source: 'IN_PROCESS', orderId: order.id,
          deviceId: body.deviceId ?? null,
          title: `ناموفق در مرحله «${step.name}»`,
          description: body.notes || 'اپراتور نتیجه مرحله را ناموفق ثبت کرد.',
          severity: 'MEDIUM', detectedById: user.id,
        },
      })
      await db.orderStep.update({ where: { id: step.id }, data: { status: 'IN_PROGRESS', operatorId: user.id } })
      await notifyRole('QC', 'ناموفقی در مرحله تولید', `سفارش ${order.code} مرحله «${step.name}» ناموفق ثبت شد — NCR ${ncrCode} ایجاد شد.`, 'CRITICAL', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
    }

    await audit(req, user, 'STEP_RECORD', {
      entityType: 'ORDER', entityId: order.id, entityCode: order.code,
      newValues: { step: step.name, result, devices: targets.length, operator: user.fullName },
    })
    return ok({ success: true })
  }

  // ═══ ثبت Firmware ═══
  if (body.action === 'firmware') {
    if (!hasPerm(user.role, 'production.recordStep')) throw faError('شما مجوز ثبت اطلاعات پروگرام را ندارید.', 403)
    const device = order.devices.find((d) => d.id === body.deviceId)
    if (!device) throw faError('دستگاه یافت نشد.')
    await db.device.update({
      where: { id: device.id },
      data: {
        firmwareVersion: body.firmwareVersion, softwareVersion: body.softwareVersion,
        programmedAt: new Date(), programmedById: user.id,
        programMethod: body.programMethod, programVerified: body.programVerified ?? false,
      },
    })
    await audit(req, user, 'FIRMWARE_PROGRAM', {
      entityType: 'DEVICE', entityId: device.id, entityCode: device.serial,
      newValues: { firmware: body.firmwareVersion, software: body.softwareVersion, verified: body.programVerified },
    })
    return ok({ success: true })
  }

  // ═══ یادداشت ═══
  if (body.action === 'note') {
    if (!hasPerm(user.role, 'production.edit') && !hasPerm(user.role, 'production.approve')) throw faError('مجوز ندارید.', 403)
    const stamp = `[${new Date().toISOString()} | ${user.fullName}]: ${body.text ?? ''}`
    await db.productionOrder.update({ where: { id: order.id }, data: { notes: `${order.notes ?? ''}\n${stamp}`.trim() } })
    await audit(req, user, 'ORDER_NOTE', { entityType: 'ORDER', entityId: order.id, entityCode: order.code, newValues: { text: body.text } })
    return ok({ success: true })
  }

  // ═══ تغییر مسئول تولید ═══
  if (body.action === 'assign') {
    if (!hasPerm(user.role, 'production.edit')) throw faError('مجوز ندارید.', 403)
    const old = order.ownerId
    await db.productionOrder.update({ where: { id: order.id }, data: { ownerId: body.ownerId } })
    await audit(req, user, 'ORDER_ASSIGN', { entityType: 'ORDER', entityId: order.id, entityCode: order.code, oldValues: { ownerId: old }, newValues: { ownerId: body.ownerId } })
    return ok({ success: true })
  }

  // ═══ گذار وضعیت (Workflow Engine) ═══
  if (body.action === 'transition') {
    const to = body.to ?? ''
    const defs = ORDER_TRANSITIONS[order.status] ?? []
    const def = defs.find((t) => t.to === to)
    if (!def) throw faError(`گذار از وضعیت «${order.status}» به «${to}» در گردش‌کار مجاز نیست.`)
    if (!hasPerm(user.role, def.perm)) {
      await audit(req, user, 'SEC_TRANSITION_DENIED', { entityType: 'ORDER', entityId: order.id, entityCode: order.code, newValues: { attempted: to, requiredPerm: def.perm } })
      throw faError('شما مجوز این تغییر وضعیت را ندارید.', 403)
    }
    if (def.guard) {
      const g = await evaluateGuard('order', def.guard, order.id)
      if (!g.ok) throw faError(`امکان تغییر وضعیت وجود ندارد: ${g.reason}`)
    }

    // ── تأیید + رزرو مواد + بررسی موجودی ──
    if (to === 'APPROVED' || (to === 'MATERIAL_CHECK')) {
      await db.productionOrder.update({ where: { id: order.id }, data: { status: 'APPROVED' } })
      await audit(req, user, 'ORDER_TRANSITION', { entityType: 'ORDER', entityId: order.id, entityCode: order.code, oldValues: { status: order.status }, newValues: { status: 'APPROVED' } })

      const shortage = await reserveMaterials(order.id)
      await audit(req, user, 'ORDER_MATERIAL_RESERVE', { entityType: 'ORDER', entityId: order.id, entityCode: order.code, newValues: { items: shortage.length, criticalShortage: shortage.some((s) => s.critical) } })

      let nextStatus: string
      if (shortage.some((s) => s.critical && s.shortageQty > 0)) {
        nextStatus = 'MATERIAL_CHECK'
        await notifyRole('WAREHOUSE', `کسری قطعه بحرانی برای ${order.code}`, shortage.filter((s) => s.critical).map((s) => `${s.componentCode}: موردنیاز ${s.requiredQty}، رزرو ${s.reservedQty}، کسری ${s.shortageQty}`).join(' | '), 'CRITICAL', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
        await notifyRole('PRODUCTION_MGR', `سفارش ${order.code} در بررسی مواد متوقف شد`, 'کسری قطعه بحرانی — نیازمند تأمین یا تأیید عبور.', 'WARNING', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
      } else {
        nextStatus = 'READY'
        if (shortage.some((s) => s.shortageQty > 0)) {
          await notifyRole('WAREHOUSE', `کسری قطعه غیربحرانی — ${order.code}`, 'سفارش وارد تولید می‌شود؛ قطعات غیربحرانی کسری دارند.', 'WARNING', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
        }
      }
      await db.productionOrder.update({ where: { id: order.id }, data: { status: nextStatus } })
      await audit(req, user, 'ORDER_TRANSITION', { entityType: 'ORDER', entityId: order.id, entityCode: order.code, newValues: { status: nextStatus, note: 'بررسی مواد انجام شد' } })
      return ok({ success: true, status: nextStatus, shortage })
    }

    // ── عبور از کمبود بحرانی (Override کنترل‌شده) ───
    if (to === 'READY' && order.status === 'MATERIAL_CHECK') {
      await db.productionOrder.update({
        where: { id: order.id },
        data: { status: 'READY', materialOverrideById: user.id, materialOverrideAt: new Date(), materialOverrideNote: body.notes ?? 'عبور تأیید‌شده از کمبود بحرانی' },
      })
      await audit(req, user, 'ORDER_MATERIAL_OVERRIDE', { entityType: 'ORDER', entityId: order.id, entityCode: order.code, newValues: { by: user.username, note: body.notes } })
      await notifyRole('QC', `عبور از کمبود بحرانی در ${order.code}`, `تأیید توسط ${user.fullName} — پیگیری تأمین لازم است.`, 'WARNING', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
      return ok({ success: true, status: 'READY' })
    }

    // ── شروع تولید: تولید سریال + مصرف FIFO لات‌ها ──
    if (to === 'IN_PRODUCTION') {
      const gen = await generateSerialsAndConsume(order.id, user.id)
      await db.productionOrder.update({ where: { id: order.id }, data: { status: 'IN_PRODUCTION', actualStart: order.actualStart ?? new Date() } })
      await audit(req, user, 'ORDER_TRANSITION', {
        entityType: 'ORDER', entityId: order.id, entityCode: order.code, oldValues: { status: order.status }, newValues: { status: 'IN_PRODUCTION', serials: gen.serials },
      })
      return ok({ success: true, status: 'IN_PRODUCTION', serials: gen.serials })
    }

    // ── سایر گذار‌ها ──
    const extra: Record<string, unknown> = {}
    if (to === 'COMPLETED') extra.actualEnd = new Date()
    if (to === 'WAITING_QC') await notifyRole('QC', `سفارش ${order.code} در انتظار کنترل کیفیت`, 'همه مراحل تولید تکمیل شد؛ تست‌های نهایی ثبت شود.', 'INFO', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
    if (to === 'REWORK') await notifyRole('PRODUCTION_MGR', `سفارش ${order.code} وارد Rework شد`, 'دستگاه ناموفق نیازمند اصلاح و Retest است.', 'WARNING', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })

    // ── انبارش محصول نهایی ──
    if (to === 'IN_WAREHOUSE') {
      await notifyRole('SALES', `سفارش ${order.code} وارد انبار محصول شد`, 'محصولات آزاد‌شده در انبار نهایی انبارش شدند؛ آمادهٔ خروج و ارسال هستند.', 'SUCCESS', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
      await notifyRole('PRODUCTION_MGR', `انبارش محصول — ${order.code}`, 'همهٔ دستگاه‌های سفارش آزادسازی و انبارش شدند.', 'INFO', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
    }

    // ── خروج از انبار / ارسال ──
    if (to === 'SHIPPED') {
      await notifyRole('PRODUCTION_MGR', `خروج از انبار و ارسال — ${order.code}`, 'سفارش ارسال شد؛ پس از هرگونه تسویه، پروژه قابل بستن است.', 'SUCCESS', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
    }

    // ── بستن پروژه ──
    if (to === 'CLOSED') {
      extra.actualEnd = order.actualEnd ?? new Date()
      await notifyRole('PRODUCTION_MGR', `پروژه بسته شد — ${order.code}`, 'از صدور درخواست تا خروج از انبار تکمیل شد و پروژه بسته شد.', 'SUCCESS', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
    }

    // لغو سفارش: آزادسازی رزروها
    if (to === 'CANCELLED') {
      for (const m of order.materials) {
        if (m.reservedQty > 0) {
          await db.component.update({ where: { id: m.componentId }, data: { reservedQty: { decrement: m.reservedQty } } })
        }
      }
      await db.orderMaterial.updateMany({ where: { orderId: order.id }, data: { reservedQty: 0 } })
      await notifyRole('WAREHOUSE', `سفارش ${order.code} لغو شد`, 'رزروهای موجودی این سفارش آزاد شدند.', 'INFO', { entityType: 'ORDER', entityId: order.id, linkView: 'order-detail' })
    }

    await db.productionOrder.update({ where: { id: order.id }, data: { status: to, ...extra } })
    await audit(req, user, 'ORDER_TRANSITION', { entityType: 'ORDER', entityId: order.id, entityCode: order.code, oldValues: { status: order.status }, newValues: { status: to } })
    return ok({ success: true, status: to })
  }

  throw faError('اقدام نامعتبر است.')
})

// ─── رزرو مواد بر اساس BOM ───
async function reserveMaterials(orderId: string) {
  const order = await db.productionOrder.findUnique({
    where: { id: orderId },
    include: { bom: { include: { items: { include: { component: true } } } }, materials: true },
  })
  if (!order || !order.bom) return []

  // حذف رزروهای قبلی (در صورت وجود)
  for (const m of order.materials) {
    if (m.reservedQty > 0) {
      await db.component.update({ where: { id: m.componentId }, data: { reservedQty: { decrement: m.reservedQty } } })
    }
  }
  await db.orderMaterial.deleteMany({ where: { orderId } })

  const results: { componentCode: string; requiredQty: number; reservedQty: number; shortageQty: number; critical: boolean }[] = []
  for (const item of order.bom.items) {
    const comp = item.component
    const required = item.qty * order.qty
    const available = Math.max(0, comp.stockQty - comp.reservedQty)
    const reserved = Math.min(required, available)
    const shortage = required - reserved
    const critical = item.criticality === 'CRITICAL' || comp.criticality === 'CRITICAL'
    await db.orderMaterial.create({ data: { orderId, componentId: item.componentId, requiredQty: required, reservedQty: reserved, shortageQty: shortage, critical } })
    if (reserved > 0) await db.component.update({ where: { id: item.componentId }, data: { reservedQty: { increment: reserved } } })
    results.push({ componentCode: comp.code, requiredQty: required, reservedQty: reserved, shortageQty: shortage, critical })
  }
  return results
}

// ─── تولید شماره سریال یکتا + مصرف FIFO لات‌ها ───
async function generateSerialsAndConsume(orderId: string, userId: string) {
  const order = await db.productionOrder.findUnique({
    where: { id: orderId },
    include: { product: true, productRevision: true, bom: { include: { items: { include: { component: true } } } }, devices: true },
  })
  if (!order || !order.bom) throw faError('BOM سفارش یافت نشد.')
  const existing = order.devices.length
  const toCreate = order.qty - existing
  if (toCreate <= 0) return { serials: [] as string[] }

  const base = await db.device.count({ where: { productId: order.productId } })
  const serials: string[] = []
  const newDevices: { id: string; serial: string }[] = []
  for (let i = 1; i <= toCreate; i++) {
    let seq = base + i
    let serial = `${order.product.code}-${order.productRevision.revision}-${String(seq).padStart(4, '0')}`
    while (await db.device.findUnique({ where: { serial } })) {
      seq++
      serial = `${order.product.code}-${order.productRevision.revision}-${String(seq).padStart(4, '0')}`
    }
    serials.push(serial)
    const dev = await db.device.create({
      data: { serial, productId: order.productId, productRevisionId: order.productRevisionId, orderId: order.id, bomId: order.bomId, status: 'IN_PRODUCTION' },
    })
    newDevices.push(dev)
  }

  // مصرف قطعات از لات‌ها (FIFO) + ردیابی دوسویه
  for (const item of order.bom.items) {
    const total = item.qty * toCreate
    // لات‌های تأیید‌شده به‌ترتیب FIFO
    const lots = await db.componentLot.findMany({ where: { componentId: item.componentId, status: 'APPROVED', remaining: { gt: 0 } }, orderBy: { receivedAt: 'asc' } })
    const lotAvail = lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, remaining: l.remaining }))
    let lotIdx = 0
    let fromLots = 0
    for (const d of newDevices) {
      let deviceQty = item.qty
      while (deviceQty > 0 && lotIdx < lotAvail.length) {
        const lot = lotAvail[lotIdx]
        const take = Math.min(lot.remaining, deviceQty)
        if (take <= 0) { lotIdx++; continue }
        await db.devicePartUsage.create({ data: { deviceId: d.id, componentId: item.componentId, lotId: lot.id, lotNumber: lot.lotNumber, qty: take, source: 'PRODUCTION', usedById: userId } })
        lot.remaining -= take
        fromLots += take
        deviceQty -= take
        if (lot.remaining <= 0) lotIdx++
      }
      if (deviceQty > 0) {
        // بدون لات (قطعه بدون لات ثبت‌شده) — مصرف مستقیم با ثبت ردیابی قطعه
        await db.devicePartUsage.create({ data: { deviceId: d.id, componentId: item.componentId, qty: deviceQty, source: 'PRODUCTION', usedById: userId } })
      }
    }
    // اعمال کاهش لات‌ها در دیتابیس
    for (const lot of lotAvail) {
      const original = lots.find((l) => l.id === lot.id)!
      if (lot.remaining < original.remaining) {
        await db.componentLot.update({ where: { id: lot.id }, data: { remaining: lot.remaining } })
      }
    }
    // کاهش موجودی و رزرو (فقط به اندازه‌ی قابل مصرف) + ثبت دفتر گردش کالا
    const comp = await db.component.findUnique({ where: { id: item.componentId } })
    if (comp) {
      const consume = Math.min(total, comp.stockQty)
      await db.component.update({
        where: { id: item.componentId },
        data: { stockQty: { decrement: consume }, reservedQty: { decrement: Math.min(total, comp.reservedQty) } },
      })
      if (consume > 0) {
        const usedLots = lotAvail.filter((l) => l.remaining < (lots.find((x) => x.id === l.id)?.remaining ?? 0))
        await recordMovement({
          componentId: item.componentId, type: 'PRODUCTION', qty: -consume,
          beforeQty: comp.stockQty, afterQty: comp.stockQty - consume,
          reason: `مصرف تولید سفارش ${order.code} (${toCreate} دستگاه × BOM r${order.bom?.revision ?? '—'})`,
          lotNumber: usedLots.map((l) => l.lotNumber).join('، ') || null,
          orderId: order.id, userId,
        })
      }
    }
  }
  return { serials }
}
