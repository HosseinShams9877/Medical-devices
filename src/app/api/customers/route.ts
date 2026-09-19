import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'

export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'customer.view')
  const sp = req.nextUrl.searchParams
  const q = sp.get('q') || undefined
  const customers = await db.customer.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }, { contactPerson: { contains: q } }, { city: { contains: q } }] } : {},
    include: { _count: { select: { devices: true, tickets: true, complaints: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return ok({ customers })
})

const schema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(200),
  type: z.enum(['HOSPITAL', 'CLINIC', 'DISTRIBUTOR', 'OTHER']).default('HOSPITAL'),
  contactPerson: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email('ایمیل معتبر نیست').optional().or(z.literal('')),
  city: z.string().max(60).optional(),
  address: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'customer.create')
  const body = await readJson(req, schema)
  const clash = await db.customer.findUnique({ where: { code: body.code } })
  if (clash) throw faError('کد مشتری تکراری است.')

  const customer = await db.customer.create({
    data: {
      code: body.code, name: body.name, type: body.type, contactPerson: body.contactPerson,
      phone: body.phone, email: body.email || null, city: body.city, address: body.address, notes: body.notes,
    },
  })
  await audit(req, user, 'CUSTOMER_CREATE', { entityType: 'CUSTOMER', entityId: customer.id, entityCode: customer.code, newValues: { name: body.name, type: body.type } })
  return ok({ customer })
})
