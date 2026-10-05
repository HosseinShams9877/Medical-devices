// ─────────────────────────────────────────────────────────────
// Audit Trail — ثبت Append-Only (هرگز API حذف/ویرایش ندارد)
// ─────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'
import { clientIp } from '@/lib/auth'

export async function audit(
  req: NextRequest | null,
  user: SessionUser | null,
  action: string,
  opts: {
    entityType?: string
    entityId?: string
    entityCode?: string
    oldValues?: unknown
    newValues?: unknown
  } = {},
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: user?.id,
        username: user?.username,
        role: user?.role,
        action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        entityCode: opts.entityCode,
        oldValues: opts.oldValues !== undefined ? JSON.stringify(opts.oldValues) : undefined,
        newValues: opts.newValues !== undefined ? JSON.stringify(opts.newValues) : undefined,
        ip: req ? clientIp(req) : undefined,
        userAgent: req ? (req.headers.get('user-agent') ?? '').slice(0, 250) : undefined,
      },
    })
  } catch (e) {
    // ثبت Audit نباید جریان اصلی را متوقف کند، اما در لاگ سرور می‌ماند
    console.error('AUDIT_FAIL', action, e)
  }
}

// رویداد امنیتی (ورود ناموفق، تلاش دسترسی غیرمجاز و…)
export async function securityEvent(
  req: NextRequest | null,
  action: string,
  detail: string,
  user?: SessionUser | null,
): Promise<void> {
  await audit(req, user ?? null, action, { newValues: { detail } })
}
