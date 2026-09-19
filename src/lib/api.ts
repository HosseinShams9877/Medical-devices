// ─────────────────────────────────────────────────────────────
// API Helpers — گارد احراز هویت/مجوز، مدیریت خطای فارسی‌سازی‌شده،
// اعتبارسنجی ورودی؛ جزئیات فنی فقط در لاگ سرور
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import { hasPerm, type Permission } from '@/lib/rbac'
import { securityEvent } from '@/lib/audit'

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export const faError = (m: string, s = 400) => new ApiError(m, s)

// ─── ترجمه‌ی خطاهای فنی به پیام قابل فهم ───
function translateDbError(e: unknown): string {
  const msg = String((e as Error)?.message ?? '')
  if (msg.includes('Unique constraint') || msg.includes('UNIQUE constraint')) {
    if (msg.includes('serial')) return 'این شماره سریال قبلاً ثبت شده است. شماره سریال تکراری مجاز نیست.'
    if (msg.includes('code')) return 'این کد/شماره قبلاً ثبت شده است. شناسه تکراری مجاز نیست.'
    if (msg.includes('lotNumber')) return 'این شماره لات برای قطعه انتخابی قبلاً ثبت شده است.'
    return 'این مقدار تکراری است؛ شناسه‌های یکتا قابل تکرار نیستند.'
  }
  if (msg.includes('Foreign key constraint') || msg.includes('FOREIGN KEY')) {
    return 'امکان انجام این عملیات وجود ندارد، زیرا این رکورد در فرایند‌های دیگر استفاده شده است.'
  }
  if (msg.includes('required') && msg.includes('Argument')) {
    return 'اطلاعات وارد‌شده کامل نیست. لطفاً همه فیلد‌های الزامی را پر کنید.'
  }
  console.error('DB_ERROR_DETAIL:', msg) // جزئیات فنی فقط در لاگ سرور
  return 'خطای داخلی در ذخیره‌سازی داده رخ داد. لطفاً دوباره تلاش کنید و در صورت تکرار با پشتیبانی تماس بگیرید.'
}

// ─── Wrapper همه Route Handlerها ───
type RouteCtx = { params: Promise<Record<string, string>> }
export function withApi(handler: (req: NextRequest, ctx: RouteCtx) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx: RouteCtx) => {
    try {
      return await handler(req, ctx ?? { params: Promise.resolve({}) })
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      if (e instanceof z.ZodError) {
        const first = e.issues[0]
        return NextResponse.json(
          { error: `داده ورودی معتبر نیست: ${first?.path?.join('.')} — ${first?.message ?? ''}` },
          { status: 422 },
        )
      }
      return NextResponse.json({ error: translateDbError(e) }, { status: 500 })
    }
  }
}

// گارد: کاربر لاگین‌کرده + دارا بودن مجوز (اعمال در بک‌اند)
export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw faError('برای انجام این عملیات ابتدا وارد سیستم شوید.', 401)
  return user
}

export async function requirePerm(req: NextRequest, perm: Permission): Promise<SessionUser> {
  const user = await requireUser(req)
  if (!hasPerm(user.role, perm)) {
    await securityEvent(req, 'SEC_ACCESS_DENIED', `permission=${perm}`, user)
    throw faError('شما مجوز انجام این عملیات را ندارید.', 403)
  }
  return user
}

export async function readJson<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw faError('درخواست نامعتبر است.', 400)
  }
  return schema.parse(raw)
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status })
