import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'

function warrantyOf(dev: { deliveredAt: Date | null; warrantyOverride: { status: string; reason: string; setAt: Date } | null }, product: { warrantyMonths: number }) {
  if (dev.warrantyOverride) {
    return { status: dev.warrantyOverride.status, reason: dev.warrantyOverride.reason, source: 'override', endDate: null, months: product.warrantyMonths }
  }
  if (!dev.deliveredAt) return { status: 'UNKNOWN', reason: 'تحویل ثبت نشده', source: 'computed', endDate: null, months: product.warrantyMonths }
  const months = product.warrantyMonths
  const end = new Date(dev.deliveredAt)
  end.setMonth(end.getMonth() + months)
  const status = end >= new Date() ? 'IN_WARRANTY' : 'OUT_OF_WARRANTY'
  return { status, reason: end >= new Date() ? `تا ${end.toLocaleDateString('fa-IR')}` : `منقضی از ${end.toLocaleDateString('fa-IR')}`, source: 'computed', endDate: end.toISOString(), months }
}

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('device.view') && !user.permissions.includes('service.view')) throw faError('مجوز ندارید.', 403)
  const devices = await db.device.findMany({
    where: { OR: [{ status: 'DELIVERED' }, { deliveredAt: { not: null } }] },
    include: {
      product: { select: { code: true, name: true, warrantyMonths: true } },
      productRevision: { select: { revision: true } },
      customer: { select: { code: true, name: true } },
      warrantyOverride: true,
      _count: { select: { repairs: true, tickets: true, complaints: true } },
    },
    orderBy: { deliveredAt: 'desc' },
  })
  const result = devices.map((d) => ({ ...d, warranty: warrantyOf(d, d.product) }))
  return ok({ devices: result })
})

const schema = z.object({
  action: z.literal('override'),
  deviceId: z.string(),
  status: z.enum(['IN_WARRANTY', 'OUT_OF_WARRANTY', 'UNKNOWN']),
  reason: z.string().min(5, 'دلیل تغییر الزامی است').max(2000),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('service.warranty.override')) throw faError('تغییر دستی وضعیت گارانتی فقط برای کاربران مجاز ممکن است.', 403)
  const body = await readJson(req, schema)

  const device = await db.device.findUnique({ where: { id: body.deviceId }, include: { product: true, warrantyOverride: true } })
  if (!device) throw faError('دستگاه یافت نشد.', 404)

  const oldStatus = warrantyOf(device, device.product).status
  await db.warrantyOverride.upsert({
    where: { deviceId: device.id },
    create: { deviceId: device.id, status: body.status, reason: body.reason, setById: user.id },
    update: { status: body.status, reason: body.reason, setById: user.id, setAt: new Date() },
  })
  await audit(req, user, 'WARRANTY_OVERRIDE', {
    entityType: 'DEVICE', entityId: device.id, entityCode: device.serial,
    oldValues: { status: oldStatus }, newValues: { status: body.status, reason: body.reason, by: user.fullName },
  })
  return ok({ success: true })
})
