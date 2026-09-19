import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { hashPassword } from '@/lib/password'
import { ROLES, ROLE_LABELS, ROLE_PERMISSIONS } from '@/lib/rbac'
import type { Role } from '@/lib/rbac'

export const GET = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'users.manage')
  const users = await db.user.findMany({
    select: { id: true, username: true, fullName: true, role: true, status: true, phone: true, lastLoginAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const sessions = await db.session.count()
  return ok({ users, roles: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], permissions: ROLE_PERMISSIONS[r].length })), activeSessions: sessions })
})

const createSchema = z.object({
  action: z.literal('create'),
  username: z.string().min(3, 'نام کاربری حداقل ۳ نویسه').max(40).regex(/^[a-zA-Z0-9._-]+$/, 'نام کاربری فقط حروف انگلیسی، عدد، نقطه و خط تیره'),
  fullName: z.string().min(3, 'نام کامل الزامی است').max(100),
  role: z.enum(ROLES as [Role, ...Role[]]),
  password: z.string().min(8, 'رمز عبور حداقل ۸ نویسه').max(100),
  phone: z.string().max(30).optional(),
})

const updateSchema = z.object({
  action: z.literal('update'),
  id: z.string(),
  fullName: z.string().min(3).max(100).optional(),
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  password: z.string().min(8, 'رمز عبور حداقل ۸ نویسه').max(100).optional(),
  phone: z.string().max(30).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'users.manage')
  const raw = await req.json().catch(() => null)
  const action = (raw as { action?: string })?.action

  if (action === 'create') {
    const body = createSchema.parse(raw)
    const clash = await db.user.findUnique({ where: { username: body.username } })
    if (clash) throw faError('این نام کاربری قبلاً ثبت شده است.')
    const newUser = await db.user.create({
      data: { username: body.username, fullName: body.fullName, role: body.role, passwordHash: hashPassword(body.password), phone: body.phone, status: 'ACTIVE' },
    })
    await audit(req, user, 'USER_CREATE', { entityType: 'USER', entityId: newUser.id, entityCode: newUser.username, newValues: { fullName: body.fullName, role: body.role } })
    return ok({ user: { id: newUser.id, username: newUser.username, fullName: newUser.fullName, role: newUser.role, status: newUser.status } })
  }

  if (action === 'update') {
    const body = updateSchema.parse(raw)
    const target = await db.user.findUnique({ where: { id: body.id } })
    if (!target) throw faError('کاربر یافت نشد.', 404)
    if (target.id === user.id && (body.role !== undefined && body.role !== 'ADMIN' || body.status === 'DISABLED')) {
      throw faError('تغییر نقش یا غیرفعال‌سازی حساب خودتان مجاز نیست.')
    }
    const old = { fullName: target.fullName, role: target.role, status: target.status }
    await db.user.update({
      where: { id: body.id },
      data: {
        fullName: body.fullName ?? target.fullName,
        role: body.role ?? target.role,
        status: body.status ?? target.status,
        phone: body.phone ?? target.phone,
        ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
      },
    })
    if (body.status === 'DISABLED') {
      await db.session.deleteMany({ where: { userId: body.id } })
    }
    await audit(req, user, 'USER_UPDATE', { entityType: 'USER', entityId: body.id, entityCode: target.username, oldValues: old, newValues: { ...body, password: body.password ? '(تغییر یافت)' : undefined } })
    return ok({ success: true })
  }

  throw faError('اقدام نامعتبر است.')
})
