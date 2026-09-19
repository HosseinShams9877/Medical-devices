#!/usr/bin/env python3
"""اصلاحات بایت‌دقیق رشته‌های فارسی باقی‌مانده در QualityView و سایر فایل‌ها"""
import io, sys

def patch(path, pairs):
    with io.open(path, encoding='utf-8') as f:
        s = f.read()
    changed = []
    for old, new in pairs:
        if old in s:
            s = s.replace(old, new)
            changed.append(old[:40])
        else:
            print(f"NOT FOUND in {path}: {old[:60]!r}")
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(s)
    print(f"OK {path}: {len(changed)} replaced")

# QualityView — موارد باقی‌مانده
patch('src/components/app/QualityView.tsx', [
    ("title: 'دستور Rework صادر شد', description: 'دستگاه به وضعیت «در اصلاح» رفت.'",
     "title: 'دستور اصلاح (Rework) صادر شد', description: 'دستگاه به وضعیت «در حال اصلاح» رفت.'"),
    ('<Section title="سوابق Rework">', '<Section title="سوابق اصلاح (Rework)">'),
    ('<Section title="صدور دستور Rework">', '<Section title="صدور دستور اصلاح (Rework)">'),
    ('<TabsTrigger value="ncrs">عدم انطباق و Rework</TabsTrigger>', '<TabsTrigger value="ncrs">عدم انطباق و اصلاح</TabsTrigger>'),
    ('دستگاه‌های QC_PASS/QC_FAIL فقط برای Retest از پرونده دستگاه قابل استفاده‌اند.',
     'برای دستگاه‌های QC_PASS/QC_FAIL، ثبت تست مجدد فقط از پروندهٔ دستگاه ممکن است.'),
])
print("done")
