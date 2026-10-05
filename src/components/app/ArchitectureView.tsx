'use client'

import * as React from 'react'
import { PageHeader, Section, StatusBadge, KpiCard } from './ui-bits'
import { ORDER_STATUS } from '@/lib/labels'
import { ROLE_PERMISSIONS, ROLE_LABELS, PERMISSIONS, type Role } from '@/lib/rbac'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Network, Database, ShieldCheck, GitBranch, FileText, Archive, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'

// ─── مستندات معماری درون‌برنامه‌ای (الزام بند ۳۹ پرامپت) ───

const ENTITIES: { name: string; fields: string; rel: string }[] = [
  { name: 'User / Session', fields: 'id, username, fullName, passwordHash, role, status', rel: 'Session(tokenHash, ip, userAgent, expiresAt) — نشست سمت سرور' },
  { name: 'Product / ProductRevision', fields: 'code, name, warrantyMonths, hasFirmware', rel: 'نسخه‌ها (A/B/C) — isActive' },
  { name: 'Bom / BomItem', fields: 'revision, status(ACTIVE/RETIRED), effectiveDate', rel: 'BomItem → Component (qty, criticality) — بدون Overwrite' },
  { name: 'Component / ComponentLot', fields: 'code, criticality, stockQty, reservedQty', rel: 'Lot(lotNumber, remaining, status PENDING/APPROVED/REJECTED)' },
  { name: 'ProcessStepTemplate', fields: 'stepIndex, name, tools, acceptance, required, needsQc, isPackaging', rel: 'قالب فرایند هر ProductRevision' },
  { name: 'ProductionOrder / OrderStep / StepRecord', fields: 'code, qty, status, ownerId, originType/Ref/IssuedBy/Date, customerId', rel: 'مبدأ درخواست: دستور مدیریتی/صورتجلسه/سفارش مشتری/داخلی؛ OrderStep از قالب کپی؛ StepRecord per device' },
  { name: 'OrderMaterial', fields: 'requiredQty, reservedQty, shortageQty, critical', rel: 'Snapshot بررسی موجودی هر سفارش' },
  { name: 'StockMovement (دفتر گردش کالا)', fields: 'code, type(MANUAL_IN/OUT, ADJUST, BOM_CONSUME, PRODUCTION, IQC_REJECT), qty علامت‌دار, beforeQty/afterQty, reason, orderId', rel: 'Append-Only — تمام تغییرات موجودی با کاربر و مبنا؛ مبنای گزارش گردش کالا' },
  { name: 'Device (Serial)', fields: 'serial یکتا, status, firmwareVersion, bomId, customerId, deliveredAt', rel: 'قلب Traceability — متصل به همه ماژول‌ها' },
  { name: 'DevicePartUsage', fields: 'deviceId, componentId, lotId, qty, source(PRODUCTION/SERVICE)', rel: 'ردیابی دوسویه لات ↔ دستگاه' },
  { name: 'TestTemplate / TestResult', fields: 'stage(INCOMING/IN_PROCESS/FINAL), criteria, min/max', rel: 'TestResult.retestOfId — زنجیره Retest بدون بازنویسی' },
  { name: 'Equipment', fields: 'code, calibratedAt, calibrationDueAt, status', rel: 'بلاک ثبت تست در صورت انقضای کالیبراسیون' },
  { name: 'Nonconformity / ReworkRecord', fields: 'code, type, severity, rootCause, correctiveAction', rel: 'status: OPEN→IN_REWORK→RETEST→RESOLVED→CLOSED' },
  { name: 'ProductRelease', fields: 'releasedById, releasedAt, checksJson', rel: 'Snapshot شرایط پیش‌آزادسازی' },
  { name: 'Customer / ServiceTicket / TicketUpdate', fields: 'code, problem, priority, status', rel: 'گردش‌کار ۹ وضعیتی؛ تکنسین فقط تیکت خودش' },
  { name: 'Complaint', fields: 'severity, safetyImpact, regulatoryReviewStatus', rel: 'بررسی Reportable توسط انسان — نه سیستم' },
  { name: 'Repair / RepairPart', fields: 'diagnosis, failureMode, rootCause, result', rel: 'RepairPart → Component + Lot؛ کسر خودکار موجودی' },
  { name: 'WarrantyOverride', fields: 'status, reason, setById', rel: 'گارانتی محاسبه‌شده + Override کنترل‌شده' },
  { name: 'Document', fields: 'docType, revision, status(ACTIVE/SUPERSEDED)', rel: 'فایل فیزیکی upload/ با UUID — Path Traversal مسدود' },
  { name: 'AuditLog', fields: 'userId, action, oldValues, newValues, ip, userAgent', rel: 'Append-Only — بدون API حذف/ویرایش' },
  { name: 'Notification / NotificationRead', fields: 'targetRole/targetUserId, severity, linkView', rel: 'خوانده‌شده per user' },
]

