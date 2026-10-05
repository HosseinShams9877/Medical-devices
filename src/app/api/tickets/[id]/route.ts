import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { allowedTransitions, TICKET_TRANSITIONS, evaluateGuard } from '@/lib/workflow'
import { hasPerm } from '@/lib/rbac'
import { notifyRole, notifyUser } from '@/lib/notify'

// ─── GET /api/tickets/[id] — جزئیات تیکت ───
export const GET = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('service.view')) throw faError('مجوز ندارید.', 403)
  const { id } = await ctx.params
  const ticket = await db.serviceTicket.findUnique({
    where: { id },
    include: {
      customer: true,
      device: { include: { product: { select: { code: true, name: true } }, productRevision: { select: { revision: true } } } },
      assignedTechnician: { select: { id: true, fullName: true } },
      updates: { include: { user: { select: { fullName: true, role: true } } }, orderBy: { createdAt: 'asc' } },
      repairs: { include: { technician: { select: { fullName: true } }, parts: { include: { component: { select: { code: true, name: true } } } } } },
      complaint: true,
    },
  })
  if (!ticket) throw faError('تیکت یافت نشد.', 404)
  const transitions = await allowedTransitions('ticket', ticket.status, user.role, ticket.id)
  const technicians = await db.user.findMany({ where: { role: { in: ['TECHNICIAN', 'SERVICE_MGR'] }, status: 'ACTIVE' }, select: { id: true, fullName: true, role: true } })
  return ok({ ticket, transitions, technicians })
})

// ─── POST /api/tickets/[id] — اقدامات ───
const schema = z.object({
  action: z.enum(['transition', 'assign', 'comment', 'close']),
  to: z.string().optional(),
  technicianId: z.string().optional(),
  text: z.string().max(3000).optional(),
  internal: z.boolean().optional(),
  resolutionNote: z.string().max(2000).optional(),
})

export const POST = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const body = await readJson(req, schema)
  const ticket = await db.serviceTicket.findUnique({ where: { id }, include: { customer: true, device: true } })
  if (!ticket) throw faError('تیکت یافت نشد.', 404)

  if (body.action === 'assign') {
    if (!user.permissions.includes('service.assign')) throw faError('فقط مدیر خدمات مجاز به ارجاع است.', 403)
    const tech = await db.user.findUnique({ where: { id: body.technicianId ?? '' } })
    if (!tech || !['TECHNICIAN', 'SERVICE_MGR'].includes(tech.role)) throw faError('کاربر انتخابی تکنسین معتبر نیست.')
    await db.serviceTicket.update({ where: { id }, data: { assignedTechnicianId: tech.id, status: ticket.status === 'NEW' || ticket.status === 'REVIEWING' ? 'ASSIGNED' : ticket.status } })
    await db.ticketUpdate.create({ data: { ticketId: id, userId: user.id, text: `ارجاع به ${tech.fullName}` } })
    await notifyUser(tech.id, 'تیکت جدید به شما ارجاع شد', `${ticket.code} — ${ticket.customer.name}: ${ticket.problem.slice(0, 80)}`, 'WARNING', { entityType: 'TICKET', entityId: id, linkView: 'service' })
    await audit(req, user, 'TICKET_ASSIGN', { entityType: 'TICKET', entityId: id, entityCode: ticket.code, oldValues: { technicianId: ticket.assignedTechnicianId }, newValues: { technicianId: tech.id, technician: tech.fullName } })
    return ok({ success: true })
  }

  if (body.action === 'comment') {
    if (!user.permissions.includes('service.update') && !user.permissions.includes('service.assign')) throw faError('مجوز به‌روزرسانی ندارید.', 403)
    if (!body.text) throw faError('متن یادداشت الزامی است.')
    await db.ticketUpdate.create({ data: { ticketId: id, userId: user.id, text: body.text, internal: body.internal ?? false } })
    await audit(req, user, 'TICKET_COMMENT', { entityType: 'TICKET', entityId: id, entityCode: ticket.code, newValues: { text: body.text, internal: body.internal } })
    return ok({ success: true })
  }

  if (body.action === 'close') {
    if (!user.permissions.includes('service.close')) throw faError('فقط مدیر خدمات مجاز به بستن تیکت است.', 403)
    if (ticket.status === 'CLOSED') throw faError('تیکت قبلاً بسته شده است.')
    await db.serviceTicket.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date(), closedById: user.id, resolvedAt: ticket.resolvedAt ?? new Date() } })
    if (body.resolutionNote) {
      await db.ticketUpdate.create({ data: { ticketId: id, userId: user.id, text: `بستن تیکت: ${body.resolutionNote}` } })
    }
    await audit(req, user, 'TICKET_CLOSE', { entityType: 'TICKET', entityId: id, entityCode: ticket.code, oldValues: { status: ticket.status }, newValues: { status: 'CLOSED', note: body.resolutionNote } })
    return ok({ success: true })
  }

  // transition
  const to = body.to ?? ''
  const defs = TICKET_TRANSITIONS[ticket.status] ?? []
  const def = defs.find((t) => t.to === to)
  if (!def) throw faError('این گذار در گردش‌کار تیکت مجاز نیست.')
  if (!hasPerm(user.role, def.perm)) throw faError('مجوز این تغییر وضعیت را ندارید.', 403)
  // تکنسین فقط روی تیکت خودش
  if (user.role === 'TECHNICIAN' && ticket.assignedTechnicianId !== user.id) {
    throw faError('شما فقط می‌توانید تیکت‌های ارجاع‌شده به خودتان را به‌روزرسانی کنید.', 403)
  }
  if (def.guard) {
    const g = await evaluateGuard('ticket', def.guard, ticket.id)
    if (!g.ok) throw faError(`امکان تغییر وضعیت وجود ندارد: ${g.reason}`)
  }

  const extra: Record<string, unknown> = {}
  if (to === 'RESOLVED') extra.resolvedAt = new Date()
  if (to === 'CLOSED') { extra.closedAt = new Date(); extra.closedById = user.id }
  await db.serviceTicket.update({ where: { id }, data: { status: to, ...extra } })
  if (body.text) await db.ticketUpdate.create({ data: { ticketId: id, userId: user.id, text: body.text } })

  await audit(req, user, 'TICKET_TRANSITION', { entityType: 'TICKET', entityId: id, entityCode: ticket.code, oldValues: { status: ticket.status }, newValues: { status: to } })
  if (to === 'RESOLVED') {
    await notifyRole('SERVICE_MGR', 'مشکل رفع شد', `تیکت ${ticket.code} (${ticket.customer.name}) به وضعیت رفع‌شده رسید — در انتظار بستن.`, 'SUCCESS', { entityType: 'TICKET', entityId: id, linkView: 'service' })
  }
  return ok({ success: true, status: to })
})
