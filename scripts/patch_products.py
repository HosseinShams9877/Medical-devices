#!/usr/bin/env python3
"""اصلاحات نگارشی ProductsView"""
import io

path = 'src/components/app/ProductsView.tsx'
with io.open(path, encoding='utf-8') as f:
    s = f.read()

pairs = [
    # آیکون Check به جای متن ✓
    ("{r.revision}{r.isActive ? ' ✓' : ''}",
     "{r.revision}{r.isActive && <Check className=\"w-3 h-3 inline -mt-0.5\" aria-hidden=\"true\" />}"),
    ("import { Plus, Layers, ListOrdered } from 'lucide-react'",
     "import { Plus, Layers, ListOrdered, Check } from 'lucide-react'"),
    # واژهٔ یکدست «دستگاه»
    ("header: 'تجهیزات ساخته‌شده'", "header: 'دستگاه‌های ساخته‌شده'"),
    # حذف artifact خالی
    ("· اعمال از ${''}${new Date(b.effectiveDate).toLocaleDateString('fa-IR')}",
     "· اعمال از ${new Date(b.effectiveDate).toLocaleDateString('fa-IR')}"),
    # فرآیند → فرایند (سازگار با دستور خط فرهنگستان)
    ("قالب فرآیند تولید", "قالب فرایند تولید"),
    ("BOM و قالب فرآیند نسخه جدید باید تعریف شود.",
     "BOM و قالب فرایندِ نسخهٔ جدید باید تعریف شوند."),
    ("قالب فرآیندی تعریف نشده است", "قالب فرایندی تعریف نشده است"),
    # توضیح قالب فرایند
    ("— با شروع هر سفارش در مراحل آن کپی می‌شود",
     "— با تأیید هر سفارش، مراحل آن کپی می‌شود"),
    # استفاده از ORDER_STATUS اصلی به‌جای نسخهٔ محلی ناقص
    ("""const ORDER_STATUS_MIN = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' as const }, APPROVED: { label: 'تأییدشده', tone: 'info' as const },
  MATERIAL_CHECK: { label: 'بررسی مواد', tone: 'warning' as const }, READY: { label: 'آماده', tone: 'info' as const },
  IN_PRODUCTION: { label: 'در تولید', tone: 'info' as const }, WAITING_QC: { label: 'در انتظار QC', tone: 'warning' as const },
  REWORK: { label: 'Rework', tone: 'danger' as const }, COMPLETED: { label: 'تکمیل', tone: 'success' as const },
  RELEASED: { label: 'آزادشده', tone: 'success' as const }, CANCELLED: { label: 'لغو', tone: 'muted' as const },
}

""", ""),
    ("import { CRITICALITY } from '@/lib/labels'",
     "import { CRITICALITY, ORDER_STATUS } from '@/lib/labels'"),
    ("<StatusBadge map={ORDER_STATUS_MIN} value={o.status} />",
     "<StatusBadge map={ORDER_STATUS} value={o.status} />"),
    # دیالوگ BOM
    ("روی نسخه فعلی Overwrite نمی‌شود؛ نسخه جدید ایجاد و نسخه قبلی بازنشسته می‌گردد.",
     "روی نسخهٔ فعلی بازنویسی (Overwrite) نمی‌شود؛ نسخهٔ جدید ایجاد و نسخهٔ قبلی بازنشسته می‌شود."),
    ("{mutation.isPending ? '…' : 'ایجاد و فعال‌سازی نسخه'}",
     "{mutation.isPending ? 'در حال ثبت…' : 'ایجاد و فعال‌سازی نسخه'}"),
    ("نسخه قبلی بازنشسته شد؛ سفارش‌های قبلی به نسخه خود متصل باقی می‌مانند.",
     "نسخهٔ قبلی بازنشسته شد؛ سفارش‌های قبلی به نسخهٔ خود متصل باقی می‌مانند."),
    # چیپ شماره مرحله گرادیانی
    ('<span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold tnum">{faInt(s.stepIndex)}</span>',
     '<span className="w-6 h-6 rounded-md bg-gradient-to-br from-teal-600 to-emerald-500 text-white flex items-center justify-center text-[11px] font-bold tnum shadow-sm">{faInt(s.stepIndex)}</span>'),
]

count = 0
for old, new in pairs:
    if old in s:
        s = s.replace(old, new)
        count += 1
    else:
        print(f"NOT FOUND: {old[:70]!r}")

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(s)
print(f"replaced {count}/{len(pairs)}")
