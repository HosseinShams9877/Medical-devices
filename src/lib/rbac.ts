// ─────────────────────────────────────────────────────────────
// RBAC — ماتریس نقش/مجوز (تک‌منبع حقیقت برای بک‌اند و فرانت‌اند)
// اعمال مجوز فقط در Frontend ممنوع — همه APIها این ماتریس را اعمال می‌کنند
// ─────────────────────────────────────────────────────────────

export const ROLES = [
  'ADMIN', 'PRODUCTION_MGR', 'OPERATOR', 'QC', 'WAREHOUSE',
  'SERVICE_MGR', 'TECHNICIAN', 'SALES', 'VIEWER',
] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'مدیر سیستم',
  PRODUCTION_MGR: 'مدیر تولید',
  OPERATOR: 'اپراتور تولید',
  QC: 'مسئول کنترل کیفیت',
  WAREHOUSE: 'انباردار',
  SERVICE_MGR: 'مدیر خدمات پس از فروش',
  TECHNICIAN: 'تکنسین خدمات',
  SALES: 'واحد فروش',
  VIEWER: 'مدیریت (مشاهده)',
}

// ─── فهرست مجوز‌ها ───
export const PERMISSIONS = {
  // تولید
  'production.view': 'مشاهده سفارش‌های تولید',
  'production.create': 'ایجاد سفارش تولید',
  'production.edit': 'ویرایش سفارش (پیش‌نویس)',
  'production.approve': 'تأیید سفارش / تکمیل تولید',
  'production.cancel': 'لغو سفارش',
  'production.overrideShortage': 'تأیید عبور از کمبود قطعه بحرانی',
  'production.start': 'شروع تولید',
  'production.recordStep': 'ثبت عملیات تولید (اپراتور)',
  'production.sendToQc': 'ارسال به کنترل کیفیت',
  'production.warehouse': 'انبارش و خروج محصول نهایی',
  'production.ship': 'ثبت ارسال سفارش',
  // BOM و محصول
  'bom.view': 'مشاهده BOM',
  'bom.revise': 'ایجاد نسخه جدید BOM',
  'product.manage': 'ایجاد/ویرایش محصول و نسخه‌ها',
  // موجودی
  'inventory.view': 'مشاهده موجودی',
  'inventory.receive': 'ثبت رسید انبار (قطعه ورودی)',
  'inventory.adjust': 'اصلاح موجودی',
  'inventory.move': 'ثبت خروج دستی انبار',
  'inventory.bomConsume': 'مصرف خودکار موجودی بر اساس BOM',
  // QC
  'qc.view': 'مشاهده نتایج QC',
  'qc.test.create': 'ثبت نتیجه تست',
  'qc.test.verify': 'تأیید نتایج تست',
  'qc.release': 'آزادسازی محصول',
  'qc.ncr.manage': 'مدیریت عدم انطباق / Rework',
  'qc.incoming.decide': 'تصمیم کنترل قطعه ورودی',
  'qc.equipment.manage': 'مدیریت تجهیزات تست',
  'qc.template.manage': 'مدیریت قالب‌های تست',
  // دستگاه و ردیابی
  'device.view': 'مشاهده دستگاه‌ها و پرونده ردیابی',
  'device.deliver': 'ثبت تحویل به مشتری',
  // خدمات پس از فروش
  'service.view': 'مشاهده خدمات',
  'service.create': 'ایجاد درخواست خدمات',
  'service.assign': 'ارجاع به تکنسین',
  'service.update': 'به‌روزرسانی تیکت / ثبت تعمیر',
  'service.close': 'بستن تیکت',
  'service.complaint.create': 'ثبت شکایت',
  'service.complaint.manage': 'بررسی و CAPA شکایت',
  'service.complaint.approve': 'تأیید نهایی / رد شکایت',
  'service.regulatory.review': 'بررسی رگولاتوری (Reportable)',
  'service.warranty.override': 'تغییر دستی وضعیت گارانتی',
  // مشتری
  'customer.view': 'مشاهده مشتریان',
  'customer.create': 'ایجاد مشتری',
  // گزارش و سوابق
  'reports.view': 'مشاهده گزارش‌های مدیریتی',
  'audit.view': 'مشاهده Audit Trail',
  'documents.view': 'مشاهده اسناد',
  'documents.upload': 'بارگذاری سند',
  'search.use': 'جستجوی سراسری',
  'notifications.view': 'مشاهده اعلان‌ها',
  // مدیریت سیستم
  'users.manage': 'مدیریت کاربران و نقش‌ها',
  'system.backup': 'پشتیبان‌گیری و بازیابی',
  // ورود/خروج داده اکسل
  'excel.import': 'ورود داده از فایل اکسل',
  'excel.export': 'خروج داده به فایل اکسل',
} as const

export type Permission = keyof typeof PERMISSIONS

const V = 'production.view'
const ALL_VIEWS: Permission[] = [
  'production.view', 'bom.view', 'inventory.view', 'qc.view', 'device.view',
  'service.view', 'customer.view', 'reports.view', 'documents.view',
  'search.use', 'notifications.view',
]

// ─── ماتریس نقش → مجوز ───
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: Object.keys(PERMISSIONS) as Permission[],
  PRODUCTION_MGR: [
    ...ALL_VIEWS, 'production.create', 'production.edit', 'production.approve',
    'production.cancel', 'production.overrideShortage', 'production.start',
    'production.sendToQc', 'production.warehouse', 'production.ship',
    'bom.revise', 'product.manage', 'inventory.bomConsume', 'audit.view',
    'documents.upload', 'service.create', 'excel.export',
  ],
  OPERATOR: [
    V, 'bom.view', 'inventory.view', 'qc.view', 'device.view', 'documents.view',
    'production.recordStep', 'search.use', 'notifications.view',
  ],
  QC: [
    ...ALL_VIEWS, 'qc.test.create', 'qc.test.verify', 'qc.release',
    'qc.ncr.manage', 'qc.incoming.decide', 'qc.equipment.manage',
    'qc.template.manage', 'production.approve', 'production.sendToQc',
    'service.complaint.create', 'service.complaint.manage',
    'service.complaint.approve', 'service.regulatory.review', 'audit.view',
    'documents.upload', 'excel.export',
  ],
  WAREHOUSE: [
    V, 'bom.view', 'inventory.view', 'device.view', 'documents.view',
    'inventory.receive', 'inventory.adjust', 'inventory.move',
    'inventory.bomConsume', 'production.warehouse', 'production.ship',
    'search.use', 'notifications.view', 'excel.export',
  ],
  SERVICE_MGR: [
    ...ALL_VIEWS, 'service.create', 'service.assign', 'service.update',
    'service.close', 'service.complaint.create', 'service.complaint.manage',
    'service.warranty.override', 'customer.create', 'documents.upload',
    'excel.export',
  ],
  TECHNICIAN: [
    V, 'bom.view', 'inventory.view', 'device.view', 'documents.view',
    'service.view', 'service.update', 'search.use', 'notifications.view',
  ],
  SALES: [
    ...ALL_VIEWS, 'customer.create', 'service.create', 'documents.upload',
    'device.deliver', 'production.ship', 'excel.export',
  ],
  VIEWER: [...ALL_VIEWS],
}

export function hasPerm(role: string, perm: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role]
  return !!perms && perms.includes(perm)
}

export function rolePermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] ?? []
}
