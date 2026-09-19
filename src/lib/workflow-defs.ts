// ─────────────────────────────────────────────────────────────
// Workflow Definitions — تعاریف خالص گردش‌کار (Client-Safe)
// بدون وابستگی به دیتابیس؛ هم در سرور و هم در کلاینت import می‌شود.
// مرجع اعمال سخت سمت سرور: src/lib/workflow.ts
// ─────────────────────────────────────────────────────────────
import type { Permission } from '@/lib/rbac'

export interface TransitionDef {
  to: string
  perm: Permission
  label: string
  guard?: string // نام گارد سمت سرور
  danger?: boolean
  autoNote?: string
}

// ─── سفارش تولید ───
// زنجیرهٔ کامل: ثبت ← تأیید ← بررسی مواد ← آماده ← تولید ← QC ← تکمیل
// ← انبار محصول / ارسال مستقیم ← خروج و ارسال ← بستن پروژه
export const ORDER_STATUSES = [
  'DRAFT', 'APPROVED', 'MATERIAL_CHECK', 'READY', 'IN_PRODUCTION',
  'WAITING_QC', 'REWORK', 'COMPLETED', 'IN_WAREHOUSE', 'SHIPPED',
  'CLOSED', 'CANCELLED',
] as const

export const ORDER_TRANSITIONS: Record<string, TransitionDef[]> = {
  DRAFT: [
    { to: 'APPROVED', perm: 'production.approve', label: 'تأیید و بررسی مواد', guard: 'hasBom' },
    { to: 'CANCELLED', perm: 'production.cancel', label: 'لغو سفارش', danger: true },
  ],
  APPROVED: [
    { to: 'MATERIAL_CHECK', perm: 'production.approve', label: 'اجرای بررسی مواد', guard: 'hasBom' },
    { to: 'CANCELLED', perm: 'production.cancel', label: 'لغو سفارش', danger: true },
  ],
  MATERIAL_CHECK: [
    { to: 'READY', perm: 'production.overrideShortage', label: 'تأیید عبور از کمبود بحرانی', guard: 'hasCriticalShortage', danger: true },
    { to: 'CANCELLED', perm: 'production.cancel', label: 'لغو سفارش', danger: true },
  ],
  READY: [
    { to: 'IN_PRODUCTION', perm: 'production.start', label: 'شروع تولید', guard: 'noCriticalShortage' },
    { to: 'CANCELLED', perm: 'production.cancel', label: 'لغو سفارش', danger: true },
  ],
  IN_PRODUCTION: [
    { to: 'WAITING_QC', perm: 'production.sendToQc', label: 'ارسال به کنترل کیفیت', guard: 'allStepsDone' },
  ],
  WAITING_QC: [
    { to: 'REWORK', perm: 'qc.ncr.manage', label: 'هدایت به Rework' },
    { to: 'COMPLETED', perm: 'production.approve', label: 'تکمیل تولید', guard: 'allDevicesQcPass' },
  ],
  REWORK: [
    { to: 'WAITING_QC', perm: 'qc.ncr.manage', label: 'بازگشت به QC (پس از Retest)', guard: 'retestPassed' },
  ],
  COMPLETED: [
    { to: 'IN_WAREHOUSE', perm: 'production.warehouse', label: 'ورود به انبار محصول', guard: 'allDevicesReleased' },
    { to: 'SHIPPED', perm: 'production.ship', label: 'ارسال مستقیم به مشتری', guard: 'allDevicesDelivered' },
  ],
  IN_WAREHOUSE: [
    { to: 'SHIPPED', perm: 'production.ship', label: 'خروج از انبار و ارسال', guard: 'allDevicesDelivered' },
  ],
  SHIPPED: [
    { to: 'CLOSED', perm: 'production.approve', label: 'بستن پروژه (اتمام)' },
  ],
  CLOSED: [], // وضعیت نهایی — پروژه بسته شده است
  CANCELLED: [],
}

// ─── تیکت خدمات ───
export const TICKET_STATUSES = [
  'NEW', 'REVIEWING', 'ASSIGNED', 'DIAGNOSING', 'WAITING_PART',
  'REPAIRING', 'TESTING', 'RESOLVED', 'CLOSED',
] as const

