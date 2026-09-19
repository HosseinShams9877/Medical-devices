import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePerm, withApi, ok } from '@/lib/api'

// Audit Trail — فقط مشاهده؛ حذف/ویرایش API ندارد (Append-Only)
export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'audit.view')
  const sp = req.nextUrl.searchParams
  const action = sp.get('action') || undefined
  const entityType = sp.get('entityType') || undefined
  const q = sp.get('q') || undefined
  const userId = sp.get('userId') || undefined
  const days = parseInt(sp.get('days') || '0')

  const logs = await db.auditLog.findMany({
    where: {
      ...(action ? { action: { contains: action } } : {}),
      ...(entityType ? { entityType } : {}),
      ...(userId ? { userId } : {}),
      ...(q ? { OR: [{ username: { contains: q } }, { entityCode: { contains: q } }, { action: { contains: q } }] } : {}),
      ...(days > 0 ? { createdAt: { gte: new Date(Date.now() - days * 86400000) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return ok({ logs })
})
