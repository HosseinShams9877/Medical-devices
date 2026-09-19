import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'

export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'bom.view')
  const products = await db.product.findMany({
    include: {
      revisions: { orderBy: { createdAt: 'asc' }, include: { _count: { select: { boms: true, devices: true, orders: true } } } },
      _count: { select: { devices: true, orders: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return ok({ products })
})

const createSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  warrantyMonths: z.number().int().min(0).max(120).default(12),
  hasFirmware: z.boolean().default(false),
  revision: z.string().min(1).max(5).default('A'),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'product.manage')
  const body = await readJson(req, createSchema)
  const clash = await db.product.findUnique({ where: { code: body.code } })
  if (clash) throw faError('کد محصول تکراری است.')

  const product = await db.product.create({
    data: {
      code: body.code, name: body.name, description: body.description, category: body.category,
      warrantyMonths: body.warrantyMonths, hasFirmware: body.hasFirmware,
      revisions: { create: { revision: body.revision, isActive: true } },
    },
  })
  await audit(req, user, 'PRODUCT_CREATE', { entityType: 'PRODUCT', entityId: product.id, entityCode: product.code, newValues: { name: body.name, revision: body.revision } })
  return ok({ product })
})
