import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePerm, withApi, ok } from '@/lib/api'

export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'device.view')
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || undefined
  const productId = sp.get('productId') || undefined
  const orderId = sp.get('orderId') || undefined
  const q = sp.get('q') || undefined
  const customerId = sp.get('customerId') || undefined

  const devices = await db.device.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(productId ? { productId } : {}),
      ...(orderId ? { orderId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(q ? { OR: [{ serial: { contains: q } }, { firmwareVersion: { contains: q } }] } : {}),
    },
    include: {
      product: { select: { code: true, name: true } },
      productRevision: { select: { revision: true } },
      order: { select: { code: true, status: true } },
      customer: { select: { code: true, name: true } },
      _count: { select: { tests: true, repairs: true, partUsages: true, ncrs: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ devices })
})
