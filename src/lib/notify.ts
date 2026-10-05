// ─────────────────────────────────────────────────────────────
// Notification — اعلان‌های نقش‌محور
// ─────────────────────────────────────────────────────────────
import { db } from '@/lib/db'

export async function notifyRole(
  role: string,
  title: string,
  body: string,
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL' = 'INFO',
  link?: { entityType: string; entityId: string; linkView: string },
): Promise<void> {
  try {
    await db.notification.create({
      data: {
        targetRole: role,
        title,
        body,
        severity,
        entityType: link?.entityType,
        entityId: link?.entityId,
        linkView: link?.linkView,
      },
    })
  } catch (e) {
    console.error('NOTIFY_FAIL', e)
  }
}

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL' = 'INFO',
  link?: { entityType: string; entityId: string; linkView: string },
): Promise<void> {
  try {
    await db.notification.create({
      data: {
        targetUserId: userId,
        title,
        body,
        severity,
        entityType: link?.entityType,
        entityId: link?.entityId,
        linkView: link?.linkView,
      },
    })
  } catch (e) {
    console.error('NOTIFY_FAIL', e)
  }
}

export const notify = notifyRole
