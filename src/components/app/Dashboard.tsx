'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api'
import { useApp } from './store'
import { KpiCard, Section, RelDate, MiniStat, ProgressRing } from './ui-bits'
import {
  AlertTriangle, AlertCircle, Factory, ClipboardCheck, Wrench, PackageCheck,
  ShieldCheck, CalendarDays, Sparkles, TrendingUp, HeartPulse,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'

interface DashboardData {
  kpi: {
    activeOrders: number; todayDevices: number; monthDevices: number; waitingMaterial: number
    inProduction: number; waitingQc: number; failedDevices: number; releasedDevices: number
    openNcrs: number; openTickets: number; overdueTickets: number; openComplaints: number
    activeRepairs: number; overdueServices: number; awaitingRelease: number; criticalNotifs: number
    monthTests: number; failTests: number; rejectRate: number
  }
  alerts: { type: string; severity: string; title: string; body: string; orderId: string; orderCode: string }[]
  byProduct: { code: string; name: string; count: number }[]
  topFailures: { code: string; name: string; count: number }[]
  notifications: { id: string; title: string; body: string; severity: string; createdAt: string }[]
  user: { role: string; fullName: string }
}

// ─── خط نبض روشن برای بنر ───
function EcgLight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 56" className={cn('w-full h-10', className)} fill="none" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id="ecg-light" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="30%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="70%" stopColor="#a7f3d0" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 28 L36 28 L46 28 L52 14 L60 44 L66 28 L112 28 L122 28 L128 20 L136 38 L142 28 L190 28 L200 28 L206 12 L214 46 L220 28 L268 28 L278 28 L284 22 L292 36 L298 28 L320 28"
        stroke="url(#ecg-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ecg-path"
      />
    </svg>
  )
}

