import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, readJson, withApi, ok } from '@/lib/api'

export const GET = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'notifications.view')
  const notifications = await db.notification.findMany({
    where: { OR: [{ targetUserId: user.id }, { targetRole: user.role }] },
    include: { reads: { where: { userId: user.id }, select: { id: true, readAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const withRead = notifications.map((n) => ({ ...n, read: n.reads.length > 0, reads: undefined }))
  return ok({ notifications: withRead, unread: withRead.filter((n) => !n.read).length })
})

const schema = z.object({
  action: z.enum(['mark-read', 'mark-all-read']),
  ids: z.array(z.string()).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'notifications.view')
  const body = await readJson(req, schema)

  if (body.action === 'mark-read' && body.ids?.length) {
    for (const id of body.ids) {
      await db.notificationRead.upsert({
        where: { notificationId_userId: { notificationId: id, userId: user.id } },
        create: { notificationId: id, userId: user.id },
        update: {},
      })
    }
  } else if (body.action === 'mark-all-read') {
    const all = await db.notification.findMany({ where: { OR: [{ targetUserId: user.id }, { targetRole: user.role }] }, select: { id: true } })
    for (const n of all) {
      await db.notificationRead.upsert({
        where: { notificationId_userId: { notificationId: n.id, userId: user.id } },
        create: { notificationId: n.id, userId: user.id },
        update: {},
      })
    }
  }
  return ok({ success: true })
})