const WORKFLOWS: { title: string; steps: string[]; desc: string }[] = [
  {
    title: 'گردش‌کار سفارش تولید (از صدور درخواست تا بستن پروژه)',
    steps: ['ثبت درخواست (دستور مدیریتی / صورت‌جلسه / سفارش مشتری / داخلی)', 'تأیید‌شده (رزرو خودکار BOM×تعداد)', 'بررسی مواد (توقف در کمبود بحرانی)', 'آماده تولید', 'در حال تولید (ساخت سریال‌ها + مصرف FIFO لات + ثبت دفتر گردش کالا)', 'در انتظار QC', 'Rework ⇄ Retest', 'تکمیل تولید', 'آزادسازی (سطح دستگاه)', 'انبار محصول یا ارسال مستقیم', 'خروج از انبار و ارسال', 'بستن پروژه'],
    desc: 'هر گذار: مجوز نقش + گارد سمت سرور (مثلاً «همهٔ دستگاه‌ها آزادسازی/تحویل شده باشند»). لغو فقط از وضعیت‌های اولیه و با آزادسازی رزروها. برد کانبان همان زنجیره است و کارت‌ها با کشیدن‌ور‌ها کردن و اعتبارسنجی سرور جابه‌جا می‌شوند.',
  },
  {
    title: 'گردش‌کار QC و Retest',
    steps: ['ثبت تست', 'Pass → محاسبه مجدد وضعیت دستگاه', 'Fail اجباری → دستگاه QC_FAIL + NCR خودکار + سفارش REWORK', 'Rework (ثبت اقدام)', 'Retest (رکورد جدید در زنجیره)', 'Pass → NCR=RESOLVED، دستگاه QC_PASS', 'شرایط آزادسازی: همه تست‌های اجباری latest-pass'],
    desc: 'هیچ سابقه‌ای حذف یا بازنویسی نمی‌شود؛ Retest با retestOfId زنجیره می‌سازد. تجهیزات با کالیبراسیون منقضی، تست را بلاک می‌کند.',
  },
  {
    title: 'گردش‌کار شکایت (مجزا از تیکت)',
    steps: ['باز', 'در حال بررسی (علت ریشه‌ای)', 'CAPA (اصلاحی/پیشگیرانه)', 'در انتظار تأیید', 'بسته / رد'],
    desc: 'اگر safetyImpact≠NO یا severity∈{HIGH,CRITICAL}: صف بررسی رگولاتوری PENDING — تصمیم Reportable فقط توسط فرد واجد صلاحیت (QC/مدیر) با ثبت Audit.',
  },
  {
    title: 'گردش‌کار خدمات',
    steps: ['جدید', 'در بررسی', 'ارجاع به تکنسین', 'عیب‌یابی', 'در انتظار قطعه', 'تعمیر (ثبت قطعات با لات)', 'تست', 'رفع مشکل', 'بسته'],
    desc: 'تکنسین فقط تیکت‌های خودش را به‌روز می‌کند؛ بستن فقط توسط مدیر خدمات. قطعات مصرفی با کسر موجودی و ردیابی دوسویه.',
  },
]

