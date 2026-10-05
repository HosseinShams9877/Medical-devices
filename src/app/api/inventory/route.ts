import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'
import { recordMovement, consumeLotsFIFO } from '@/lib/stock'

export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'inventory.view')
  const sp = req.nextUrl.searchParams
  const q = sp.get('q') || undefined
  const onlyShortage = sp.get('shortage') === '1'

  const components = await db.component.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }, { manufacturer: { contains: q } }] } : {}),
    },
    include: {
      supplier: { select: { name: true, code: true } },
      lots: { orderBy: { receivedAt: 'desc' }, include: { inspections: { select: { code: true, status: true } } } },
      _count: { select: { bomItems: true, usages: true } },
    },
    orderBy: [{ criticality: 'desc' }, { code: 'asc' }],
  })

  const withCalc = components.map((c) => {
    const available = c.stockQty - c.reservedQty
    return {
      ...c,
      availableQty: available,
      belowMin: c.stockQty <= c.minStock,
      shortage: available < 0,
    }
  })

  const result = onlyShortage ? withCalc.filter((c) => c.belowMin || c.shortage) : withCalc
  const suppliers = await db.supplier.findMany({ where: { active: true } })
  const inspections = await db.incomingInspection.findMany({
    include: { component: { select: { code: true, name: true, unit: true } }, lot: { select: { lotNumber: true } } },
    orderBy: { createdAt: 'desc' }, take: 50,
  })
  const finishedGoods = await db.device.findMany({
    where: { status: 'RELEASED', order: { destinationType: 'WAREHOUSE', status: { in: ['IN_WAREHOUSE', 'CLOSED'] } } },
    select: { id: true, serial: true, product: { select: { code: true, name: true } }, order: { select: { code: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // دفتر گردش کالا (۱۰۰ ردیف آخر)
  const movements = await db.stockMovement.findMany({
    include: {
      component: { select: { code: true, name: true, unit: true } },
      user: { select: { fullName: true } },
      order: { select: { code: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // کاتالوگ BOM فعال برای مصرف خودکار انبار
  const bomCatalog = await db.product.findMany({
    where: { active: true },
    select: {
      id: true, code: true, name: true, unit: true,
      revisions: {
        where: { isActive: true },
        select: {
          id: true, revision: true,
          boms: {
            where: { status: 'ACTIVE' },
            orderBy: { revision: 'desc' },
            take: 1,
            select: {
              id: true, revision: true,
              items: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  componentId: true, qty: true, criticality: true,
                  component: { select: { id: true, code: true, name: true, unit: true, stockQty: true, reservedQty: true, criticality: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { code: 'asc' },
  })

  return ok({ components: result, suppliers, inspections, movements, bomCatalog, finishedGoods })
})

const actionSchema = z.object({
  action: z.enum(['receive', 'adjust', 'out', 'bom-consume']),
  componentId: z.string().optional(),
  lotNumber: z.string().max(60).optional(),
  lotId: z.string().optional(),
  qty: z.number().positive().max(100000).optional(),
  supplierId: z.string().optional(),
  newQty: z.number().min(0).max(1000000).optional(),
  reason: z.string().max(1000).optional(),
  productId: z.string().optional(),
  count: z.number().int().min(1).max(500).optional(),
  operationId: z.string().uuid().optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  const body = await readJson(req, actionSchema)

  const comp = body.componentId
    ? await db.component.findUnique({ where: { id: body.componentId } })
    : null

  // ═══ ثبت رسید انبار (ورود + گیت IQC) ═══
  if (body.action === 'receive') {
    if (!comp) throw faError('قطعه یافت نشد.', 404)
    if (!user.permissions.includes('inventory.receive')) throw faError('مجوز ثبت رسید ندارید.', 403)
    if (!body.qty) throw faError('تعداد الزامی است.')
    if (!body.lotNumber) throw faError('شماره لات الزامی است.')
    const clash = await db.componentLot.findFirst({ where: { componentId: comp.id, lotNumber: body.lotNumber } })
    if (clash) throw faError('این شماره لات قبلاً برای این قطعه ثبت شده است.')

    const { lot, insp } = await db.$transaction(async (tx) => {
      const lot = await tx.componentLot.create({
        data: { componentId: comp.id, lotNumber: body.lotNumber!, quantity: body.qty!, remaining: body.qty!, supplierId: body.supplierId, status: 'PENDING' },
      })
      const insp = await tx.incomingInspection.create({ data: { code: `IQC-${randomUUID()}`, componentId: comp.id, lotId: lot.id, supplierId: body.supplierId, qty: body.qty! } })
      await tx.componentLot.update({ where: { id: lot.id }, data: { inspectionId: insp.id } })
      return { lot, insp }
    })
    await audit(req, user, 'INVENTORY_RECEIVE', { entityType: 'COMPONENT', entityId: comp.id, entityCode: comp.code, newValues: { lot: body.lotNumber, qty: body.qty, inspection: insp.code, status: 'PENDING_QC' } })
    await notifyRole('QC', `کنترل ورودی جدید — ${comp.name}`, `لات ${body.lotNumber} (${body.qty} ${comp.unit}) منتظر تصمیم IQC است.`, 'INFO', { entityType: 'INVENTORY', entityId: lot.id, linkView: 'inventory' })
    return ok({ lot, inspection: insp })
  }

  // ═══ اصلاح موجودی (شمارش انبار) ═══
  if (body.action === 'adjust') {
    if (!comp) throw faError('قطعه یافت نشد.', 404)
    if (!user.permissions.includes('inventory.adjust')) throw faError('مجوز اصلاح موجودی ندارید.', 403)
    if (body.newQty === undefined) throw faError('مقدار جدید الزامی است.')
    if (body.newQty < comp.reservedQty) throw faError(`مقدار جدید (${body.newQty}) کمتر از رزرو جاری (${comp.reservedQty}) است؛ ابتدا رزروها آزاد شوند.`)
    if (!body.reason) throw faError('دلیل اصلاح موجودی الزامی است.')
    const old = comp.stockQty
    if (body.newQty > old) throw faError('افزایش موجودی باید با ثبت رسید جدید و تأیید QC انجام شود.')
    await db.$transaction(async (tx) => {
      const updated = await tx.component.updateMany({ where: { id: comp.id, stockQty: old, reservedQty: { lte: body.newQty! } }, data: { stockQty: body.newQty! } })
      if (!updated.count) throw faError('موجودی یا رزرو تغییر کرده است؛ دوباره تلاش کنید.', 409)
      if (old > body.newQty!) await consumeLotsFIFO(comp.id, old - body.newQty!, tx)
      await recordMovement({ componentId: comp.id, type: 'ADJUST', qty: body.newQty! - old,
        beforeQty: old, afterQty: body.newQty!, reason: body.reason, userId: user.id }, tx)
    })
    await audit(req, user, 'INVENTORY_ADJUST', { entityType: 'COMPONENT', entityId: comp.id, entityCode: comp.code, oldValues: { stockQty: old }, newValues: { stockQty: body.newQty, reason: body.reason } })
    return ok({ success: true })
  }

  // ═══ خروج دستی انبار ═══
  if (body.action === 'out') {
    if (!comp) throw faError('قطعه یافت نشد.', 404)
    if (!user.permissions.includes('inventory.move')) throw faError('مجوز ثبت خروج دستی ندارید.', 403)
    if (!body.qty) throw faError('تعداد الزامی است.')
    if (!body.reason?.trim()) throw faError('دلیل خروج دستی الزامی است (مصرف داخلی، ضایعات، نمونه و…).')

    const available = comp.stockQty - comp.reservedQty
    if (body.qty > available) {
      throw faError(`موجودی قابل استفاده ${available} ${comp.unit} است؛ رزرو سفارش‌های دیگر قابل مصرف دستی نیست.`)
    }

    const { lotId, lotNumber } = await db.$transaction(async (tx) => {
      const current = await tx.component.findUniqueOrThrow({ where: { id: comp.id } })
      const claimed = await tx.component.updateMany({
        where: { id: comp.id, reservedQty: current.reservedQty, AND: [{ stockQty: current.stockQty }, { stockQty: { gte: current.reservedQty + body.qty! } }] },
        data: { stockQty: { decrement: body.qty! } },
      })
      if (!claimed.count) throw faError('موجودی قابل استفاده تغییر کرده است؛ دوباره تلاش کنید.', 409)
      let lotId: string | null = null
      let lotNumber: string | null = null
      if (body.lotId) {
        const lot = await tx.componentLot.findUnique({ where: { id: body.lotId } })
        if (!lot || lot.componentId !== comp.id || lot.status !== 'APPROVED') throw faError('لات تأییدشده یافت نشد.')
        const changed = await tx.componentLot.updateMany({ where: { id: lot.id, status: 'APPROVED', remaining: { gte: body.qty! } }, data: { remaining: { decrement: body.qty! } } })
        if (!changed.count) throw faError('مانده لات کافی نیست.', 409)
        lotId = lot.id; lotNumber = lot.lotNumber
      } else {
        const used = await consumeLotsFIFO(comp.id, body.qty!, tx)
        lotNumber = used.map((l) => l.lotNumber).join('، ')
        lotId = used.length === 1 ? used[0].lotId : null
      }
      await recordMovement({ componentId: comp.id, type: 'MANUAL_OUT', qty: -body.qty!,
        beforeQty: current.stockQty, afterQty: current.stockQty - body.qty!,
        reason: body.reason, lotId, lotNumber, userId: user.id }, tx)
      return { lotId, lotNumber }
    })
    await audit(req, user, 'INVENTORY_OUT', {
      entityType: 'COMPONENT', entityId: comp.id, entityCode: comp.code,
      oldValues: { stockQty: comp.stockQty }, newValues: { stockQty: comp.stockQty - body.qty, qty: body.qty, reason: body.reason, lot: lotNumber },
    })
    if (comp.stockQty - body.qty <= comp.minStock) {
      await notifyRole('WAREHOUSE', `زیر حداقل موجودی — ${comp.name}`, `پس از خروج دستی، موجودی به ${comp.stockQty - body.qty} ${comp.unit} رسید (حداقل: ${comp.minStock}).`, 'WARNING', { entityType: 'INVENTORY', entityId: comp.id, linkView: 'inventory' })
    }
    return ok({ success: true })
  }

  // ═══ مصرف خودکار بر اساس BOM ═══
  // مثال: «۱۰ مجموعه از این BOM مصرف شده» → همهٔ اقلام به نسبت BOM × ۱۰ کسر می‌شود
  if (body.action === 'bom-consume') {
    if (!user.permissions.includes('inventory.bomConsume')) throw faError('مجوز مصرف خودکار BOM ندارید.', 403)
    if (!body.count) throw faError('تعداد مجموعه (BOM) الزامی است.')
    if (!body.reason?.trim()) throw faError('دلیل/مبنای مصرف الزامی است (مثال: پایان مرحلهٔ مونتاژ شمارهٔ ۳).')
    if (!body.productId) throw faError('محصول انتخاب نشده است.')
    if (!body.operationId) throw faError('شناسه یکتای درخواست مصرف الزامی است.')

    const rev = await db.productRevision.findFirst({ where: { productId: body.productId, isActive: true }, orderBy: { createdAt: 'desc' } })
    const bom = rev
      ? await db.bom.findFirst({
          where: { productRevisionId: rev.id, status: 'ACTIVE' },
          orderBy: { revision: 'desc' },
          include: { items: { include: { component: true } }, productRevision: { include: { product: true } } },
        })
      : null
    if (!bom) throw faError('BOM فعالی برای محصول انتخابی یافت نشد.')
    if (bom.items.length === 0) throw faError('این BOM قلمی ندارد.')

    // اعتبارسنجی کامل پیش از هر تغییری — اگر حتی یک قلم کم باشد، هیچ چیزی کسر نمی‌شود
    const plan = bom.items.map((item) => {
      const required = Math.round(item.qty * body.count! * 1e6) / 1e6
      const available = Math.max(0, item.component.stockQty - item.component.reservedQty)
      return {
        componentId: item.componentId, code: item.component.code, name: item.component.name, unit: item.component.unit,
        required, available,
        critical: item.criticality === 'CRITICAL' || item.component.criticality === 'CRITICAL',
      }
    })
    const shortages = plan.filter((p) => p.required > p.available)
    if (shortages.length > 0) {
      throw faError(
        'موجودی برای همهٔ اقلام کافی نیست؛ هیچ قلمی کسر نشد — ' +
        shortages.map((s) => `${s.name}: موردنیاز ${s.required}، قابل استفاده ${s.available} ${s.unit}`).join(' | '),
      )
    }

    const consumed: { code: string; name: string; qty: number; lots: { lotNumber: string; qty: number }[] }[] = []
    const baseReason = `مصرف ${body.count}× BOM ${bom.productRevision.product.code} نسخه r${bom.revision} — ${body.reason}`
    await db.$transaction(async (tx) => {
      const existing = await tx.inventoryOperation.findUnique({ where: { id: body.operationId! } })
      if (existing) throw faError('این برداشت قبلاً ثبت شده است؛ موجودی دوباره کسر نشد.', 409)
      await tx.inventoryOperation.create({ data: { id: body.operationId!, kind: 'BOM_CONSUME' } })
      for (const p of plan) {
        const c = await tx.component.findUniqueOrThrow({ where: { id: p.componentId } })
        const claimed = await tx.component.updateMany({
          where: { id: c.id, reservedQty: c.reservedQty, AND: [{ stockQty: c.stockQty }, { stockQty: { gte: c.reservedQty + p.required } }] },
          data: { stockQty: { decrement: p.required } },
        })
        if (!claimed.count) throw faError(`موجودی ${c.name} تغییر کرده است؛ دوباره تلاش کنید.`, 409)
        const usedLots = await consumeLotsFIFO(c.id, p.required, tx)
        await recordMovement({ componentId: c.id, type: 'BOM_CONSUME', qty: -p.required,
          beforeQty: c.stockQty, afterQty: c.stockQty - p.required, reason: baseReason,
          lotNumber: usedLots.map((l) => l.lotNumber).join('، '), userId: user.id }, tx)
        consumed.push({ code: p.code, name: p.name, qty: p.required, lots: usedLots.map((l) => ({ lotNumber: l.lotNumber, qty: l.qty })) })
      }
    })

    await audit(req, user, 'INVENTORY_BOM_CONSUME', {
      entityType: 'BOM', entityId: bom.id, entityCode: bom.productRevision.product.code,
      newValues: { bomRevision: bom.revision, count: body.count, reason: body.reason, items: consumed },
    })
    await notifyRole('PRODUCTION_MGR', `مصرف BOM ثبت شد — ${bom.productRevision.product.name}`, `${body.count} مجموعه از BOM r${bom.revision} از انبار کسر شد. دلیل: ${body.reason}`, 'INFO', { entityType: 'INVENTORY', entityId: bom.id, linkView: 'inventory' })
    return ok({ success: true, consumed })
  }

  throw faError('اقدام نامعتبر است.')
})
