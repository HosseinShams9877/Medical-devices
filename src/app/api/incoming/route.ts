import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'
import { recordMovement } from '@/lib/stock'

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('inventory.view') && !user.permissions.includes('qc.view')) {
    throw faError('شما مجوز مشاهده کنترل ورودی را ندارید.', 403)
  }
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || undefined
  const inspections = await db.incomingInspection.findMany({
    where: status ? { status } : {},
    include: {
      component: { select: { code: true, name: true, unit: true, criticality: true } },
      lot: { select: { lotNumber: true, status: true } },
      inspector: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ inspections })
})

const schema = z.object({
  action: z.literal('decide'),
  inspectionId: z.string(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('qc.incoming.decide')) throw faError('فقط مسئول کنترل کیفیت مجاز به تصمیم کنترل ورودی است.', 403)
  const body = await readJson(req, schema)

  const insp = await db.incomingInspection.findUnique({ where: { id: body.inspectionId }, include: { lot: true, component: true } })
  if (!insp) throw faError('بررسی ورودی یافت نشد.', 404)
  if (insp.status !== 'PENDING') throw faError('برای این رسید قبلاً تصمیم ثبت شده است. تصمیم‌های قبلی قابل تغییر نیستند.')

  if (body.decision === 'APPROVED') {
    await db.$transaction(async (tx) => {
      const claim = await tx.incomingInspection.updateMany({ where: { id: insp.id, status: 'PENDING' }, data: { status: 'APPROVED', inspectorId: user.id, inspectedAt: new Date(), decisionNote: body.note } })
      if (!claim.count) throw faError('این رسید قبلاً تعیین تکلیف شده است.', 409)
      await tx.componentLot.update({ where: { id: insp.lotId ?? '' }, data: { status: 'APPROVED' } })
      const current = await tx.component.findUniqueOrThrow({ where: { id: insp.componentId } })
      await tx.component.update({ where: { id: insp.componentId }, data: { stockQty: { increment: insp.qty } } })
      await recordMovement({ componentId: insp.componentId, lotId: insp.lotId, lotNumber: insp.lot?.lotNumber,
        type: 'IQC_APPROVE', qty: insp.qty, beforeQty: current.stockQty, afterQty: current.stockQty + insp.qty,
        reason: `ورود به موجودی قابل مصرف پس از تأیید IQC — ${insp.code}`, userId: user.id }, tx)
    })
    await audit(req, user, 'IQC_APPROVE', { entityType: 'COMPONENT', entityId: insp.componentId, entityCode: insp.component.code, newValues: { lot: insp.lot?.lotNumber, qty: insp.qty, note: body.note } })
    return ok({ success: true })
  }

  // لات ردشده هرگز به موجودی قابل مصرف وارد نشده است.
  const ncrCode = `NCR-${randomUUID()}`
  await db.$transaction(async (tx) => {
    const claim = await tx.incomingInspection.updateMany({ where: { id: insp.id, status: 'PENDING' }, data: { status: 'REJECTED', inspectorId: user.id, inspectedAt: new Date(), decisionNote: body.note, ncrId: ncrCode } })
    if (!claim.count) throw faError('این رسید قبلاً تعیین تکلیف شده است.', 409)
    await tx.componentLot.update({ where: { id: insp.lotId ?? '' }, data: { status: 'REJECTED', remaining: 0 } })
    await tx.nonconformity.create({ data: {
      code: ncrCode, type: 'MATERIAL', source: 'INCOMING', componentId: insp.componentId, lotId: insp.lotId,
      title: `رد لات ${insp.lot?.lotNumber} در کنترل ورودی`,
      description: body.note || `لات ${insp.lot?.lotNumber} از قطعه ${insp.component.name} در کنترل ورودی رد شد.`,
      severity: insp.component.criticality === 'CRITICAL' ? 'HIGH' : 'MEDIUM', detectedById: user.id,
    } })
  })
  await audit(req, user, 'IQC_REJECT', { entityType: 'COMPONENT', entityId: insp.componentId, entityCode: insp.component.code, newValues: { lot: insp.lot?.lotNumber, qty: insp.qty, ncr: ncrCode } })
  await notifyRole('WAREHOUSE', `لات رد شد — ${insp.component.name}`, `لات ${insp.lot?.lotNumber} رد شد و وارد موجودی قابل مصرف نشد. NCR ${ncrCode} ایجاد شد.`, 'WARNING', { entityType: 'INVENTORY', entityId: insp.id, linkView: 'inventory' })
  return ok({ success: true })
})