export default function Dashboard() {
  const { navigate, user } = useApp()
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => apiGet<DashboardData>('/api/dashboard'), refetchInterval: 60_000 })
  const k = data?.kpi

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'صبح بخیر' : hour < 17 ? 'ظهر بخیر' : 'عصر بخیر'
  const today = new Date().toLocaleDateString('fa-IR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const monthTests = k?.monthTests ?? 0
  const failTests = k?.failTests ?? 0
  const passTests = Math.max(monthTests - failTests, 0)
  const passRate = monthTests > 0 ? Math.round((passTests / monthTests) * 100) : 100

  return (
    <div className="space-y-6">
      {/* ═══ بنر خوش‌آمد ═══ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-teal-800 via-teal-700 to-emerald-600 text-white p-5 md:p-7 anim-fade-up shadow-xl shadow-teal-900/20">
        <div className="absolute inset-0 bg-med-grid opacity-40" aria-hidden="true" />
        <div className="absolute -top-20 -left-20 w-56 h-56 rounded-full bg-white/10 blur-2xl anim-float" aria-hidden="true" />
        <div className="absolute -bottom-24 right-1/3 w-64 h-64 rounded-full bg-emerald-300/10 blur-3xl" aria-hidden="true" />
        <EcgLight className="absolute bottom-0 right-0 left-0 opacity-60" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-teal-100/90 text-xs mb-2">
              <CalendarDays className="w-4 h-4" aria-hidden="true" />
              <span className="tnum">{today}</span>
              <span className="live-dot !bg-emerald-300" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-extrabold leading-snug drop-shadow-sm">
              {greet}، <span className="text-emerald-200">{user?.fullName ?? ''}</span>
            </h1>
            <p className="text-sm text-teal-50/85 mt-2 max-w-2xl leading-relaxed">
              خلاصهٔ وضعیت تولید، کیفیت و خدمات پس از فروش سازمان شما در یک نگاه
            </p>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            {[
              { v: k?.activeOrders ?? 0, l: 'سفارش فعال', icon: <Factory className="w-4 h-4" /> },
              { v: k?.releasedDevices ?? 0, l: 'دستگاه آزاد‌شده', icon: <PackageCheck className="w-4 h-4" /> },
              { v: k?.criticalNotifs ?? 0, l: 'هشدار بحرانی', icon: <AlertTriangle className="w-4 h-4" /> },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1 rounded-xl bg-white/10 backdrop-blur border border-white/15 px-4 py-3 min-w-24 hover:bg-white/15 transition-colors">
                <span className="text-teal-100/80">{s.icon}</span>
                <span className="text-xl font-extrabold tnum leading-none">{faInt(s.v)}</span>
                <span className="text-[10px] text-teal-50/80 whitespace-nowrap">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ شبکهٔ KPI ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 stagger">
        <KpiCard label="سفارش‌های فعال" value={k?.activeOrders ?? 0} tone="info" icon={<Factory className="w-5 h-5" />} onClick={() => navigate('orders')} sub="بدون احتساب پیش‌نویس و بسته‌شده‌ها" />
        <KpiCard label="تولید امروز" value={k?.todayDevices ?? 0} tone="success" icon={<Sparkles className="w-5 h-5" />} />
        <KpiCard label="تولید این ماه" value={k?.monthDevices ?? 0} tone="info" icon={<TrendingUp className="w-5 h-5" />} />
        <KpiCard label="در انتظار مواد" value={k?.waitingMaterial ?? 0} tone="warning" icon={<AlertTriangle className="w-5 h-5" />} onClick={() => navigate('orders')} />
        <KpiCard label="در حال تولید" value={k?.inProduction ?? 0} tone="info" icon={<Factory className="w-5 h-5" />} onClick={() => navigate('orders')} />
        <KpiCard label="در انتظار QC" value={k?.waitingQc ?? 0} tone="warning" icon={<ClipboardCheck className="w-5 h-5" />} onClick={() => navigate('quality')} />
        <KpiCard label="دستگاه‌های مردود" value={k?.failedDevices ?? 0} tone="danger" icon={<AlertTriangle className="w-5 h-5" />} onClick={() => navigate('quality', { tab: 'ncrs' })} />
        <KpiCard label="دستگاه‌های آزاد‌شده" value={k?.releasedDevices ?? 0} tone="success" icon={<PackageCheck className="w-5 h-5" />} onClick={() => navigate('release')} />
        <KpiCard label="در انتظار آزادسازی" value={k?.awaitingRelease ?? 0} tone="warning" icon={<PackageCheck className="w-5 h-5" />} onClick={() => navigate('release')} />
        <KpiCard label="عدم انطباق باز" value={k?.openNcrs ?? 0} tone="danger" icon={<AlertCircle className="w-5 h-5" />} onClick={() => navigate('quality', { tab: 'ncrs' })} />
        <KpiCard label="تیکت‌های باز" value={k?.openTickets ?? 0} tone="warning" icon={<Wrench className="w-5 h-5" />} onClick={() => navigate('service', { tab: 'tickets' })} sub={`${faInt(k?.overdueTickets ?? 0)} تیکت معوق`} />
        <KpiCard label="شکایات باز" value={k?.openComplaints ?? 0} tone="danger" icon={<AlertCircle className="w-5 h-5" />} onClick={() => navigate('service', { tab: 'complaints' })} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ═══ هشدار‌های مهم ═══ */}
        <Section title="هشدار‌های مهم" desc="کمبود مواد، شکست تست و موارد نیازمند اقدام" className="lg:col-span-2">
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {(data?.alerts ?? []).length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full bg-emerald-50 anim-float" />
                  <ShieldCheck className="absolute inset-0 m-auto w-8 h-8 text-emerald-500" strokeWidth={1.8} />
                </div>
                <div className="text-sm">هیچ هشدار فعالی وجود ندارد</div>
              </div>
            )}
            {(data?.alerts ?? []).map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-3 items-start rounded-xl border p-3 anim-fade-right transition-shadow hover:shadow-md',
                  a.severity === 'CRITICAL' ? 'border-rose-200 bg-gradient-to-l from-rose-50/80 to-rose-50/30' : 'border-amber-200 bg-gradient-to-l from-amber-50/80 to-amber-50/30',
                )}
                style={{ animationDelay: `${Math.min(i * 0.05, 0.4)}s` }}
              >
                <div className={cn(
                  'rounded-lg p-1.5 shrink-0 shadow-sm',
                  a.severity === 'CRITICAL' ? 'bg-gradient-to-br from-rose-500 to-red-400 text-white' : 'bg-gradient-to-br from-amber-500 to-orange-400 text-white',
                )}>
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{a.title}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.body}</div>
                </div>
                {a.orderCode && (
                  <button className="text-xs font-semibold text-teal-700 hover:text-teal-800 hover:underline shrink-0 tnum bg-teal-50 rounded-md px-2 py-1 border border-teal-100 transition-colors" onClick={() => navigate('order-detail', { id: a.orderId })}>
                    {a.orderCode}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* ═══ اعلان‌های من ═══ */}
        <Section title="اعلان‌های من" desc="مطابق نقش شما برایتان ارسال شده است">
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {(data?.notifications ?? []).length === 0 && <div className="text-sm text-muted-foreground text-center py-8">اعلان ناخوانده‌ای ندارید</div>}
            {data?.notifications.map((n, i) => (
              <div key={n.id} className="rounded-xl border p-3 space-y-1 anim-fade-right hover:shadow-sm hover:border-teal-200/70 transition-all" style={{ animationDelay: `${Math.min(i * 0.05, 0.4)}s` }}>
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', n.severity === 'CRITICAL' ? 'bg-rose-500' : n.severity === 'WARNING' ? 'bg-amber-500' : n.severity === 'SUCCESS' ? 'bg-emerald-500' : 'bg-teal-400')} />
                  <span className="text-[13px] font-semibold leading-snug">{n.title}</span>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{n.body}</div>
                <RelDate date={n.createdAt} />
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ═══ شاخص‌های کیفیت ماه (حلقه‌های پیشرفت) ═══ */}
        <Section title="شاخص‌های کیفیت (۳۰ روز اخیر)" desc="نتیجهٔ تست‌های ثبت‌شده در سامانه">
          <div className="grid grid-cols-3 gap-4 items-start py-2">
            <ProgressRing value={passTests} max={Math.max(monthTests, 1)} tone="success" label={<span className="text-emerald-700">{faInt(passRate)}٪</span>} sub="نرخ قبولی" />
            <ProgressRing value={failTests} max={Math.max(monthTests, 1)} tone="danger" label={<span className="text-rose-700">{faInt(failTests)}</span>} sub="تست ناموفق" />
            <ProgressRing value={k?.rejectRate ?? 0} max={100} tone="warning" label={<span className="text-amber-700">{faInt(k?.rejectRate ?? 0)}٪</span>} sub="نرخ مردودی" />
          </div>
          <div className="mt-4 pt-3 border-t">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2.5">
              <HeartPulse className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
              پرتکرارترین تست‌های ناموفق
            </div>
            <div className="space-y-2">
              {(data?.topFailures ?? []).length === 0 && <div className="text-sm text-muted-foreground py-2">ناموفقی ثبت نشده است</div>}
              {data?.topFailures.map((f, i) => {
                const maxF = Math.max(...(data?.topFailures.map((x) => x.count) ?? [1]))
                return (
                  <div key={f.code} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="truncate font-medium">{f.name}</span>
                      <span className="text-rose-700 font-bold tnum shrink-0">{faInt(f.count)} مورد</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-rose-500 to-rose-400 bar-grow"
                        style={{ width: `${(f.count / maxF) * 100}%`, animationDelay: `${i * 0.08}s` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Section>

        {/* ═══ تولید ماه بر اساس محصول ═══ */}
        <Section title="تولید این ماه بر اساس محصول" desc="تعداد دستگاه‌های ثبت‌شده در ۳۰ روز اخیر">
          <div className="space-y-4 pt-1">
            {(data?.byProduct ?? []).length === 0 && <div className="text-sm text-muted-foreground text-center py-8">تولیدی در این ماه ثبت نشده است</div>}
            {(data?.byProduct ?? []).map((p, i) => {
              const max = Math.max(...(data?.byProduct.map((x) => x.count) ?? [1]))
              return (
                <div key={p.code} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="font-bold tnum shrink-0 text-teal-800">{faInt(p.count)} <span className="text-muted-foreground font-normal text-xs">دستگاه</span></span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gradient-to-l from-slate-100 to-slate-50 border border-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-teal-600 via-teal-500 to-emerald-400 bar-grow shadow-sm"
                      style={{ width: `${(p.count / max) * 100}%`, animationDelay: `${i * 0.1}s` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniStat value={faInt(k?.activeRepairs ?? 0)} label="تعمیر در حال انجام" tone="info" />
            <MiniStat value={faInt(k?.overdueServices ?? 0)} label="خدمات معوق" tone="warning" />
          </div>
        </Section>
      </div>
    </div>
  )
}
