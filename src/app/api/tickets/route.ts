import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole, notifyUser } from '@/lib/notify'

export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'service.view')
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || undefined
  const q = sp.get('q') || undefined
  const customerId = sp.get('customerId') || undefined
  const mine = sp.get('mine') === '1'

  const tickets = await db.serviceTicket.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(q ? { OR: [{ code: { contains: q } }, { problem: { contains: q } }, { device: { serial: { contains: q } } }, { customer: { name: { contains: q } } }] } : {}),
    },
    include: {
      customer: { select: { code: true, name: true, city: true } },
      device: { select: { id: true, serial: true, status: true, product: { select: { code: true, name: true } } } },
      assignedTechnician: { select: { id: true, fullName: true } },
      _count: { select: { repairs: true, updates: true } },
    },
    orderBy: { receivedAt: 'desc' },
  })
  const technicians = await db.user.findMany({ where: { role: { in: ['TECHNICIAN', 'SERVICE_MGR'] }, status: 'ACTIVE' }, select: { id: true, fullName: true, role: true } })
  const customers = await db.customer.findMany({ select: { id: true, code: true, name: true } })
  const result = mine ? tickets.filter((t) => t.assignedTechnicianId) : tickets
  return ok({ tickets: result, technicians, customers })
})

const schema = z.object({
  customerId: z.string(),
  deviceId: z.string().optional().nullable(),
  deviceSerialText: z.string().max(100).optional(),
  contactPhone: z.string().max(30).optional(),
  problem: z.string().min(5, 'شرح مشکل حداقل ۵ نویسه باشد').max(2000),
  category: z.string().max(100).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  notes: z.string().max(2000).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'service.create')
  const body = await readJson(req, schema)

  const customer = await db.customer.findUnique({ where: { id: body.customerId } })
  if (!customer) throw faError('مشتری یافت نشد.', 404)

  let device = null
  if (body.deviceId) {
    device = await db.device.findUnique({ where: { id: body.deviceId } })
    if (!device) throw faError('دستگاه یافت نشد.', 404)
  }

  const code = `ST-1404-${String((await db.serviceTicket.count()) + 1).padStart(3, '0')}`
  const clash = await db.serviceTicket.findUnique({ where: { code } })
  const finalCode = clash ? `ST-1404-${Date.now().toString().slice(-5)}` : code

  const ticket = await db.serviceTicket.create({
    data: {
      code: finalCode, customerId: customer.id, deviceId: device?.id, deviceSerialText: body.deviceSerialText,
      contactPhone: body.contactPhone ?? customer.phone, problem: body.problem, category: body.category,
      priority: body.priority, status: 'NEW', createdById: user.id, notes: body.notes,
      updates: { create: { userId: user.id, text: `تیکت توسط ${user.fullName} ثبت شد.` } },
    },
  })

  if (body.priority === 'URGENT') {
    await notifyRole('SERVICE_MGR', 'تیکت فوری جدید', `${finalCode} — ${customer.name}: ${body.problem.slice(0, 80)}`, 'CRITICAL', { entityType: 'TICKET', entityId: ticket.id, linkView: 'service' })
  } else {
    await notifyRole('SERVICE_MGR', 'تیکت خدمات جدید', `${finalCode} — ${customer.name}`, 'INFO', { entityType: 'TICKET', entityId: ticket.id, linkView: 'service' })
  }
  if (device) {
    await notifyRole('QC', 'تیکت مرتبط با دستگاه تولیدی', `${finalCode} برای دستگاه ${device.serial} ثبت شد.`, 'INFO', { entityType: 'TICKET', entityId: ticket.id, linkView: 'service' })
  }

  await audit(req, user, 'TICKET_CREATE', { entityType: 'TICKET', entityId: ticket.id, entityCode: finalCode, newValues: { customer: customer.name, device: device?.serial, priority: body.priority } })
  return ok({ ticket })
})
