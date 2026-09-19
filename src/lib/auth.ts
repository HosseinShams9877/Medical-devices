// ─────────────────────────────────────────────────────────────
// Authentication — هش رمز عبور (scrypt)، نشست‌های سمت سرور،
// Rate Limiting ورود، ثبت رویداد‌های امنیتی
// ─────────────────────────────────────────────────────────────
import { randomBytes, createHash } from 'crypto'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hasPerm, rolePermissions, type Permission, type Role, ROLE_LABELS } from '@/lib/rbac'

export { hashPassword, verifyPassword } from '@/lib/password'

const COOKIE_NAME = 'mdmes_session'
const SESSION_HOURS = 8

// ─── Session Management ───
export interface SessionUser {
  id: string
  username: string
  fullName: string
  role: Role
  permissions: Permission[]
  roleLabel: string
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export async function createSession(userId: string, req: NextRequest): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent') ?? undefined
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      ip,
      userAgent: userAgent?.slice(0, 250),
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3600 * 1000),
    },
  })
  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: SESSION_HOURS * 3600,
    path: '/',
  })
  return token
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: sha256(token) } })
  }
  jar.delete(COOKIE_NAME)
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  if (session.user.status !== 'ACTIVE') return null
  return {
    id: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    role: session.user.role as Role,
    permissions: rolePermissions(session.user.role),
    roleLabel: ROLE_LABELS[session.user.role as Role] ?? session.user.role,
  }
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'internal'
  )
}

// ─── Login Rate Limiting (in-memory, per username+IP) ───
const attempts = new Map<string, { count: number; first: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8

export function checkRateLimit(key: string): { ok: boolean; retryAfterMin?: number } {
  const now = Date.now()
  const rec = attempts.get(key)
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now })
    return { ok: true }
  }
  rec.count++
  if (rec.count > MAX_ATTEMPTS) {
    return { ok: false, retryAfterMin: Math.ceil((WINDOW_MS - (now - rec.first)) / 60000) }
  }
  return { ok: true }
}

export function clearRateLimit(key: string) {
  attempts.delete(key)
}

// ─── Guards برای API Routes ───
export function userCan(user: SessionUser, perm: Permission): boolean {
  return hasPerm(user.role, perm)
}

export async function authenticate(): Promise<SessionUser | null> {
  return getSessionUser()
}
