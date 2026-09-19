import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyPassword, createSession, checkRateLimit, clearRateLimit, clientIp } from '@/lib/auth'
import { audit, securityEvent } from '@/lib/audit'
import { withApi, readJson, ok, faError } from '@/lib/api'
import type { SessionUser } from '@/lib/auth'

const schema = z.object({
  username: z.string().min(1, 'نام کاربری الزامی است').max(60),
  password: z.string().min(1, 'رمز عبور الزامی است').max(200),
})

export const POST = withApi(async (req: NextRequest) => {
  const body = await readJson(req, schema)
  const ip = clientIp(req)
  const rlKey = `${body.username}|${ip}`

  const rl = checkRateLimit(rlKey)
  if (!rl.ok) {
    await securityEvent(req, 'SEC_LOGIN_RATE_LIMIT', `username=${body.username}`, null)
    throw faError(`تلاش‌های ناموفق زیاد بوده است. لطفاً پس از ${rl.retryAfterMin} دقیقه دوباره تلاش کنید.`, 429)
  }

  const user = await db.user.findUnique({ where: { username: body.username } })
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    await securityEvent(req, 'SEC_LOGIN_FAILED', `username=${body.username}`, null)
    throw faError('نام کاربری یا رمز عبور نادرست است.', 401)
  }
  if (user.status !== 'ACTIVE') {
    await securityEvent(req, 'SEC_LOGIN_BLOCKED', `username=${body.username} (کاربر غیرفعال)`, null)
    throw faError('حساب کاربری شما غیرفعال است. با مدیر سیستم تماس بگیرید.', 403)
  }

  await createSession(user.id, req)
  clearRateLimit(rlKey)
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  const sessionUser: SessionUser = {
    id: user.id, username: user.username, fullName: user.fullName,
    role: user.role as SessionUser['role'], permissions: [], roleLabel: '',
  }
  await audit(req, sessionUser, 'AUTH_LOGIN', { newValues: { ip } })

  return ok({ user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role } })
})
