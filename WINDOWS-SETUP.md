# نصب چندکاربره روی ویندوز — نسخه اصلاح‌شده

این سند جایگزین راهنمای قدیمی ویندوز است. هدف: یک سرور مرکزی ویندوز، یک نمونه برنامه و اتصال کاربران با مرورگر و HTTPS. اعتبارسنجی خود ویندوز، شبکه و گواهی باید روی مقصد انجام شود. اسکریپت‌ها با PowerShell اجرا می‌شوند، نه CMD. Node.js 24 لازم است. برای اجتناب از مشکل npm.ps1 از npm.cmd استفاده کنید؛ نیازی به تغییر دائمی ExecutionPolicy نیست. سیاست سازمان را دور نزنید.

## ۱. پیش از نصب

- ZIP را در مسیر کوتاه مثل `C:\MES\medical-device-mes` استخراج کنید. دیتابیس و ضمیمه‌ها روی دیسک محلی سرور، خارج از پوشه کد و خارج از OneDrive باشند.
- برای سرور IP ثابت و نام DNS داخلی مانند `mes.company.test` تعریف کنید. این نام نمونه است و باید در DNS/hosts تمام کاربران به IP واقعی سرور اشاره کند.
- Node.js 24 و فایل اجرایی Caddy را از منابع رسمی نصب کنید. Caddy در بسته نیست. هر دو برنامه بعداً تحت حساب اختصاصی ویندوز اجرا می‌شوند.
- پیش از ارتقا، برنامه را متوقف و DB و upload را پشتیبان‌گیری کنید. دیتابیس همراه ZIP را روی اطلاعات موجود کپی نکنید. هیچ دستور reset، seed یا db push برای این اصلاح لازم نیست.

## ۲. نصب جدید

در PowerShell از ریشه پروژه:

```powershell
.\deploy\windows\Setup.ps1 -Origin 'https://mes.company.test' -DataDirectory 'C:\MES-data' -InitializeFromBundle
.\deploy\windows\Secure-Admin.ps1
npm.cmd run preflight
```

گزینه InitializeFromBundle فقط برای نصب جدید با دیتابیس همراه است. برای نصب دارای اطلاعات قبلی، ابتدا DB را با نام custom.db و پوشه upload را در MES-data قرار دهید؛ همان فرمان را بدون این گزینه اجرا کنید. DB موجود هرگز بازنویسی نمی‌شود. اسکریپت در صورت وجود .env متوقف می‌شود تا تنظیمات قبلی محفوظ بمانند.

Secure-Admin رمز را پنهان و دوبار دریافت می‌کند، مدیر را ایمن و سایر حساب‌های فعال دارای رمز پیش‌فرض را غیرفعال می‌کند. سپس برای هر همکار حساب شخصی تعریف کنید. داده‌های عملیاتی همراه بسته حذف نمی‌شوند. رمز مشترک جدیدی داخل ZIP قرار داده نشده است.

اگر نصب در میانه شکست خورد، پس از رفع خطا فرمان‌های بخش ارتقا را ادامه دهید؛ .env موجود را بی‌دلیل حذف نکنید.

## ۳. ارتقای نصب موجود

سرویس/Task قبلی را متوقف کنید. از DB و upload نسخه سازگار بگیرید. فایل‌های کد جدید را جایگزین و .env و مسیرهای داده قبلی را حفظ کنید. مقدارهای نمونه زیر را با مسیر و آدرس واقعی خود تطبیق دهید:

```dotenv
DATABASE_URL="file:C:/MES-data/custom.db"
APP_ORIGIN="https://mes.company.test"
SESSION_COOKIE_SECURE="true"
MES_UPLOAD_DIR="C:/MES-data/upload"
MES_BACKUP_DIR="C:/MES-data/backups"
PORT=3000
```

