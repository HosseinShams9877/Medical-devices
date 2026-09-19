import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('service.view') && !user.permissions.includes('inventory.view')) throw faError('مجوز ندارید.', 403)
  const sp = req.nextUrl.searchParams
  const q = sp.get('q') || undefined
  const repairs = await db.repair.findMany({
    where: q ? { OR: [{ code: { contains: q } }, { device: { serial: { contains: q } } }, { diagnosis: { contains: q } }, { ticket: { code: { contains: q } } }] } : {},
    include: {
      device: { include: { product: { select: { code: true, name: true } } } },
      ticket: { select: { code: true, status: true, customer: { select: { name: true } } } },
      technician: { select: { id: true, fullName: true } },
      qcVerifiedBy: { select: { fullName: true } },
      parts: { include: { component: { select: { code: true, name: true, unit: true } } } },
    },
    orderBy: { performedAt: 'desc' },
  })
  const devices = await db.device.findMany({
    where: { status: { in: ['DELIVERED', 'RELEASED', 'QC_FAIL'] } },
    select: { id: true, serial: true, status: true, product: { select: { code: true, name: true } }, customer: { select: { name: true } } },
  })
  const tickets = await db.serviceTicket.findMany({ where: { status: { in: ['DIAGNOSING', 'REPAIRING', 'TESTING', 'WAITING_PART', 'ASSIGNED'] } }, select: { id: true, code: true, deviceId: true } })
  const technicians = await db.user.findMany({ where: { role: { in: ['TECHNICIAN', 'SERVICE_MGR'] }, status: 'ACTIVE' }, select: { id: true, fullName: true } })
  const components = await db.component.findMany({ where: { active: true }, select: { id: true, code: true, name: true, stockQty: true, reservedQty: true, unit: true, criticality: true } })
  return ok({ repairs, devices, tickets, technicians, components })
})

const schema = z.object({
  ticketId: z.string().optional().nullable(),
  deviceId: z.string(),
  technicianId: z.string(),
  diagnosis: z.string().max(2000).optional(),
  failureMode: z.string().max(200).optional(),
  rootCause: z.string().max(2000).optional(),
  action: z.string().min(3, 'شرح اقدام الزامی است').max(2000),
  result: z.enum(['FIXED', 'PARTIAL', 'NOT_FIXED', 'REPLACED_DEVICE']).default('FIXED'),
  notes: z.string().max(3000).optional(),
  qcRequired: z.boolean().default(false),
  parts: z.array(z.object({
    componentId: z.string(),
    qty: z.number().positive().max(1000),
    oldPart: z.string().max(200).optional(),
    newPart: z.string().max(200).optional(),
  })).default([]),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('service.update')) throw faError('شما مجوز ثبت تعمیر را ندارید.', 403)
  const body = await readJson(req, schema)

  const device = await db.device.findUnique({ where: { id: body.deviceId }, include: { product: true } })
  if (!device) throw faError('دستگاه یافت نشد.', 404)
  const technician = await db.user.findUnique({ where: { id: body.technicianId } })
  if (!technician) throw faError('تکنسین یافت نشد.', 404)

  if (body.ticketId) {
    const ticket = await db.serviceTicket.findUnique({ where: { id: body.ticketId } })
    if (!ticket) throw faError('تیکت یافت نشد.', 404)
    if (['CLOSED'].includes(ticket.status)) throw faError('ثبت تعمیر برای تیکت بسته‌شده مجاز نیست.')
  }

  // اعتبارسنجی و رزرو قطعات
  for (const part of body.parts) {
    const comp = await db.component.findUnique({ where: { id: part.componentId } })
    if (!comp) throw faError('قطعه یافت نشد.', 404)
    const available = comp.stockQty - comp.reservedQty
    if (part.qty > available) {
      throw faError(`موجودی کافی نیست: «${comp.name}» — قابل استفاده ${available} ${comp.unit}، درخواست ${part.qty}.`)
    }
  }

  const code = `REP-1404-${String((await db.repair.count()) + 1).padStart(3, '0')}`
  const clash = await db.repair.findUnique({ where: { code } })
  const finalCode = clash ? `REP-1404-${Date.now().toString().slice(-5)}` : code

  const repair = await db.repair.create({
    data: {
      code: finalCode, ticketId: body.ticketId, deviceId: device.id, technicianId: body.technicianId,
      diagnosis: body.diagnosis, failureMode: body.failureMode, rootCause: body.rootCause,
      action: body.action, result: body.result, notes: body.notes, qcRequired: body.qcRequired,
    },
  })

  // مصرف قطعات + ردیابی دوسویه (سرویس)
  for (const part of body.parts) {
    const comp = await db.component.findUnique({ where: { id: part.componentId } })
    if (!comp) continue
    let remaining = part.qty
    const lots = await db.componentLot.findMany({ where: { componentId: comp.id, status: 'APPROVED', remaining: { gt: 0 } }, orderBy: { receivedAt: 'asc' } })
    for (const lot of lots) {
      if (remaining <= 0) break
      const take = Math.min(lot.remaining, remaining)
      await db.componentLot.update({ where: { id: lot.id }, data: { remaining: { decrement: take } } })
      await db.repairPart.create({
        data: { repairId: repair.id, componentId: comp.id, lotId: lot.id, lotNumber: lot.lotNumber, qty: take, oldPart: part.oldPart, newPart: part.newPart },
      })
      await db.devicePartUsage.create({
        data: { deviceId: device.id, componentId: comp.id, lotId: lot.id, lotNumber: lot.lotNumber, qty: take, source: 'SERVICE', repairId: repair.id, usedById: user.id },
      })
      remaining -= take
    }
    if (remaining > 0) {
      await db.repairPart.create({ data: { repairId: repair.id, componentId: comp.id, qty: remaining, oldPart: part.oldPart, newPart: part.newPart } })
      await db.devicePartUsage.create({ data: { deviceId: device.id, componentId: comp.id, qty: remaining, source: 'SERVICE', repairId: repair.id, usedById: user.id } })
    }
    await db.component.update({ where: { id: comp.id }, data: { stockQty: { decrement: part.qty } } })
  }

  // ثبت در تاریخچه تیکت
  if (body.ticketId) {
    await db.ticketUpdate.create({
      data: { ticketId: body.ticketId, userId: user.id, text: `تعمیر ${finalCode} ثبت شد — نتیجه: ${body.result}. قطعات: ${body.parts.length ? body.parts.length + ' قلم' : 'بدون تعویض قطعه'}` },
    })
  }

  if (body.qcRequired) {
    await notifyRole('QC', 'نیازمند تأیید QC', `تعمیر ${finalCode} روی دستگاه ${device.serial} نیازمند تأیید QC است.`, 'WARNING', { entityType: 'REPAIR', entityId: repair.id, linkView: 'service' })
  }

  await audit(req, user, 'REPAIR_CREATE', {
    entityType: 'REPAIR', entityId: repair.id, entityCode: finalCode,
    newValues: { device: device.serial, technician: technician.fullName, result: body.result, parts: body.parts.map((p) => ({ componentId: p.componentId, qty: p.qty })) },
  })
  return ok({ repair })
})
