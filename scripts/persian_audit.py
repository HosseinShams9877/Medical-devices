#!/usr/bin/env python3
# ممیزی نگارش فارسی: نیم‌فاصله‌های جاافتاده و غلط‌های رایج در همهٔ فایل‌های سورس
import re, os, glob

BASE = '/home/z/my-project/src'
ZWSP = '\u200c'
# بازهٔ حروف فارسی/عربی
FA = '\u0621-\u064a\u067e\u0686\u0698\u06a9\u06af\u06cc'

patterns = [
    # اسم‌مصدر/وجه وصفیه مرکب: باید ZWNJ قبل از «شده» باشد (مثل تأییدشده → تأییدشده با نیم‌فاصله)
    # توجه: حرف «ن» (\u0646) قبل از «شده» واژهٔ مستقل «نشده» است — از الگو حذف شد
    (re.compile('(?<=[\u0621-\u0645\u0647-\u064a\u067e\u0686\u0698\u06a9\u06af\u06cc])شده'), 'فعل مرکب «…شده» بدون نیم‌فاصله'),
    (re.compile('(?<=[\u0621-\u0645\u0647-\u064a\u067e\u0686\u0698\u06a9\u06af\u06cc])نشده'), 'فعل مرکب «…نشده» بدون نیم‌فاصله'),
    # جمع با «ها/های» بدون نیم‌فاصله
    (re.compile(f'[{FA}]ها(?=[ ،.،)«»\\]\\[/:؛\\n])'), 'جمع «…ها» بدون نیم‌فاصله'),
    (re.compile(f'[{FA}]های(?=[ ،.،)«»\\]\\[/:؛\\n])'), 'جمع «…های» بدون نیم‌فاصله'),
    # پیشوند «می/نمی» چسبیده
    (re.compile(f'(^|[^{FA}{ZWSP}])می[{FA}]'), 'پیشوند «می» بدون نیم‌فاصله'),
    (re.compile(f'(^|[^{FA}{ZWSP}])نمی[{FA}]'), 'پیشوند «نمی» بدون نیم‌فاصله'),
    # غلط‌های پرتکرار واژگانی
    (re.compile('فرآیند'), '«فرآیند» — صورت پسندیده: فرایند'),
    (re.compile(f'بهТакже|بهصورت'), 'تبدیل نیم‌فاصله به «به‌صورت» (اگر چسبیده)'),
    (re.compile('بصورت'), '«بصورت» — صحیح: به‌صورت'),
    (re.compile('جطات|قطعات'), ''),
]

# واژه‌های «می‌چسبیده» پرکاربرد (شامل فعل‌های رایج در UI)
common_bad = ['میشود','میشوند','نمیشود','میکنید','میکند','میکنم','میتوان','میتواند','میتوانید',
              'میگردد','میباشد','میبایست','میدهد','میدهد','میدهند','میگیرد','میگیرند','میرود','میروند',
              'میآید','میاید','میرسد','میرسند','میکشند','میبندد','میبندیم','می‌شودX','میشناسند','میشناسد',
              'خواهدماند','خواهدبود','بایستی','میگذارد','میگذرد','میسازد','میسازند','میشمارید','خواهیمکرد']

def scan():
    hits = []
    files = sorted(glob.glob(f'{BASE}/**/*.ts', recursive=True) + glob.glob(f'{BASE}/**/*.tsx', recursive=True))
    for fp in files:
        try:
            text = open(fp, encoding='utf-8').read()
        except Exception as e:
            print(f'SKIP {fp}: {e}'); continue
        for ln, line in enumerate(text.split('\n'), 1):
            for rx, msg in patterns:
                if not msg:  # placeholder
                    continue
                for m in rx.finditer(line):
                    frag = line[max(0, m.start()-30):m.end()+30].strip()
                    hits.append((fp, ln, msg, frag))
            for w in common_bad:
                if w in line:
                    i = line.find(w)
                    frag = line[max(0, i-30):i+len(w)+30].strip()
                    hits.append((fp, ln, f'واژهٔ «{w}» بدون نیم‌فاصله', frag))
    return hits

if __name__ == '__main__':
    hits = scan()
    print(f'مجموع یافته‌ها: {len(hits)}')
    for fp, ln, msg, frag in hits:
        rel = os.path.relpath(fp, '/home/z/my-project')
        print(f'{rel}:{ln} | {msg}\n    …{frag}…')
