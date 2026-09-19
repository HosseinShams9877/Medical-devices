import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('qc.view')) throw faError('مجوز ندارید.', 403)
  const equipment = await db.equipment.findMany({ orderBy: { code: 'asc' } })
  const now = Date.now()
  return ok({
    equipment: equipment.map((e) => ({
      ...e,
      daysToDue: e.calibrationDueAt ? Math.floor((new Date(e.calibrationDueAt).getTime() - now) / 86400000) : null,
    })),
  })
})

const schema = z.object({
  action: z.enum(['calibrate', 'create']),
  equipmentId: z.string().optional(),
  code: z.string().min(2).max(40).optional(),
  name: z.string().min(2).max(200).optional(),
  equipmentType: z.string().max(100).optional(),
  calibratedAt: z.string().optional(),
  calibrationDueAt: z.string().optional(),
  notes: z.string().max(1000).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('qc.equipment.manage')) throw faError('فقط QC مجاز به مدیریت تجهیزات تست است.', 403)
  const body = await readJson(req, schema)

  if (body.action === 'create') {
    if (!body.code || !body.name) throw faError('کد و نام تجهیزات الزامی است.')
    const clash = await db.equipment.findUnique({ where: { code: body.code } })
    if (clash) throw faError('کد تجهیزات تکراری است.')
    const eq = await db.equipment.create({
      data: {
        code: body.code, name: body.name, equipmentType: body.equipmentType,
        calibratedAt: body.calibratedAt ? new Date(body.calibratedAt) : null,
        calibrationDueAt: body.calibrationDueAt ? new Date(body.calibrationDueAt) : null,
        notes: body.notes, status: 'ACTIVE',
      },
    })
    await audit(req, user, 'EQUIPMENT_CREATE', { entityType: 'EQUIPMENT', entityCode: eq.code, newValues: { name: eq.name } })
    return ok({ equipment: eq })
  }

  const eq = await db.equipment.findUnique({ where: { id: body.equipmentId ?? '' } })
  if (!eq) throw faError('تجهیزات یافت نشد.', 404)
  if (!body.calibratedAt || !body.calibrationDueAt) throw faError('تاریخ کالیبراسیون و سرآمد آن الزامی است.')
  if (new Date(body.calibrationDueAt) <= new Date(body.calibratedAt)) throw faError('سرآمد کالیبراسیون باید بعد از تاریخ کالیبراسیون باشد.')

  await db.equipment.update({
    where: { id: eq.id },
    data: { calibratedAt: new Date(body.calibratedAt), calibrationDueAt: new Date(body.calibrationDueAt), status: 'ACTIVE', notes: body.notes ?? eq.notes },
  })
  await audit(req, user, 'EQUIPMENT_CALIBRATE', {
    entityType: 'EQUIPMENT', entityCode: eq.code,
    oldValues: { calibratedAt: eq.calibratedAt, calibrationDueAt: eq.calibrationDueAt, status: eq.status },
    newValues: { calibratedAt: body.calibratedAt, calibrationDueAt: body.calibrationDueAt, status: 'ACTIVE' },
  })
  return ok({ success: true })
})