export const TICKET_TRANSITIONS: Record<string, TransitionDef[]> = {
  NEW: [
    { to: 'REVIEWING', perm: 'service.assign', label: 'شروع بررسی' },
    { to: 'CLOSED', perm: 'service.close', label: 'بستن (بدون اقدام)', danger: true },
  ],
  REVIEWING: [
    { to: 'ASSIGNED', perm: 'service.assign', label: 'ارجاع به تکنسین', guard: 'hasTechnician' },
  ],
  ASSIGNED: [
    { to: 'DIAGNOSING', perm: 'service.update', label: 'شروع عیب‌یابی' },
    { to: 'CLOSED', perm: 'service.close', label: 'بستن', danger: true },
  ],
  DIAGNOSING: [
    { to: 'REPAIRING', perm: 'service.update', label: 'شروع تعمیر' },
    { to: 'WAITING_PART', perm: 'service.update', label: 'در انتظار قطعه' },
    { to: 'RESOLVED', perm: 'service.update', label: 'رفع مشکل (بدون تعمیر)' },
  ],
  WAITING_PART: [
    { to: 'REPAIRING', perm: 'service.update', label: 'دریافت قطعه و شروع تعمیر' },
  ],
  REPAIRING: [
    { to: 'TESTING', perm: 'service.update', label: 'تست پس از تعمیر' },
    { to: 'RESOLVED', perm: 'service.update', label: 'پایان تعمیر' },
  ],
  TESTING: [
    { to: 'RESOLVED', perm: 'service.update', label: 'تست موفق' },
    { to: 'REPAIRING', perm: 'service.update', label: 'تست ناموفق — ادامه تعمیر' },
  ],
  RESOLVED: [
    { to: 'CLOSED', perm: 'service.close', label: 'بستن تیکت' },
    { to: 'REPAIRING', perm: 'service.update', label: 'بازگشایی (مشکل مجدد)' },
  ],
  CLOSED: [],
}

// ─── شکایت مشتری ───
export const COMPLAINT_STATUSES = [
  'OPEN', 'INVESTIGATING', 'CAPA', 'PENDING_APPROVAL', 'CLOSED', 'REJECTED',
] as const

export const COMPLAINT_TRANSITIONS: Record<string, TransitionDef[]> = {
  OPEN: [
    { to: 'INVESTIGATING', perm: 'service.complaint.manage', label: 'شروع بررسی' },
  ],
  INVESTIGATING: [
    { to: 'CAPA', perm: 'service.complaint.manage', label: 'ثبت علت ریشه‌ای و اقدام اصلاحی', guard: 'capaFields' },
  ],
  CAPA: [
    { to: 'PENDING_APPROVAL', perm: 'service.complaint.manage', label: 'ارسال برای تأیید نهایی', guard: 'resolutionField' },
  ],
  PENDING_APPROVAL: [
    { to: 'CLOSED', perm: 'service.complaint.approve', label: 'تأیید و بستن شکایت' },
    { to: 'REJECTED', perm: 'service.complaint.approve', label: 'رد شکایت (با دلیل)', danger: true },
  ],
  CLOSED: [],
  REJECTED: [],
}

// ─── عدم انطباق ───
export const NCR_STATUSES = ['OPEN', 'IN_REWORK', 'RETEST', 'RESOLVED', 'CLOSED'] as const

export const NCR_TRANSITIONS: Record<string, TransitionDef[]> = {
  OPEN: [
    { to: 'IN_REWORK', perm: 'qc.ncr.manage', label: 'صدور دستور Rework' },
    { to: 'RESOLVED', perm: 'qc.ncr.manage', label: 'رفع بدون Rework', guard: 'capaFilled' },
  ],
  IN_REWORK: [
    { to: 'RETEST', perm: 'qc.ncr.manage', label: 'پایان Rework — Retest' },
  ],
  RETEST: [
    { to: 'RESOLVED', perm: 'qc.ncr.manage', label: 'بستن پس از Retest', guard: 'retestDone' },
    { to: 'IN_REWORK', perm: 'qc.ncr.manage', label: 'Retest مجدد ناموفق — Rework مجدد' },
  ],
  RESOLVED: [
    { to: 'CLOSED', perm: 'qc.ncr.manage', label: 'بستن NCR', guard: 'capaFilled' },
  ],
  CLOSED: [],
}

// ─── مبدأ درخواست تولید (برای نمایش و فرم‌ها) ───
export const ORDER_ORIGINS = ['DIRECTIVE', 'MINUTES', 'CUSTOMER_ORDER', 'INTERNAL'] as const
