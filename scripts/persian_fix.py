#!/usr/bin/env python3
# اصلاح‌گر نیم‌فاصله — فقط الگوهای امن:
#  ۱) فعل مرکب «X + شده» (X ≠ ن) → X + ZWNJ + شده
#  ۲) جمع «X + ها / های» وقتی X هم‌صدا نیست (ا/و/ی) → X + ZWNJ + ها/های
#  ۳) فرآیند → فرایند
# ۴) واژه‌های خاص پرکاربرد
import re, glob, os

ZWNJ = '\u200c'
FA = '\u0621-\u064a\u067e\u0686\u0698\u06a9\u06af\u06cc'
VOWELS = '\u0627\u0648\u06cc\u0622'  # ا و ی آ — واژه‌های پایان‌یافته به مصوت بلند، جمع چسبیدهٔ رایج دارند

files = sorted(glob.glob('/home/z/my-project/src/**/*.ts', recursive=True)
             + glob.glob('/home/z/my-project/src/**/*.tsx', recursive=True)
             + glob.glob('/home/z/my-project/scripts/seed.ts'))

rx_participle = re.compile(f'([{FA}])شده')
rx_ha = re.compile(f'([{FA}])ها(?=[ ،.،)«»\\]\\[/:؛\\n>"])')
rx_hay = re.compile(f'([{FA}])های(?=[ ،.،)«»\\]\\[/:؛\\n>"])')
special = [('فرآیند', 'فرایند')]

total = 0
for fp in files:
    text = open(fp, encoding='utf-8').read()
    orig = text
    # ۳) واژه‌های خاص
    for a, b in special:
        text = text.replace(a, b)
    # ۱) فعل مرکب — فقط وقتی حرف پیشین «ن» نباشد (خودِ واژهٔ «نشده» است)
    def fix_part(m):
        ch = m.group(1)
        if ch == '\u0646':  # ن
            return m.group(0)
        return ch + ZWNJ + 'شده'
    text = rx_participle.sub(fix_part, text)
    # ۲) جمع‌ها
    def fix_ha(m):
        ch = m.group(1)
        if ch in VOWELS:
            return m.group(0)
        return ch + ZWNJ + 'ها'
    def fix_hay(m):
        ch = m.group(1)
        if ch in VOWELS:
            return m.group(0)
        return ch + ZWNJ + 'های'
    text = rx_ha.sub(fix_ha, text)
    text = rx_hay.sub(fix_hay, text)

    if text != orig:
        # نمایش تغییرات برای بازبینی
        import difflib
        diffs = [l for l in difflib.unified_diff(orig.split('\n'), text.split('\n'), lineterm='', n=0) if l.startswith(('+', '-')) and not l.startswith(('+++', '---'))]
        rel = os.path.relpath(fp, '/home/z/my-project')
        print(f'{rel} — {len(diffs)//2} تغییر:')
        for d in diffs[:40]:
            print('   ', d[:110])
        total += len(diffs) // 2
        open(fp, 'w', encoding='utf-8').write(text)
print(f'—— مجموع تغییرات: {total}')
