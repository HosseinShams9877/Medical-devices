// ─────────────────────────────────────────────────────────────
// برچسب‌های فارسی و رنگ وضعیت‌ها — تک‌منبع برای کل UI
// ─────────────────────────────────────────────────────────────

type Label = { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted' }

export const ORDER_STATUS: Record<string, Label> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' },
  APPROVED: { label: 'تأیید‌شده', tone: 'info' },
  MATERIAL_CHECK: { label: 'بررسی مواد', tone: 'warning' },
  READY: { label: 'آمادهٔ تولید', tone: 'info' },
  IN_PRODUCTION: { label: 'در حال تولید', tone: 'info' },
  WAITING_QC: { label: 'در انتظار QC', tone: 'warning' },
  REWORK: { label: 'در حال اصلاح (Rework)', tone: 'danger' },
  COMPLETED: { label: 'تکمیل تولید', tone: 'success' },
  IN_WAREHOUSE: { label: 'در انبار محصول', tone: 'success' },
  SHIPPED: { label: 'ارسال‌شده', tone: 'info' },
  CLOSED: { label: 'بسته‌شده (اتمام پروژه)', tone: 'muted' },
  CANCELLED: { label: 'لغو‌شده', tone: 'muted' },
}

// مبدأ درخواست تولید
export const ORDER_ORIGIN: Record<string, Label> = {
  DIRECTIVE: { label: 'دستور مدیریتی', tone: 'warning' },
  MINUTES: { label: 'صورت‌جلسه', tone: 'info' },
  CUSTOMER_ORDER: { label: 'سفارش مشتری', tone: 'success' },
  INTERNAL: { label: 'داخلی', tone: 'neutral' },
}

// انواع گردش کالا (دفتر انبار)
export const MOVEMENT_TYPE: Record<string, Label> = {
  MANUAL_IN: { label: 'ورود دستی / رسید', tone: 'success' },
  MANUAL_OUT: { label: 'خروج دستی', tone: 'danger' },
  ADJUST: { label: 'اصلاح موجودی', tone: 'warning' },
  BOM_CONSUME: { label: 'مصرف خودکار BOM', tone: 'info' },
  PRODUCTION: { label: 'مصرف تولید', tone: 'neutral' },
  IQC_REJECT: { label: 'خروج رد IQC', tone: 'danger' },
}

export const DEVICE_STATUS: Record<string, Label> = {
  IN_PRODUCTION: { label: 'در حال تولید', tone: 'info' },
  QC_PASS: { label: 'پاس QC', tone: 'success' },
  QC_FAIL: { label: 'مردود QC', tone: 'danger' },
  REWORK: { label: 'در حال اصلاح', tone: 'danger' },
  RELEASED: { label: 'آزاد‌شده', tone: 'success' },
  DELIVERED: { label: 'تحویل‌شده', tone: 'info' },
  SCRAPPED: { label: 'اسقاط‌شده', tone: 'muted' },
}

export const TICKET_STATUS: Record<string, Label> = {
  NEW: { label: 'جدید', tone: 'info' },
  REVIEWING: { label: 'در بررسی', tone: 'warning' },
  ASSIGNED: { label: 'ارجاع‌شده', tone: 'info' },
  DIAGNOSING: { label: 'در عیب‌یابی', tone: 'warning' },
  WAITING_PART: { label: 'در انتظار قطعه', tone: 'warning' },
  REPAIRING: { label: 'در حال تعمیر', tone: 'info' },
  TESTING: { label: 'در حال تست', tone: 'warning' },
  RESOLVED: { label: 'حل‌شده', tone: 'success' },
  CLOSED: { label: 'بسته‌شده', tone: 'muted' },
}

export const COMPLAINT_STATUS: Record<string, Label> = {
  OPEN: { label: 'باز', tone: 'danger' },
  INVESTIGATING: { label: 'در حال بررسی', tone: 'warning' },
  CAPA: { label: 'اقدام اصلاحی', tone: 'info' },
  PENDING_APPROVAL: { label: 'در انتظار تأیید', tone: 'warning' },
  CLOSED: { label: 'بسته‌شده', tone: 'success' },
  REJECTED: { label: 'رد‌شده', tone: 'muted' },
}

export const NCR_STATUS: Record<string, Label> = {
  OPEN: { label: 'باز', tone: 'danger' },
  IN_REWORK: { label: 'در حال اصلاح', tone: 'warning' },
  RETEST: { label: 'در تست مجدد', tone: 'info' },
  RESOLVED: { label: 'رفع‌شده', tone: 'success' },
  CLOSED: { label: 'بسته‌شده', tone: 'muted' },
}

export const PRIORITY: Record<string, Label> = {
  LOW: { label: 'کم', tone: 'muted' },
  NORMAL: { label: 'معمولی', tone: 'neutral' },
  HIGH: { label: 'بالا', tone: 'warning' },
  URGENT: { label: 'فوری', tone: 'danger' },
}

