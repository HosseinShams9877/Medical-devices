import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { allowedTransitions, COMPLAINT_TRANSITIONS, evaluateGuard } from '@/lib/workflow'
import { hasPerm } from '@/lib/rbac'
import { notifyRole } from '@/lib/notify'

// ─── GET /api/complaints/[id] ───
export const GET = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('service.view')) throw faError('مجوز ندارید.', 403)
  const { id } = await ctx.params
  const complaint = await db.complaint.findUnique({
    where: { id },
    include: {
      customer: true,
      device: { include: { product: { select: { code: true, name: true } } } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
      regulatoryReviewer: { select: { id: true, fullName: true, role: true } },
      ticket: { select: { id: true, code: true, status: true } },
    },
  })
  if (!complaint) throw faError('شکایت یافت نشد.', 404)
  const transitions = await allowedTransitions('complaint', complaint.status, user.role, complaint.id)
  const canRegulatory = user.permissions.includes('service.regulatory.review')
  return ok({ complaint, transitions, canRegulatory })
})

const schema = z.object({
  action: z.enum(['update', 'transition', 'regulatory']),
  rootCause: z.string().max(3000).optional(),
  correctiveAction: z.string().max(3000).optional(),
  preventiveAction: z.string().max(3000).optional(),
  resolution: z.string().max(3000).optional(),
  to: z.string().optional(),
  rejectionReason: z.string().max(2000).optional(),
  decision: z.enum(['REVIEWING', 'REPORTABLE', 'NOT_REPORTABLE']).optional(),
  note: z.string().max(3000).optional(),
})

export const POST = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const body = await readJson(req, schema)
  const complaint = await db.complaint.findUnique({ where: { id } })
  if (!complaint) throw faError('شکایت یافت نشد.', 404)

  if (body.action === 'update') {
    if (!user.permissions.includes('service.complaint.manage')) throw faError('مجوز بررسی شکایت را ندارید.', 403)
    if (['CLOSED', 'REJECTED'].includes(complaint.status)) throw faError('شکایت بسته‌شده قابل ویرایش نیست.')
    const old = { rootCause: complaint.rootCause, correctiveAction: complaint.correctiveAction, preventiveAction: complaint.preventiveAction, resolution: complaint.resolution }
    await db.complaint.update({
      where: { id },
      data: { rootCause: body.rootCause ?? complaint.rootCause, correctiveAction: body.correctiveAction ?? complaint.correctiveAction, preventiveAction: body.preventiveAction ?? complaint.preventiveAction, resolution: body.resolution ?? complaint.resolution },
    })
    await audit(req, user, 'COMPLAINT_UPDATE', { entityType: 'COMPLAINT', entityId: id, entityCode: complaint.code, oldValues: old, newValues: body })
    return ok({ success: true })
  }

  if (body.action === 'regulatory') {
    if (!user.permissions.includes('service.regulatory.review')) throw faError('بررسی رگولاتوری فقط توسط فرد مجاز (QC/مدیر سیستم) انجام می‌شود.', 403)
    if (!complaint.regulatoryReviewStatus || ['REPORTABLE', 'NOT_REPORTABLE'].includes(complaint.regulatoryReviewStatus)) {
      throw faError('بررسی رگولاتوری برای این شکایت فعال نیست یا نتیجه‌گیری شده است.')
    }
    if (!body.decision) throw faError('تصمیم الزامی است.')
    await db.complaint.update({
      where: { id },
      data: { regulatoryReviewStatus: body.decision, regulatoryReviewerId: user.id, regulatoryNote: body.note },
    })
    await audit(req, user, 'COMPLAINT_REGULATORY', {
      entityType: 'COMPLAINT', entityId: id, entityCode: complaint.code,
      oldValues: { status: complaint.regulatoryReviewStatus },
      newValues: { status: body.decision, reviewer: user.fullName, note: body.note },
    })
    await notifyRole('ADMIN', `نتیجه بررسی رگولاتوری — ${complaint.code}`, `تصمیم: ${body.decision} — توسط ${user.fullName}`, body.decision === 'REPORTABLE' ? 'CRITICAL' : 'INFO', { entityType: 'COMPLAINT', entityId: id, linkView: 'service' })
    return ok({ success: true })
  }

  // transition
  const to = body.to ?? ''
  const defs = COMPLAINT_TRANSITIONS[complaint.status] ?? []
  const def = defs.find((t) => t.to === to)
  if (!def) throw faError('این گذار در گردش‌کار شکایت مجاز نیست.')
  if (!hasPerm(user.role, def.perm)) throw faError('مجوز این تغییر وضعیت را ندارید.', 403)
  if (def.guard) {
    const g = await evaluateGuard('complaint', def.guard, complaint.id)
    if (!g.ok) throw faError(`امکان تغییر وضعیت وجود ندارد: ${g.reason}`)
  }

  const extra: Record<string, unknown> = {}
  if (to === 'CLOSED') { extra.approvedById = user.id; extra.approvedAt = new Date() }
  if (to === 'REJECTED') { extra.rejectionReason = body.rejectionReason ?? 'بدون دلیل ذکر‌شده' }
  await db.complaint.update({ where: { id }, data: { status: to, ...extra } })
  await audit(req, user, 'COMPLAINT_TRANSITION', { entityType: 'COMPLAINT', entityId: id, entityCode: complaint.code, oldValues: { status: complaint.status }, newValues: { status: to, reason: body.rejectionReason } })
  if (to === 'CLOSED') {
    await notifyRole('SERVICE_MGR', `شکایت ${complaint.code} بسته شد`, 'تأیید نهایی انجام شد.', 'SUCCESS', { entityType: 'COMPLAINT', entityId: id, linkView: 'service' })
  }
  return ok({ success: true, status: to })
})
