import { NextRequest } from 'next/server'
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

  return ok({ components: result, suppliers, inspections, movements, bomCatalog })
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

    const lot = await db.componentLot.create({
      data: { componentId: comp.id, lotNumber: body.lotNumber, quantity: body.qty, remaining: body.qty, supplierId: body.supplierId, status: 'PENDING' },
    })
    const inspCode = `IQC-1404-${String((await db.incomingInspection.count()) + 1).padStart(3, '0')}`
    const insp = await db.incomingInspection.create({ data: { code: inspCode, componentId: comp.id, lotId: lot.id, supplierId: body.supplierId, qty: body.qty } })
    await db.componentLot.update({ where: { id: lot.id }, data: { inspectionId: insp.id } })
    await db.component.update({ where: { id: comp.id }, data: { stockQty: { increment: body.qty } } })
    await recordMovement({
      componentId: comp.id, type: 'MANUAL_IN', qty: body.qty,
      beforeQty: comp.stockQty, afterQty: comp.stockQty + body.qty,
      reason: `رسید انبار — لات ${body.lotNumber} (در انتظار کنترل ورودی IQC)`,
      lotId: lot.id, lotNumber: body.lotNumber, userId: user.id,
    })
    await audit(req, user, 'INVENTORY_RECEIVE', { entityType: 'COMPONENT', entityId: comp.id, entityCode: comp.code, newValues: { lot: body.lotNumber, qty: body.qty, inspection: inspCode } })
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
    await db.component.update({ where: { id: comp.id }, data: { stockQty: body.newQty } })
    await recordMovement({
      componentId: comp.id, type: 'ADJUST', qty: body.newQty - old,
      beforeQty: old, afterQty: body.newQty, reason: body.reason, userId: user.id,
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

    let lotNumber: string | null = null
    let lotId: string | null = null
    if (body.lotId) {
      const lot = await db.componentLot.findUnique({ where: { id: body.lotId } })
      if (!lot || lot.componentId !== comp.id) throw faError('لات انتخابی معتبر نیست.')
      if (lot.status !== 'APPROVED') throw faError('فقط لات تأیید‌شده قابل خروج دستی است.')
      if (lot.remaining < body.qty) throw faError(`ماندهٔ لات ${lot.remaining} ${comp.unit} است.`)
      await db.componentLot.update({ where: { id: lot.id }, data: { remaining: { decrement: body.qty } } })
      lotNumber = lot.lotNumber
      lotId = lot.id
    } else {
      // لات مشخص نشده — مصرف FIFO از لات‌های تأیید‌شده
      const consumed = await consumeLotsFIFO(comp.id, body.qty)
      lotNumber = consumed.map((l) => l.lotNumber).join('، ') || null
      lotId = consumed[0]?.lotId ?? null
    }

    await db.component.update({ where: { id: comp.id }, data: { stockQty: { decrement: body.qty } } })
    await recordMovement({
      componentId: comp.id, type: 'MANUAL_OUT', qty: -body.qty,
      beforeQty: comp.stockQty, afterQty: comp.stockQty - body.qty,
      reason: body.reason, lotId, lotNumber, userId: user.id,
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
    for (const p of plan) {
      const c = await db.component.findUniqueOrThrow({ where: { id: p.componentId } })
      const usedLots = await consumeLotsFIFO(c.id, p.required)
      await db.component.update({ where: { id: c.id }, data: { stockQty: { decrement: p.required } } })
      await recordMovement({
        componentId: c.id, type: 'BOM_CONSUME', qty: -p.required,
        beforeQty: c.stockQty, afterQty: c.stockQty - p.required,
        reason: baseReason,
        lotNumber: usedLots.map((l) => l.lotNumber).join('، ') || null, userId: user.id,
      })
      consumed.push({ code: p.code, name: p.name, qty: p.required, lots: usedLots.map((l) => ({ lotNumber: l.lotNumber, qty: l.qty })) })
      if (c.stockQty - p.required <= c.minStock) {
        await notifyRole('WAREHOUSE', `زیر حداقل موجودی — ${c.name}`, `پس از مصرف BOM، موجودی به ${c.stockQty - p.required} ${c.unit} رسید (حداقل: ${c.minStock}).`, 'WARNING', { entityType: 'INVENTORY', entityId: c.id, linkView: 'inventory' })
      }
    }

    await audit(req, user, 'INVENTORY_BOM_CONSUME', {
      entityType: 'BOM', entityId: bom.id, entityCode: bom.productRevision.product.code,
      newValues: { bomRevision: bom.revision, count: body.count, reason: body.reason, items: consumed },
    })
    await notifyRole('PRODUCTION_MGR', `مصرف BOM ثبت شد — ${bom.productRevision.product.name}`, `${body.count} مجموعه از BOM r${bom.revision} از انبار کسر شد. دلیل: ${body.reason}`, 'INFO', { entityType: 'INVENTORY', entityId: bom.id, linkView: 'inventory' })
    return ok({ success: true, consumed })
  }

  throw faError('اقدام نامعتبر است.')
})
