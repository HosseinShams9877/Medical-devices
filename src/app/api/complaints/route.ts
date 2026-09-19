import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('service.view')) throw faError('مجوز ندارید.', 403)
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || undefined
  const q = sp.get('q') || undefined

  const complaints = await db.complaint.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ code: { contains: q } }, { description: { contains: q } }, { customer: { name: { contains: q } } }] } : {}),
    },
    include: {
      customer: { select: { code: true, name: true } },
      device: { select: { id: true, serial: true, status: true } },
      approvedBy: { select: { fullName: true } },
      regulatoryReviewer: { select: { fullName: true } },
      ticket: { select: { code: true, status: true } },
    },
    orderBy: { receivedAt: 'desc' },
  })
  const customers = await db.customer.findMany({ select: { id: true, code: true, name: true } })
  return ok({ complaints, customers })
})

const schema = z.object({
  customerId: z.string(),
  deviceId: z.string().optional().nullable(),
  description: z.string().min(5, 'شرح شکایت حداقل ۵ نویسه باشد').max(3000),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  safetyImpact: z.enum(['NO', 'UNKNOWN', 'YES']).default('NO'),
  ticketId: z.string().optional().nullable(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('service.complaint.create')) throw faError('شما مجوز ثبت شکایت را ندارید.', 403)
  const body = await readJson(req, schema)

  const customer = await db.customer.findUnique({ where: { id: body.customerId } })
  if (!customer) throw faError('مشتری یافت نشد.', 404)
  let device = null
  if (body.deviceId) {
    device = await db.device.findUnique({ where: { id: body.deviceId } })
    if (!device) throw faError('دستگاه یافت نشد.', 404)
  }

  const code = `CMP-1404-${String((await db.complaint.count()) + 1).padStart(3, '0')}`
  const clash = await db.complaint.findUnique({ where: { code } })
  const finalCode = clash ? `CMP-1404-${Date.now().toString().slice(-5)}` : code

  // اثر احتمالی بر ایمنی یا شدت بالا → صف بررسی رگولاتوری (تصمیم با انسان، نه سیستم)
  const needsRegulatory = body.safetyImpact !== 'NO' || ['HIGH', 'CRITICAL'].includes(body.severity)

  const complaint = await db.complaint.create({
    data: {
      code: finalCode, customerId: customer.id, deviceId: device?.id, description: body.description,
      severity: body.severity, safetyImpact: body.safetyImpact, ticketId: body.ticketId,
      status: 'OPEN', createdById: user.id,
      regulatoryReviewStatus: needsRegulatory ? 'PENDING' : null,
    },
  })

  if (needsRegulatory) {
    await notifyRole('QC', `شکایت نیازمند بررسی رگولاتوری — ${finalCode}`, `شکایت ${customer.name} با شدت ${body.severity} ثبت شد. سیستم تصمیم نمی‌گیرد؛ بررسی توسط فرد واجد صلاحیت لازم است.`, 'CRITICAL', { entityType: 'COMPLAINT', entityId: complaint.id, linkView: 'service' })
    await notifyRole('ADMIN', `شکایت مهم — ${finalCode}`, 'شکایت با اثر احتمالی بر ایمنی ثبت شد.', 'CRITICAL', { entityType: 'COMPLAINT', entityId: complaint.id, linkView: 'service' })
  }
  await audit(req, user, 'COMPLAINT_CREATE', {
    entityType: 'COMPLAINT', entityId: complaint.id, entityCode: finalCode,
    newValues: { customer: customer.name, device: device?.serial, severity: body.severity, safetyImpact: body.safetyImpact, needsRegulatory },
  })
  return ok({ complaint })
})