export const SEVERITY: Record<string, Label> = {
  LOW: { label: 'کم', tone: 'muted' },
  MEDIUM: { label: 'متوسط', tone: 'warning' },
  HIGH: { label: 'بالا', tone: 'danger' },
  CRITICAL: { label: 'بحرانی', tone: 'danger' },
}

export const SAFETY_IMPACT: Record<string, Label> = {
  NO: { label: 'بدون اثر بر ایمنی', tone: 'success' },
  UNKNOWN: { label: 'اثر بر ایمنی نامشخص', tone: 'warning' },
  YES: { label: 'دارای اثر بر ایمنی', tone: 'danger' },
}

export const REG_STATUS: Record<string, Label> = {
  PENDING: { label: 'در انتظار بررسی رگولاتوری', tone: 'warning' },
  REVIEWING: { label: 'در حال بررسی رگولاتوری', tone: 'info' },
  REPORTABLE: { label: 'قابل گزارش (Reportable)', tone: 'danger' },
  NOT_REPORTABLE: { label: 'غیرقابل‌گزارش', tone: 'success' },
}

export const QC_STAGE: Record<string, Label> = {
  INCOMING: { label: 'کنترل ورودی', tone: 'info' },
  IN_PROCESS: { label: 'کنترل حین تولید', tone: 'warning' },
  FINAL: { label: 'کنترل نهایی', tone: 'success' },
}

export const WARRANTY_STATUS: Record<string, Label> = {
  IN_WARRANTY: { label: 'در گارانتی', tone: 'success' },
  OUT_OF_WARRANTY: { label: 'گارانتی منقضی‌شده', tone: 'danger' },
  UNKNOWN: { label: 'نامشخص (تحویل ثبت نشده است)', tone: 'warning' },
}

export const CRITICALITY: Record<string, Label> = {
  CRITICAL: { label: 'بحرانی', tone: 'danger' },
  NORMAL: { label: 'عادی', tone: 'neutral' },
}

export const STEP_RESULT: Record<string, Label> = {
  DONE: { label: 'انجام‌شده', tone: 'success' },
  FAIL: { label: 'ناموفق', tone: 'danger' },
  SKIPPED: { label: 'رد‌شده', tone: 'muted' },
}

export const LOT_STATUS: Record<string, Label> = {
  PENDING: { label: 'در انتظار کنترل', tone: 'warning' },
  APPROVED: { label: 'تأیید‌شده', tone: 'success' },
  REJECTED: { label: 'رد‌شده', tone: 'danger' },
}

export const REPAIR_RESULT: Record<string, Label> = {
  FIXED: { label: 'تعمیر کامل', tone: 'success' },
  PARTIAL: { label: 'تعمیر جزئی', tone: 'warning' },
  NOT_FIXED: { label: 'تعمیر ناموفق', tone: 'danger' },
  REPLACED_DEVICE: { label: 'جایگزینی دستگاه', tone: 'info' },
}

export const DOC_TYPES: Record<string, string> = {
  TEST_REPORT: 'گزارش تست',
  QC_REPORT: 'گزارش QC',
  PHOTO: 'تصویر',
  REPAIR_REPORT: 'گزارش تعمیر',
  CUSTOMER_DOC: 'مستندات مشتری',
  CERTIFICATE: 'گواهی',
  CALIBRATION: 'گواهی کالیبراسیون',
  PRODUCTION: 'سند تولید',
  SERVICE: 'سند خدمات',
  OTHER: 'سایر',
}

export const ENTITY_TYPES: Record<string, string> = {
  ORDER: 'سفارش تولید',
  DEVICE: 'دستگاه',
  TICKET: 'تیکت خدمات',
  COMPLAINT: 'شکایت',
  REPAIR: 'تعمیر',
  COMPONENT: 'قطعه',
  PRODUCT: 'محصول',
  CUSTOMER: 'مشتری',
  BOM: 'BOM',
  Bom: 'BOM',
  Component: 'قطعه',
  Device: 'دستگاه',
  Supplier: 'تأمین‌کننده',
  Export: 'خروجی اکسل',
  NCR: 'عدم انطباق (NCR)',
  EQUIPMENT: 'تجهیزات',
  TEMPLATE: 'قالب تست',
  USER: 'کاربر',
  DOCUMENT: 'سند',
  INVENTORY: 'انبار',
  SYSTEM: 'سامانه',
}

