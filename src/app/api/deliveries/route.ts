import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'

const schema = z.object({
  action: z.literal('deliver'),
  deviceId: z.string(),
  customerId: z.string(),
  deliveryNote: z.string().max(200).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'device.deliver')
  const body = await readJson(req, schema)

  const device = await db.device.findUnique({ where: { id: body.deviceId }, include: { product: true } })
  if (!device) throw faError('دستگاه یافت نشد.', 404)
  if (device.status !== 'RELEASED') throw faError('فقط دستگاه آزاد‌شده قابل تحویل است. ابتدا آزادسازی QC را انجام دهید.')
  if (device.deliveredAt) throw faError('این دستگاه قبلاً تحویل شده است.')

  const customer = await db.customer.findUnique({ where: { id: body.customerId } })
  if (!customer) throw faError('مشتری یافت نشد.', 404)

  await db.device.update({
    where: { id: device.id },
    data: { customerId: customer.id, deliveredAt: new Date(), deliveredById: user.id, deliveryNote: body.deliveryNote, status: 'DELIVERED' },
  })
  await audit(req, user, 'DEVICE_DELIVER', {
    entityType: 'DEVICE', entityId: device.id, entityCode: device.serial,
    newValues: { customer: customer.code, customerName: customer.name, note: body.deliveryNote },
  })
  await notifyRole('SERVICE_MGR', 'دستگاه تحویل شد', `${device.serial} (${device.product.name}) به ${customer.name} تحویل شد — گارانتی آغاز شد.`, 'INFO', { entityType: 'DEVICE', entityId: device.id, linkView: 'device' })

  return ok({ success: true })
})
