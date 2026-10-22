# راهنمای استقرار نسخه اصلاح‌شده

برای استقرار چندکاربره روی ویندوز، سند مرجع **WINDOWS-SETUP.md** است؛ دستورهای PowerShell و اسکریپت‌های deploy/windows همراه بسته‌اند.

- نسخه موردنیاز Node.js: 24؛ مدیریت وابستگی فقط npm با package-lock.json.
- پیش از ارتقا، برنامه متوقف و DB و upload پشتیبان‌گیری شوند؛ تنظیمات .env نصب فعلی حفظ شود.
- این اصلاح schema دیتابیس را تغییر نداده؛ db push، reset و seed اجرا نشوند.
- نصب جدید از دیتابیس همراه نیازمند انتخاب صریح InitializeFromBundle است. حساب‌های پیش‌فرض در مقصد با رمز شخصی تعیین تکلیف می‌شوند؛ داده اصلی همراه بسته عمداً دست‌نخورده است.
- مسیرهای MES_UPLOAD_DIR و MES_BACKUP_DIR قابل تنظیم‌اند و DATABASE_URL بهتر است مطلق باشد.
- برنامه با npm run start:production اجرا می‌شود، preflight اجباری است و شنونده فقط 127.0.0.1 است؛ PORT قابل تنظیم است.
- HTTPS و APP_ORIGIN دقیق اجباری‌اند. نسخه نمونه Caddy برای شبکه داخلی است و نیاز به DNS و اعتماد دستگاه‌ها به گواهی ریشه دارد.
- Windows Task Scheduler اجرای خودکار را فراهم می‌کند؛ این بسته Windows Service بومی نصب نمی‌کند.
- بکاپ داخلی برنامه فقط DB است؛ Backup-Stopped.ps1 برای جفت DB و upload در حالت توقف برنامه اضافه شده است.
- قبل از بازکردن دسترسی، آزمون مقصد، ری‌استارت ویندوز، ورود از دو دستگاه و بازیابی انجام شود.

ساخت و آزمون مستقل در ریشه پروژه:

```text
npm ci
npm run db:generate
npm run typecheck
npm run lint
npm run build -- --webpack
npm run test:acceptance
npm run test:deployment
npm run test:portable
npm prune --omit=dev --ignore-scripts --no-audit --no-fund
npm run db:generate
npm run preflight
```

preflight روی DB پیش‌فرض تا زمان ایمن‌سازی حساب‌ها به‌درستی شکست می‌خورد. تست‌ها برای رمزهای آزمایشی از کپی مستقل استفاده می‌کنند. پورت 3000 و 3200 هنگام آزمون آزاد باشند.

گزارش همین اصلاح در DEPLOYMENT-CHECK.md است. گزارش‌های دیگر بسته ممکن است مربوط به نسخه پیشین باشند.