// ─── برچسب اقدامات Audit Trail — تک‌منبع برای UI و خروجی اکسل ───
export const AUDIT_ACTION_GROUPS: { title: string; actions: Record<string, string> }[] = [
  {
    title: 'سفارش و تولید',
    actions: {
      ORDER_CREATE: 'ایجاد سفارش',
      ORDER_TRANSITION: 'تغییر وضعیت سفارش',
      ORDER_MATERIAL_RESERVE: 'رزرو مواد',
      ORDER_MATERIAL_OVERRIDE: 'عبور از کمبود',
      ORDER_NOTE: 'یادداشت سفارش',
      ORDER_ASSIGN: 'تغییر مسئول',
      STEP_RECORD: 'ثبت عملیات تولید',
      FIRMWARE_PROGRAM: 'ثبت Firmware',
    },
  },
  {
    title: 'کنترل کیفیت',
    actions: {
      QC_TEST_CREATE: 'ثبت تست',
      QC_TEST_FAIL: 'شکست تست',
      QC_TEST_VERIFY: 'تأیید تست',
      QC_TEST_RETEST: 'Retest',
      NCR_CREATE: 'ایجاد NCR',
      NCR_UPDATE: 'به‌روزرسانی NCR',
      NCR_TRANSITION: 'تغییر وضعیت NCR',
      REWORK_RECORD: 'ثبت Rework',
      IQC_APPROVE: 'تأیید IQC',
      IQC_REJECT: 'رد IQC',
      EQUIPMENT_CREATE: 'تجهیزات جدید',
      EQUIPMENT_CALIBRATE: 'کالیبراسیون',
      TEST_TEMPLATE_CREATE: 'قالب تست',
      TEST_TEMPLATE_DEACTIVATE: 'غیرفعال‌سازی قالب تست',
    },
  },
  {
    title: 'انبار و BOM',
    actions: {
      INVENTORY_RECEIVE: 'رسید انبار',
      INVENTORY_ADJUST: 'اصلاح موجودی',
      INVENTORY_OUT: 'خروج دستی انبار',
      INVENTORY_BOM_CONSUME: 'مصرف خودکار BOM',
    },
  },
  {
    title: 'محصول و آزادسازی',
    actions: {
      PRODUCT_CREATE: 'ایجاد محصول',
      PRODUCT_EDIT: 'ویرایش محصول',
      PRODUCT_REVISION_CREATE: 'نسخه محصول',
      PRODUCT_REVISION_ACTIVATE: 'فعال‌سازی نسخه',
      BOM_REVISION_CREATE: 'نسخه جدید BOM',
      PROCESS_TEMPLATE_SAVE: 'قالب فرایند',
      PRODUCT_RELEASE: 'آزادسازی محصول',
      DEVICE_DELIVER: 'تحویل دستگاه',
    },
  },
  {
    title: 'خدمات پس از فروش',
    actions: {
      TICKET_CREATE: 'ایجاد تیکت',
      TICKET_ASSIGN: 'ارجاع تیکت',
      TICKET_COMMENT: 'یادداشت تیکت',
      TICKET_TRANSITION: 'تغییر وضعیت تیکت',
      TICKET_CLOSE: 'بستن تیکت',
      COMPLAINT_CREATE: 'ثبت شکایت',
      COMPLAINT_UPDATE: 'بررسی شکایت',
      COMPLAINT_TRANSITION: 'تغییر وضعیت شکایت',
      COMPLAINT_REGULATORY: 'تصمیم رگولاتوری',
      REPAIR_CREATE: 'ثبت تعمیر',
      PART_USED_SERVICE: 'مصرف قطعه سرویس',
      WARRANTY_OVERRIDE: 'تغییر گارانتی',
      CUSTOMER_CREATE: 'ایجاد مشتری',
    },
  },
  {
    title: 'اکسل و پشتیبان',
    actions: {
      EXCEL_IMPORT: 'ورود داده از اکسل',
      EXCEL_EXPORT: 'خروج داده به اکسل',
      BACKUP_CREATE: 'ایجاد نسخهٔ پشتیبان',
      BACKUP_DOWNLOAD: 'دانلود نسخهٔ پشتیبان',
    },
  },
  {
    title: 'کاربران و امنیت',
    actions: {
      USER_CREATE: 'ایجاد کاربر',
      USER_UPDATE: 'ویرایش کاربر',
      AUTH_LOGIN: 'ورود',
      AUTH_LOGOUT: 'خروج',
      SECURITY: 'رویداد امنیتی',
      SEC_LOGIN_FAILED: 'ورود ناموفق',
      SEC_LOGIN_BLOCKED: 'بلاک کاربر',
      SEC_LOGIN_RATE_LIMIT: 'توقف ورود',
      SEC_ACCESS_DENIED: 'دسترسی غیرمجاز',
      SEC_TRANSITION_DENIED: 'گذار غیرمجاز گردش‌کار',
      DOCUMENT_UPLOAD: 'بارگذاری سند',
    },
  },
]

export const AUDIT_ACTIONS: Record<string, string> = Object.assign(
  {},
  ...AUDIT_ACTION_GROUPS.map((g) => g.actions),
)

export const CUSTOMER_TYPES: Record<string, string> = {
  HOSPITAL: 'بیمارستان',
  CLINIC: 'درمانگاه',
  DISTRIBUTOR: 'نماینده/توزیع‌کننده',
  OTHER: 'سایر',
}

export const NCR_TYPE: Record<string, string> = {
  TEST_FAIL: 'شکست تست',
  MATERIAL: 'مواد/قطعه',
  PROCESS: 'فرایند',
  COMPLAINT: 'شکایت مشتری',
}

export const NOTIF_TONE: Record<string, Label['tone']> = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  CRITICAL: 'danger',
}
