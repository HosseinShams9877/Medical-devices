import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withApi, requirePerm, readJson, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'

const schema = z.object({
  id: z.string().optional(), code: z.string().trim().min(2).max(40), name: z.string().trim().min(2).max(200),
  unit: z.string().trim().min(1).max(30), category: z.string().trim().max(100).default(''),
  manufacturer: z.string().trim().max(100).default(''), specs: z.string().max(2000).default(''),
  criticality: z.enum(['NORMAL', 'CRITICAL']).default('NORMAL'), minStock: z.number().min(0).max(1000000).default(0),
}).strict()

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'component.manage')
  const { id, ...body } = await readJson(req, schema)
  const component = await db.$transaction(async tx => {
    if (!id) {
      if (await tx.component.findUnique({ where: { code: body.code } })) throw faError('کد قطعه تکراری است.')
      return tx.component.create({ data: body })
    }
    const old = await tx.component.findUnique({ where: { id }, include: { _count: { select: { bomItems: true, lots: true, movements: true, orderMaterials: true } } } })
    if (!old) throw faError('قطعه یافت نشد.', 404)
    if (body.code !== old.code) throw faError('کد قطعه ثبت‌شده قابل تغییر نیست.')
    if (old.unit !== body.unit && (old._count.bomItems || old._count.lots || old._count.movements || old._count.orderMaterials)) throw faError('واحد قطعه دارای سابقه یا BOM قابل تغییر نیست؛ قطعه جدید تعریف کنید.')
    return tx.component.update({ where: { id }, data: body })
  })
  await audit(req, user, id ? 'COMPONENT_EDIT' : 'COMPONENT_CREATE', { entityType: 'COMPONENT', entityId: component.id, entityCode: component.code, newValues: body })
  return ok({ component })
})