اگر ضمیمه‌های قدیمی در پوشه پروژه‌اند، قبل از تغییر MES_UPLOAD_DIR آن‌ها را در حالت توقف برنامه منتقل کنید. متغیرهای محیطی سیستم و فایل‌های .env.production.local/.env.local/.env.production می‌توانند بر .env مقدم باشند؛ تنظیمات متعارض را برطرف کنید.

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build -- --webpack
.\deploy\windows\Secure-Admin.ps1
npm.cmd run preflight
```

Secure-Admin فقط وقتی لازم است که بخواهید رمز مدیر را تغییر دهید یا حساب‌های پیش‌فرض را تعیین تکلیف کنید. مسیر نسبی DATABASE_URL نسبت به پوشه prisma است؛ مسیر مطلق با / ابهام را حذف می‌کند.

## ۴. HTTPS شبکه داخلی

فایل deploy/windows/Caddyfile.example را به Caddyfile در همان پوشه کپی کنید. نام دامنه را مطابق APP_ORIGIN تغییر دهید. اگر PORT برنامه تغییر کرد، پورت reverse_proxy را نیز تغییر دهید. مسیر لاگ را با مسیر داده خود یکسان کنید و دسترسی نوشتن بدهید.

```powershell
C:\Tools\caddy.exe validate --config .\deploy\windows\Caddyfile --adapter caddyfile
```

نمونه از tls internal استفاده می‌کند: گواهی ریشه همین نمونه Caddy باید در Trusted Root دستگاه‌های کاربران نصب شود. گواهی را از پوشه داده Caddy تحت **همان حساب ویندوزی اجرای Task** دریافت کنید؛ فقط root.crt را توزیع کنید، نه کلید خصوصی. محل داده را با caddy environ تحت همان حساب بررسی کنید. سپس نام سایت باید بدون هشدار گواهی در مرورگر باز شود. برای دسترسی اینترنتی، این نمونه داخلی کافی نیست؛ DNS عمومی/گواهی معتبر و قواعد دسترسی جداگانه لازم است.

فایروال را فقط برای HTTPS شبکه موردنیاز باز کنید، برای مثال در PowerShell مدیر:

```powershell
New-NetFirewallRule -DisplayName 'MES HTTPS LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Domain,Private -RemoteAddress LocalSubnet
```

برای شبکه‌های مسیریابی‌شده محدوده دقیق شعب مجاز را جایگزین LocalSubnet کنید. پورت 3000 را عمومی نکنید. برنامه عمداً روی loopback می‌ماند؛ Caddy دسترسی کاربران را فراهم می‌کند. برای همان نام HTTPS از ابتدا استفاده کنید؛ آدرس IP یا HTTP جایگزین آن نیست.

## ۵. اجرای خودکار بدون بازماندن ترمینال

راهکار این بسته **Windows Task Scheduler** است، نه Windows Service بومی. دو Task در زمان روشن‌شدن ویندوز اجرا می‌شوند، به ورود تعاملی نیاز ندارند و بعد از خطا دوباره اجرا می‌شوند. خاموشی و Sleep سرور همچنان دسترسی کاربران را قطع می‌کند.

حساب اختصاصی غیرمدیر ایجاد کنید؛ روی کد دسترسی خواندن/اجرا و روی MES-data دسترسی Modify بدهید. حساب باید بتواند واردشدن دسته‌ای (Log on as a batch job) داشته باشد؛ سیاست سازمان ممکن است این مجوز را محدود کند. پوشه داده Caddy نیز باید پایدار و قابل نوشتن باشد.

از PowerShell مدیر:

```powershell
.\deploy\windows\Install-Tasks.ps1 -CaddyExe 'C:\Tools\caddy.exe'
Start-ScheduledTask -TaskName MES-App
Start-ScheduledTask -TaskName MES-HTTPS
Get-ScheduledTaskInfo -TaskName MES-App
Get-ScheduledTaskInfo -TaskName MES-HTTPS
```

اسکریپت رمز حساب **ویندوز** را از پنجره استاندارد می‌گیرد، آن را در فایل ذخیره نمی‌کند و Task موجود را بازنویسی نمی‌کند. ثبت Task به‌تنهایی تأیید اجرا نیست: با حساب سرویس preflight را بررسی کنید، سایت را از دستگاه دوم باز کنید و بعد از ری‌استارت ویندوز دوباره آزمایش کنید. برای عیب‌یابی خروجی برنامه، موقتاً پس از توقف Task فرمان npm.cmd run start:production را با همان حساب در ترمینال اجرا کنید.

## ۶. آزمون پیش از تحویل

پیش از شروع Taskها، با پورت‌های 3000 و 3200 آزاد:

```powershell
npm.cmd run test:acceptance
npm.cmd run test:deployment
npm.cmd run test:portable
```

تست‌ها روی کپی مستقل DB کار می‌کنند؛ هنگام تست سرویس واقعی را اجرا نکنید. تست deployment از لینک junction در ویندوز استفاده می‌کند. تست مرورگر اختیاری به Playwright نیاز دارد. بعد از موفقیت:

```powershell
npm.cmd prune --omit=dev --ignore-scripts --no-audit --no-fund
npm.cmd run db:generate
npm.cmd run preflight
```

از حداقل دو کامپیوتر: ورود با دو نقش متفاوت، ثبت سفارش، عملیات انبار/QC، ورود اکسل، آپلود/دانلود ضمیمه و خروج را آزمایش کنید. ثبت هم‌زمان مشتری در تست خودکار جایگزین تست رقابت موجودی و QC یا تست ظرفیت نیست.

## ۷. بکاپ کامل و بازیابی

بکاپ دکمه داخل برنامه فقط DB است. برای بکاپ DB و ضمیمه‌های سازگار، ابتدا هر دو Task و هر اجرای دستی برنامه را متوقف کنید:

```powershell
Stop-ScheduledTask -TaskName MES-HTTPS
Stop-ScheduledTask -TaskName MES-App
.\deploy\windows\Backup-Stopped.ps1 -Destination 'D:\MES-backups\backup-2026-10-11'
Start-ScheduledTask -TaskName MES-App
Start-ScheduledTask -TaskName MES-HTTPS
```

مقصد باید جدید باشد. اسکریپت شنونده پورت را بررسی و هنگام snapshot نوشتن DB را قفل می‌کند؛ مسئول نصب باید مطمئن شود هیچ نویسنده دیگری/نسخه دوم در پورت متفاوت فعال نیست. نسخه نهایی شامل custom.db و upload است. نسخه‌ای را خارج از سرور نگه دارید. اگر بکاپ شکست خورد، خطا را رفع کنید و وضعیت Taskها را بررسی کنید؛ راه‌اندازی مجدد خودکار در این فرمان انجام نمی‌شود.

برای بازیابی: همه اجراها متوقف، DB و upload فعلی محفوظ، جفت DB/upload بکاپ به مسیرهای .env بازگردانده شود. فایل‌های -wal و -shm دیتابیس قبلی را با DB بازیابی‌شده مخلوط نکنید. preflight را اجرا کنید، سپس Taskها را شروع و وجود یک رکورد و ضمیمه مشخص را کنترل کنید.

منابع فنی: https://caddyserver.com/docs/caddyfile/directives/tls ، https://caddyserver.com/docs/caddyfile/directives/reverse_proxy ، https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset
