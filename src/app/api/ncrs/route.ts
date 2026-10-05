import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { allowedTransitions, NCR_TRANSITIONS, evaluateGuard } from '@/lib/workflow'
import { hasPerm } from '@/lib/rbac'
import { notifyRole } from '@/lib/notify'

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('qc.view') && !user.permissions.includes('service.view')) throw faError('مجوز ندارید.', 403)
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || undefined
  const q = sp.get('q') || undefined

  const ncrs = await db.nonconformity.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ code: { contains: q } }, { title: { contains: q } }, { device: { serial: { contains: q } } }, { order: { code: { contains: q } } }] } : {}),
    },
    include: {
      device: { select: { id: true, serial: true, status: true } },
      order: { select: { id: true, code: true, status: true } },
      component: { select: { code: true, name: true } },
      reworks: { include: { performer: { select: { fullName: true } } } },
      _count: { select: { reworks: true } },
    },
    orderBy: { detectedAt: 'desc' },
  })

  const withTransitions = await Promise.all(ncrs.map(async (n) => ({
    ...n,
    transitions: await allowedTransitions('ncr', n.status, user.role, n.id),
  })))
  return ok({ ncrs: withTransitions })
})

const schema = z.object({
  action: z.enum(['update', 'transition', 'rework']),
  id: z.string(),
  title: z.string().max(200).optional(),
  description: z.string().max(3000).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  rootCause: z.string().max(3000).optional(),
  correctiveAction: z.string().max(3000).optional(),
  preventiveAction: z.string().max(3000).optional(),
  to: z.string().optional(),
  deviceId: z.string().optional(),
  reworkAction: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('qc.ncr.manage')) throw faError('شما مجوز مدیریت عدم انطباق را ندارید.', 403)
  const body = await readJson(req, schema)

  const ncr = await db.nonconformity.findUnique({ where: { id: body.id }, include: { device: true, reworks: true } })
  if (!ncr) throw faError('عدم انطباق یافت نشد.', 404)

  if (body.action === 'update') {
    const old = { title: ncr.title, severity: ncr.severity, rootCause: ncr.rootCause, correctiveAction: ncr.correctiveAction, preventiveAction: ncr.preventiveAction }
    await db.nonconformity.update({
      where: { id: ncr.id },
      data: {
        title: body.title ?? ncr.title, description: body.description ?? ncr.description,
        severity: body.severity ?? ncr.severity, rootCause: body.rootCause ?? ncr.rootCause,
        correctiveAction: body.correctiveAction ?? ncr.correctiveAction, preventiveAction: body.preventiveAction ?? ncr.preventiveAction,
      },
    })
    await audit(req, user, 'NCR_UPDATE', { entityType: 'NCR', entityId: ncr.id, entityCode: ncr.code, oldValues: old, newValues: body })
    return ok({ success: true })
  }

  if (body.action === 'rework') {
    if (!body.deviceId) throw faError('دستگاه الزامی است.')
    const device = await db.device.findUnique({ where: { id: body.deviceId } })
    if (!device) throw faError('دستگاه یافت نشد.', 404)
    if (!body.reworkAction) throw faError('شرح اقدام اصلاحی الزامی است.')
    await db.reworkRecord.create({
      data: { ncrId: ncr.id, deviceId: device.id, orderId: ncr.orderId ?? device.orderId, action: body.reworkAction, performedById: user.id, notes: body.notes },
    })
    await db.device.update({ where: { id: device.id }, data: { status: 'REWORK' } })
    await db.nonconformity.update({ where: { id: ncr.id }, data: { status: 'IN_REWORK' } })
    await audit(req, user, 'REWORK_RECORD', { entityType: 'NCR', entityId: ncr.id, entityCode: ncr.code, newValues: { device: device.serial, action: body.reworkAction } })
    await notifyRole('PRODUCTION_MGR', 'دستور Rework صادر شد', `NCR ${ncr.code} برای دستگاه ${device.serial} — ${body.reworkAction}`, 'WARNING', { entityType: 'NCR', entityId: ncr.id, linkView: 'quality' })
    return ok({ success: true })
  }

  // transition
  const to = body.to ?? ''
  const defs = NCR_TRANSITIONS[ncr.status] ?? []
  const def = defs.find((t) => t.to === to)
  if (!def) throw faError('این گذار در گردش‌کار NCR مجاز نیست.')
  if (!hasPerm(user.role, def.perm)) throw faError('مجوز این تغییر وضعیت را ندارید.', 403)
  if (def.guard) {
    const g = await evaluateGuard('ncr', def.guard, ncr.id)
    if (!g.ok) throw faError(`امکان تغییر وضعیت وجود ندارد: ${g.reason}`)
  }

  await db.nonconformity.update({
    where: { id: ncr.id },
    data: {
      status: to,
      closedById: to === 'CLOSED' ? user.id : ncr.closedById,
      closedAt: to === 'CLOSED' ? new Date() : ncr.closedAt,
    },
  })
  await audit(req, user, 'NCR_TRANSITION', { entityType: 'NCR', entityId: ncr.id, entityCode: ncr.code, oldValues: { status: ncr.status }, newValues: { status: to } })
  return ok({ success: true, status: to })
})
