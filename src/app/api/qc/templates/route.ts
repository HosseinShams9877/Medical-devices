import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('qc.view') && !user.permissions.includes('production.view')) throw faError('مجوز ندارید.', 403)
  const templates = await db.testTemplate.findMany({
    where: { active: true },
    include: { equipment: { select: { code: true, name: true, status: true } } },
    orderBy: [{ stage: 'asc' }, { code: 'asc' }],
  })
  const equipment = await db.equipment.findMany({ orderBy: { code: 'asc' } })
  return ok({ templates, equipment })
})

const schema = z.object({
  action: z.enum(['create', 'deactivate']).default('create'),
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(200),
  stage: z.enum(['INCOMING', 'IN_PROCESS', 'FINAL']),
  parameterName: z.string().min(1).max(100),
  unit: z.string().max(30).optional(),
  criteria: z.string().max(200).optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  targetValue: z.number().nullable().optional(),
  required: z.boolean().default(true),
  equipmentId: z.string().optional().nullable(),
  productRevisionId: z.string().optional().nullable(),
  componentId: z.string().optional().nullable(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('qc.template.manage')) throw faError('فقط QC مجاز به مدیریت قالب‌های تست است.', 403)
  const body = await readJson(req, schema)

  if (body.action === 'deactivate') {
    const tpl = await db.testTemplate.findUnique({ where: { code: body.code } })
    if (!tpl) throw faError('قالب تست یافت نشد.', 404)
    await db.testTemplate.update({ where: { code: body.code }, data: { active: false } })
    await audit(req, user, 'TEST_TEMPLATE_DEACTIVATE', { entityType: 'TEMPLATE', entityCode: body.code, oldValues: { active: true }, newValues: { active: false } })
    return ok({ success: true })
  }

  const clash = await db.testTemplate.findUnique({ where: { code: body.code } })
  if (clash) throw faError('کد قالب تست تکراری است.')

  const tpl = await db.testTemplate.create({
    data: {
      code: body.code, name: body.name, stage: body.stage, parameterName: body.parameterName,
      unit: body.unit, criteria: body.criteria, minValue: body.minValue ?? null, maxValue: body.maxValue ?? null,
      targetValue: body.targetValue ?? null, required: body.required, equipmentId: body.equipmentId ?? null,
      productRevisionId: body.productRevisionId ?? null, componentId: body.componentId ?? null,
    },
  })
  await audit(req, user, 'TEST_TEMPLATE_CREATE', { entityType: 'TEMPLATE', entityCode: tpl.code, newValues: { name: body.name, stage: body.stage } })
  return ok({ template: tpl })
})