export default function ArchitectureView() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="معماری سامانه (مستندات فنی)"
        desc="معماری سیستم، ساختار دیتابیس، ماتریس دسترسی، گردش‌کار‌ها، مدل Traceability، امنیت و استراتژی Backup — طبق الزامات طراحی"
      />

      <Tabs defaultValue="arch">
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="arch" className="gap-1.5"><Network className="w-3.5 h-3.5" aria-hidden="true" /> معماری سیستم</TabsTrigger>
          <TabsTrigger value="db" className="gap-1.5"><Database className="w-3.5 h-3.5" aria-hidden="true" /> ساختار دیتابیس</TabsTrigger>
          <TabsTrigger value="rbac" className="gap-1.5"><ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> ماتریس دسترسی</TabsTrigger>
          <TabsTrigger value="flow" className="gap-1.5"><GitBranch className="w-3.5 h-3.5" aria-hidden="true" /> گردش‌کارها</TabsTrigger>
          <TabsTrigger value="trace" className="gap-1.5"><FileText className="w-3.5 h-3.5" aria-hidden="true" /> مدل Traceability</TabsTrigger>
          <TabsTrigger value="sec" className="gap-1.5"><ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> امنیت و Backup</TabsTrigger>
          <TabsTrigger value="test" className="gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> برنامه تست</TabsTrigger>
        </TabsList>

        {/* ─── معماری ─── */}
        <TabsContent value="arch" className="mt-3 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="موجودیت‌های داده" value={faInt(36)} tone="info" icon={<Database className="w-5 h-5" />} />
            <KpiCard label="نقش‌های کاربری" value={faInt(9)} tone="info" icon={<ShieldCheck className="w-5 h-5" />} />
            <KpiCard label="API Endpoints" value={faInt(30)} tone="info" icon={<Network className="w-5 h-5" />} />
            <KpiCard label="گردش‌کار کنترل‌شده" value={faInt(4)} tone="info" icon={<GitBranch className="w-5 h-5" />} />
          </div>
          <Section title="معماری سه‌لایه" desc="هر درخواست از سه لایه عبور می‌کند و هیچ منطق کنترلی فقط در فرانت‌اند نیست">
            <div className="space-y-3">
              {[
                { t: 'لایه ارائه (Presentation)', d: 'Next.js 16 + React 19 + Tailwind 4 + shadcn/ui — تک‌صفحه‌ای (SPA)، RTL فارسی، فونت وزیرمتن. UI فقط «گذار‌های مجازِ محاسبه‌شده سمت سرور» را نمایش می‌دهد؛ حتی اگر کاربر با ابزار توسعه دکمه‌ای را فعال کند، سرور گذار را رد می‌کند.' },
                { t: 'لایه منطق (API + Workflow Engine)', d: '30 Endpoint با ساختار withApi: احراز نشست → requirePerm (RBAC) → اعتبارسنجی Zod → گارد‌های Workflow → تراکنش Prisma → ثبت Audit → Notification. ترجمه‌ی خطاهای فنی به پیام‌های فارسی (جزئیات فقط در لاگ سرور).' },
                { t: 'لایه داده (Prisma + SQLite)', d: 'اسکیمای Normalized با FK/Unique/Index/Referential Integrity. حذف فیزیکی ممنوع — Archive/Deactivate. AuditLog بدون API حذف/ویرایش (Append-Only).' },
              ].map((l, i) => (
                <div key={i} className="rounded-xl border p-4">
                  <div className="font-semibold text-sm mb-1">{faInt(i + 1)}. {l.t}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{l.d}</div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="اصول حاکم بر طراحی" desc="اولویت‌ها: امنیت > یکپارچگی داده > ردیابی > کارایی">
            <div className="grid sm:grid-cols-2 gap-2.5">
              {[
                'هر موجودیت مهم: کلید یکتا (شماره سفارش/سریال/تیکت/شکایت/NCR) با قید UNIQUE در دیتابیس',
                'BOM و مستندات فقط با Revision جدید تغییر می‌کنند — هرگز Overwrite',
                'وضعیت‌ها فقط از مسیر‌های مجاز Workflow — بدون Skip',
                'هر عملیات حساس: Audit با مقدار قبلی/جددید + IP + User-Agent',
                'اعتبارسنجی ورودی در هر دو لایه (Zod سمت سرور + فرم سمت کلاینت)',
                'رزرو موجودی خودکار و Transaction-safe؛ لغو سفارش، رزرو را آزاد می‌کند',
                'مصرف قطعات FIFO از لات‌های APPROVED با ثبت ردیابی per-device',
                'خطاهای فنی هرگز به کاربر عادی نمایش داده نمی‌شوند',
              ].map((p, i) => (
                <div key={i} className="flex gap-2 items-start text-sm rounded-lg border p-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{p}</span>
                </div>
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* ─── دیتابیس ─── */}
        <TabsContent value="db" className="mt-3">
          <Section title="ساختار دیتابیس (Entity List)" desc="۳۵ جدول Normalized — نمای فشرده فیلد‌های کلیدی و روابط">
            <div className="space-y-2">
              {ENTITIES.map((e) => (
                <div key={e.name} className="rounded-lg border p-3">
                  <div className="font-mono text-[13px] font-semibold text-teal-700">{e.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">{e.fields}</div>
                  <div className="text-xs mt-1.5 leading-relaxed">{e.rel}</div>
                </div>
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* ─── RBAC ─── */}
        <TabsContent value="rbac" className="mt-3">
          <Section title="ماتریس نقش × مجوز" desc="تک‌منبع حقیقت: src/lib/rbac.ts — اعمال اجباری در همه APIها">
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/70">
                    <th className="text-right px-2 py-2 sticky right-0 bg-muted/70">مجوز</th>
                    {(Object.keys(ROLE_PERMISSIONS) as Role[]).map((r) => (
                      <th key={r} className="px-1.5 py-2 text-center whitespace-nowrap">{ROLE_LABELS[r]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(PERMISSIONS).map(([perm, label]) => (
                    <tr key={perm} className="border-b hover:bg-accent/40">
                      <td className="px-2 py-1.5 sticky right-0 bg-background whitespace-nowrap">
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground font-mono text-[10px] block">{perm}</span>
                      </td>
                      {(Object.keys(ROLE_PERMISSIONS) as Role[]).map((r) => {
                        const has = ROLE_PERMISSIONS[r].includes(perm as never)
                        return (
                          <td key={r} className="text-center px-1.5 py-1.5">
                            {has ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" /> : <XCircle className="w-3.5 h-3.5 text-gray-300 inline" />}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </TabsContent>

        {/* ─── گردش‌کار‌ها ─── */}
        <TabsContent value="flow" className="mt-3 space-y-4">
          {WORKFLOWS.map((w) => (
            <Section key={w.title} title={w.title} desc={w.desc}>
              <div className="flex flex-wrap items-center gap-1.5">
                {w.steps.map((s, i) => (
                  <React.Fragment key={i}>
                    <span className="text-xs rounded-lg border bg-muted/50 px-2.5 py-1.5">{s}</span>
                    {i < w.steps.length - 1 && <span className="text-muted-foreground text-xs">←</span>}
                  </React.Fragment>
                ))}
              </div>
            </Section>
          ))}
          <Section title="نمونه گارد‌های سخت سمت سرور">
            <div className="space-y-2">
              {[
                'شروع تولید: قطعه بحرانیِ کسری → گذار رد می‌شود (مگر Override با مجوز خاص + Audit)',
                'ارسال به QC: همه مراحل اجباری DONE و سریال همه دستگاه‌ها ثبت‌شده',
                'تکمیل تولید: هیچ دستگاهی با وضعیت QC_FAIL/REWORK نباشد',
                'آزادسازی: ۶ شرط (مراحل، بسته‌بندی، سریال، تست‌های اجباری latest-pass، Firmware تأیید‌شده، تأیید QC)',
                'بستن NCR/شکایت: علت ریشه‌ای + اقدام اصلاحی ثبت‌شده',
                'ثبت تست: تجهیزات نباید کالیبراسیون منقضی داشته باشد؛ دستگاه آزاد‌شده قابل تست مجدد نیست',
              ].map((g, i) => (
                <div key={i} className="flex gap-2 text-sm rounded-lg border p-2.5">
                  <span className="text-amber-600 font-bold">⛔</span>
                  <span className="leading-relaxed">{g}</span>
                </div>
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* ─── Traceability ─── */}
        <TabsContent value="trace" className="mt-3">
          <Section title="مدل Traceability — زنجیره پرونده دیجیتال" desc="با جستجوی شماره سریال، تمام زنجیره قابل بازیابی است">
            <Card>
              <CardContent className="p-4 overflow-x-auto">
                <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ direction: 'rtl' }}>
                  {['شماره سریال', 'محصول', 'نسخه محصول', 'سفارش تولید', 'نسخه BOM', 'قطعات (BOM)', 'لات‌های مصرفی', 'اپراتور‌های تولید', 'مراحل + زمان', 'Firmware/Software', 'نتایج تست + Retest', 'QC', 'آزادسازی', 'مشتری + تحویل', 'گارانتی', 'تعمیرات', 'قطعات سرویس', 'شکایات'].map((s, i, arr) => (
                    <React.Fragment key={i}>
                      <span className="rounded-md border bg-teal-50 border-teal-200 text-teal-800 px-1.5 py-1">{s}</span>
                      {i < arr.length - 1 && <span className="text-muted-foreground">←</span>}
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Section>
          <div className="grid md:grid-cols-2 gap-4">
            <Section title="ردیابی دوسویه لات ↔ دستگاه" desc="DevicePartUsage با source=PRODUCTION/SERVICE">
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="rounded-lg border p-3">
                  <div className="font-medium text-[13px] mb-1.5">جهت ۱: لات ← دستگاه‌ها</div>
                  LOT-X → PX100-B-0101، PX100-B-0102، PX100-B-0305 … (همه دستگاه‌های مصرف‌کننده با یک کوئری)
                </div>
                <div className="rounded-lg border p-3">
                  <div className="font-medium text-[13px] mb-1.5">جهت ۲: دستگاه ← لات‌ها</div>
                  PX100-B-0102 → SENS (LOT-Y) + PCB (LOT-X) + … (از پرونده دستگاه در تب «قطعات و لات‌ها»)
                </div>
                <div className="rounded-lg border p-3 bg-muted/40">
                  <div className="font-medium text-[13px] mb-1.5">کاربرد عملی (Recall)</div>
                  اگر لات LOT-X قطعه معیوب اعلام شود: فهرست دقیق دستگاه‌های مصرف‌کننده + مشتریان + تاریخچه خدمات آن‌ها در چند ثانیه استخراج می‌شود.
                </div>
              </div>
            </Section>
            <Section title="Firmware Traceability" desc="ثبت نسخه دقیق زمان تولید — دستگاه‌های قبلی با انتشار نسخه جدید تغییر نمی‌کنند">
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="rounded-lg border p-3 font-mono text-xs">
                  device.PX100-B-0101:<br />
                  &nbsp;&nbsp;firmware: v1.0.8 (flashed ۱۴۰۴/۰۳/۲۵ — JTAG)<br />
                  &nbsp;&nbsp;software: v1.0.2 · verified: ✓<br />
                  device.PX100-B-0201:<br />
                  &nbsp;&nbsp;firmware: v2.1.3 (flashed …)
                </div>
                <div className="text-muted-foreground">آزادسازی Firmware ثبت‌نشده/تأیید‌نشده → شرط آزادسازی برقرار نیست (گارد سرور).</div>
              </div>
            </Section>
          </div>
        </TabsContent>

        {/* ─── امنیت ─── */}
        <TabsContent value="sec" className="mt-3 space-y-4">
          <Section title="معماری امنیت" desc="Defense in Depth — چند لایه مستقل">
            <div className="grid sm:grid-cols-2 gap-2.5">
              {[
                { t: 'Authentication', d: 'هش رمز با scrypt + salt تصادفی + مقایسه timing-safe؛ نشست‌های DB با توکن ۲۵۶بیتی هش‌شده؛ انقضا ۸ ساعته؛ کوکی httpOnly/sameSite' },
                { t: 'Rate Limiting', d: 'حداکثر ۸ تلاش ورود در ۱۵ دقیقه per username+IP — با ثبت رویداد امنیتی' },
                { t: 'Authorization', d: 'RBAC سمت سرور در همه Endpointها (requirePerm)؛ تکنسین فقط تیکت خودش؛ جلوگیری از Privilege Escalation (عدم تغییر نقش خود)' },
                { t: 'Input Validation', d: 'Zod سمت سرور + محدودیت حجم/نوع فایل (۱۰MB، فرمت‌های مجاز) + basename در دانلود (ضد Path Traversal)' },
                { t: 'Injection & XSS', d: 'Prisma (کوئری‌های پارامتری) + رندر React با Escaping پیش‌فرض؛ بدون dangerouslySetInnerHTML' },
                { t: 'Security Events', d: 'ورود ناموفق، Rate Limit، دسترسی غیرمجاز، گذار غیرمجاز — همه در AuditLog با IP/User-Agent' },
                { t: 'Secrets', d: 'هیچ Secret/API Key در کد فرانت‌اند؛ DATABASE_URL در Environment Variable (.env) — عدم افشای اطلاعات حساس به مرورگر' },
                { t: 'خطاهای فارسی', d: 'خطاهای فنی (FK/Unique/…) به پیام کاربردی ترجمه می‌شوند؛ جزئیات فقط در لاگ سرور' },
              ].map((s, i) => (
                <div key={i} className="rounded-xl border p-3.5">
                  <div className="flex items-center gap-2 font-semibold text-[13px] mb-1.5"><ShieldCheck className="w-4 h-4 text-teal-700" /> {s.t}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{s.d}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="استراتژی Backup و Recovery" icon={<Archive className="w-4 h-4" />}>
            <div className="space-y-2.5 text-sm leading-relaxed">
              <div className="rounded-lg border p-3"><b>پشتیبان‌گیری:</b> Snapshot فوری SQLite (کپی فایل با Timestamp) — از تب «مدیریت سامانه ← پشتیبان‌گیری» با مجوز system.backup و ثبت Audit.</div>
              <div className="rounded-lg border p-3"><b>سیاست نگهداری:</b> حداکثر ۳۰ نسخه روی سرور (حذف قدیمی‌ترین به‌صورت خودکار) + توصیه کپی Offline خارج از سرور.</div>
              <div className="rounded-lg border p-3"><b>Restore:</b> چهار مرحله مستند‌شده (توقف سرویس → جایگزینی فایل → راه‌اندازی → ثبت در Audit) — در تب پشتیبان‌گیری قابل مشاهده است.</div>
              <div className="rounded-lg border p-3"><b>تست دوره‌ای:</b> توصیه اجرای بازیابی آزمایشی هر ۳ ماه و ثبت نتیجه در سوابق کیفیت.</div>
            </div>
          </Section>

          <Section title="ملاحظه رگولاتوری" desc="توضیح صادقانه درباره استاندارد‌ها">
            <div className="text-sm leading-relaxed bg-amber-50/70 border border-amber-200 rounded-xl p-4">
              این نرم‌افزار برای <b>پشتیبانی از فرایند‌های QMS</b> شرکت طراحی شده است (Traceability، Data Integrity، Document Control، Auditability).
              اما تا انجام اعتبارسنجی رسمی (Validation) توسط سازمان، <b>ادعای مطابیت با ISO 13485 یا هر استاندارد رگولاتوری دیگر نمی‌شود</b>.
              تصمیم‌های رگولاتوری (مانند Reportable بودن حادثه) نیز عمداً به گردش‌کار انسانی سپرده شده است.
            </div>
          </Section>
        </TabsContent>

        {/* ─── برنامه تست ─── */}
        <TabsContent value="test" className="mt-3">
          <Section title="برنامه تست (مثبت + منفی)" desc="سناریوهای الزامی بند ۳۶ پرامپت — با حساب‌های نمایشی قابل اجرا">
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/70">
                  <th className="text-right px-2 py-2">سناریو</th>
                  <th className="text-right px-2 py-2">آزمون مثبت (مجاز)</th>
                  <th className="text-right px-2 py-2">آزمون منفی (باید رد شود)</th>
                </tr></thead>
                <tbody>
                  {[
                    ['ورود/خروج', 'ورود با admin/demo1234 → داشبورد', 'رمز غلط → «نام کاربری یا رمز نادرست» + ثبت SEC_LOGIN_FAILED؛ ۸ تلاش → Rate Limit'],
                    ['دسترسی نقش‌ها', 'qc → آزادسازی دستگاه آماده', 'operator → دکمه آزادسازی ندارد؛ فراخوانی مستقیم API → 403 + SEC_ACCESS_DENIED'],
                    ['سفارش تولید', 'pmgr: تأیید PO-11 → رزرو خودکار مواد', 'تأیید سفارش بدون BOM → خطای گارد؛ تغییر وضعیت دلخواه → «گذار مجاز نیست»'],
                    ['کمبود بحرانی', 'pmgr با مجوز Override: عبور از کمبود PO-14 (ثبت Audit)', 'شروع تولید PO-14 (موتور پمپ کسری) → گارد رد می‌کند'],
                    ['شماره سریال', 'شروع تولید PO-11 → سریال‌های یکتای خودکار', 'ثبت سریال تکراری → قید UNIQUE دیتابیس + پیام فارسی'],
                    ['QC Pass/Fail', 'qc: ثبت FIN-ACC مقدار 1.3 → PASS', 'مقدار 4.1 → FAIL خودکار + NCR + دستگاه QC_FAIL + سفارش REWORK؛ تست روی دستگاه RELEASED → رد'],
                    ['Retest', 'qc: Retest پس از Rework → رکورد زنجیره‌ای', 'Retest روی تست موفق → رد؛ ویرایش نتیجه قبلی → API وجود ندارد'],
                    ['آزادسازی', 'شرایط کامل → آزاد و قفل سوابق', 'دستگاه QC_FAIL یا تست تأیید‌نشده → «شرایط آزادسازی برقرار نیست»'],
                    ['تجهیزات کالیبراسیون', 'ثبت تست با EQ-SIM (فعال)', 'EQ-SCOP منقضی → «کالیبراسیون منقضی؛ ابتدا کالیبره کنید»'],
                    ['خدمات', 'tech1: عیب‌یابی ST-001 → ثبت تعمیر با قطعه', 'tech1 تغییر تیکت tech2 → «فقط تیکت‌های خودتان»؛ مصرف بیش از موجودی → رد'],
                    ['شکایت', 'ثبت شکایت HIGH → صف رگولاتوری PENDING', 'کاربر بدون service.regulatory.review تصمیم رگولاتوری ثبت کند → 403'],
                    ['گارانتی', 'smgr: Override با دلیل → Audit', 'Override بدون دلیل/بدون مجوز → رد'],
                    ['Audit', 'مشاهده لاگ با فیلتر', 'هر تلاش حذف/ویرایش Audit → API وجود ندارد (Append-Only)'],
                    ['مستندات', 'بارگذاری PDF → نسخه ۱', 'فایل >۱۰MB یا فرمت exe → رد؛ بازنویسی → فقط با نسخه جدید'],
                    ['Backup', 'admin: ایجاد پشتیبان + دانلود', 'کاربر غیر admin → 403؛ نام فایل مخرب (../) → basename مسدود'],
                  ].map((row, i) => (
                    <tr key={i} className="border-b hover:bg-accent/40">
                      <td className="px-2 py-2 font-medium whitespace-nowrap">{row[0]}</td>
                      <td className="px-2 py-2 text-emerald-800">{row[1]}</td>
                      <td className="px-2 py-2 text-rose-800">{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
