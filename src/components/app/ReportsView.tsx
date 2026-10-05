'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api'
import { PageHeader, Section, KpiCard, StatusBadge } from './ui-bits'
import { ORDER_STATUS, QC_STAGE, SEVERITY, TICKET_STATUS, CRITICALITY, COMPLAINT_STATUS } from '@/lib/labels'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Factory, FlaskConical, Wrench, BarChart3, TriangleAlert, Gauge, Award, Boxes, Cog } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt, fa } from '@/lib/jalali'

const COLORS = ['#0d9488', '#65a30d', '#d97706', '#dc2626', '#7c3aed', '#0891b2']

function ChartCard({ title, children, desc, icon }: { title: string; children: React.ReactNode; desc?: string; icon?: React.ReactNode }) {
  return (
    <Section title={title} desc={desc} icon={icon}>
      <div className="h-64" style={{ direction: 'ltr' }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </Section>
  )
}

// ─── ردیف رتبه‌بندی با نوار متحرک ───
function RankRow({ label, value, valueLabel, tone = 'info', mono }: { label: React.ReactNode; value: number; valueLabel?: string; tone?: 'info' | 'danger' | 'warning' | 'success'; mono?: boolean }) {
  const cls = {
    info: 'bg-gradient-to-l from-teal-600 to-emerald-400',
    danger: 'bg-gradient-to-l from-rose-600 to-rose-400',
    warning: 'bg-gradient-to-l from-amber-500 to-orange-400',
    success: 'bg-gradient-to-l from-emerald-600 to-lime-400',
  }[tone]
  const txt = { info: 'text-teal-700', danger: 'text-rose-700', warning: 'text-amber-700', success: 'text-emerald-700' }[tone]
  return (
    <div className="rounded-lg border px-3 py-2 hover:border-teal-200 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between text-[13px] mb-1.5">
        <span className={cn('truncate', mono && 'font-mono tnum text-xs')}>{label}</span>
        <span className={cn('font-bold tnum shrink-0', txt)}>{valueLabel ?? faInt(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={cn('h-full rounded-full bar-grow', cls)} style={{ width: '100%' }} />
      </div>
    </div>
  )
}

export default function ReportsView() {
  const [type, setType] = React.useState('production')
  const [days, setDays] = React.useState('90')
  const { data } = useQuery({
    queryKey: ['reports', type, days],
    queryFn: () => apiGet<Record<string, unknown>>(`/api/reports?type=${type}&days=${days}`),
  })

  const summary = (data?.summary ?? {}) as Record<string, number>

  return (
    <div className="space-y-4">
      <PageHeader
        title="گزارش‌های مدیریتی"
        desc="تحلیل تولید، کیفیت و خدمات — نرخ Reject، روند عدم انطباق، MTTR و عملکرد تکنسین‌ها"
        actions={
          <div className="flex gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production">تولید</SelectItem>
                <SelectItem value="quality">کیفیت</SelectItem>
                <SelectItem value="service">خدمات</SelectItem>
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">۳۰ روز</SelectItem>
                <SelectItem value="90">۹۰ روز</SelectItem>
                <SelectItem value="365">۱ سال</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* ─── تولید ─── */}
      {type === 'production' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 stagger">
            <KpiCard label="کل دستگاه‌های تولید‌شده" value={faInt(summary.totalDevices ?? 0)} tone="info" icon={<Factory className="w-5 h-5" />} />
            <KpiCard label="سفارش‌ها" value={faInt(summary.totalOrders ?? 0)} tone="info" />
            <KpiCard label="کل تست‌ها" value={faInt(summary.tests ?? 0)} tone="info" icon={<FlaskConical className="w-5 h-5" />} />
            <KpiCard label="تست ناموفق" value={faInt(summary.failTests ?? 0)} tone="danger" icon={<TriangleAlert className="w-5 h-5" />} />
            <KpiCard label="نرخ مردودی (Reject)" value={`${fa(summary.rejectRate ?? 0)}٪`} tone="warning" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard title="روند تولید ماهانه" desc="تولید‌شده، رد‌شده و آزاد‌شده" icon={<BarChart3 className="w-4 h-4" />}>
              <BarChart data={((data?.monthly ?? []) as { month: string; produced: number; failed: number; released: number }[]).map((m) => ({ ...m, month: m.month.slice(2) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="produced" name="تولید" fill="#0d9488" radius={[3, 3, 0, 0]} />
                <Bar dataKey="released" name="آزاد‌شده" fill="#65a30d" radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed" name="رد‌شده" fill="#dc2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title="تولید بر اساس محصول" icon={<Boxes className="w-4 h-4" />}>
              <BarChart data={((data?.byProduct ?? []) as { code: string; produced: number; failed: number }[])} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="code" tick={{ fontSize: 11 }} width={70} />
                <Tooltip />
                <Legend />
                <Bar dataKey="produced" name="تولید" fill="#0d9488" radius={[0, 3, 3, 0]} />
                <Bar dataKey="failed" name="رد‌شده" fill="#dc2626" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ChartCard>
          </div>
          <Section title="عملکرد خطوط تولید" icon={<Cog className="w-4 h-4" />}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
              {(Object.values((data?.lines ?? {})) as { line: string; orders: number; qty: number; completed: number }[]).map((l) => (
                <div key={l.line} className="rounded-xl border p-4 card-lift hover:border-teal-200 transition-all">
                  <div className="font-medium text-[13px] mb-2">{l.line}</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-lg font-bold tnum">{faInt(l.orders)}</div><div className="text-[10px] text-muted-foreground">سفارش</div></div>
                    <div><div className="text-lg font-bold tnum">{faInt(l.qty)}</div><div className="text-[10px] text-muted-foreground">تعداد</div></div>
                    <div><div className="text-lg font-bold tnum text-emerald-700">{faInt(l.completed)}</div><div className="text-[10px] text-muted-foreground">تکمیل</div></div>
                  </div>
                </div>
              ))}
              {Object.keys((data?.lines ?? {})).length === 0 && <div className="text-sm text-muted-foreground">داده‌ای موجود نیست</div>}
            </div>
          </Section>
        </>
      )}

      {/* ─── کیفیت ─── */}
      {type === 'quality' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 stagger">
            <KpiCard label="کل تست‌ها" value={faInt(summary.totalTests ?? 0)} tone="info" icon={<FlaskConical className="w-5 h-5" />} />
            <KpiCard label="نرخ شکست (Fail)" value={`${fa(summary.failRate ?? 0)}٪`} tone="danger" />
            <KpiCard label="NCR باز" value={faInt(summary.openNcrs ?? 0)} tone="danger" icon={<TriangleAlert className="w-5 h-5" />} />
            <KpiCard label="دفعات اصلاح (Rework)" value={faInt(summary.reworks ?? 0)} tone="warning" />
            <KpiCard label="شکایت باز" value={faInt(0)} tone="muted" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard title="روند ماهانهٔ عدم انطباق و شکست تست" icon={<BarChart3 className="w-4 h-4" />}>
              <BarChart data={((data?.monthly ?? []) as { month: string; ncrs: number; fails: number }[]).map((m) => ({ ...m, month: m.month.slice(2) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="ncrs" name="NCR" fill="#d97706" radius={[3, 3, 0, 0]} />
                <Bar dataKey="fails" name="شکست تست" fill="#dc2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title="توزیع NCR بر اساس شدت" icon={<Gauge className="w-4 h-4" />}>
              <PieChart>
                <Pie data={((data?.ncrsBySeverity ?? []) as { severity: string; count: number }[]).map((n) => ({ name: SEVERITY[n.severity]?.label ?? n.severity, value: n.count }))} dataKey="value" nameKey="name" outerRadius={85} label={(e) => e.name}>
                  {((data?.ncrsBySeverity ?? []) as unknown[]).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ChartCard>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="پرتکرارترین تست‌های ناموفق" icon={<TriangleAlert className="w-4 h-4" />}>
              <div className="space-y-2">
                {((data?.failsByTemplate ?? []) as { code: string; name: string; count: number }[]).map((f) => (
                  <RankRow key={f.code} label={f.name} value={f.count} tone="danger" />
                ))}
                {((data?.failsByTemplate ?? []) as unknown[]).length === 0 && <div className="text-sm text-muted-foreground text-center py-6">ناموفقی ثبت نشده است</div>}
              </div>
            </Section>
            <Section title="حالت‌های خرابی (از تعمیرات)" icon={<Wrench className="w-4 h-4" />}>
              <div className="space-y-2">
                {((data?.failureModes ?? []) as { mode: string | null; count: number }[]).map((f) => (
                  <RankRow key={String(f.mode)} label={f.mode ?? '—'} value={f.count} tone="warning" />
                ))}
                {((data?.failureModes ?? []) as unknown[]).length === 0 && <div className="text-sm text-muted-foreground text-center py-6">داده‌ای موجود نیست</div>}
              </div>
            </Section>
          </div>
        </>
      )}

      {/* ─── خدمات ─── */}
      {type === 'service' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 stagger">
            <KpiCard label="کل تیکت‌ها" value={faInt(summary.totalTickets ?? 0)} tone="info" icon={<Wrench className="w-5 h-5" />} />
            <KpiCard label="تیکت باز" value={faInt(summary.openTickets ?? 0)} tone="warning" />
            <KpiCard label="MTTR (ساعت)" value={fa(summary.mttrHours ?? 0)} tone="info" sub="میانگین زمان رفع مشکل" />
            <KpiCard label="شکایات" value={faInt(summary.complaints ?? 0)} tone="danger" />
            <KpiCard label="تعمیرات" value={faInt(summary.repairs ?? 0)} tone="info" />
            <KpiCard label="در گارانتی" value={`${faInt(summary.inWarranty ?? 0)}/${faInt(summary.deliveredDevices ?? 0)}`} tone="success" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard title="تیکت‌ها بر اساس وضعیت" icon={<Wrench className="w-4 h-4" />}>
              <BarChart data={((data?.ticketsByStatus ?? []) as { status: string; count: number }[]).map((t) => ({ name: TICKET_STATUS[t.status]?.label ?? t.status, count: t.count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="تعداد" fill="#0d9488" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title="شکایات بر اساس شدت" icon={<Gauge className="w-4 h-4" />}>
              <PieChart>
                <Pie data={((data?.complaintsBySeverity ?? []) as { severity: string; count: number }[]).map((c) => ({ name: SEVERITY[c.severity]?.label ?? c.severity, value: c.count }))} dataKey="value" nameKey="name" outerRadius={85} label={(e) => e.name}>
                  {((data?.complaintsBySeverity ?? []) as unknown[]).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ChartCard>
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Section title="عملکرد تکنسین‌ها" icon={<Award className="w-4 h-4" />}>
              <div className="space-y-2">
                {((data?.technicianPerf ?? []) as { technician: string; repairs: number; parts: number }[]).map((t) => (
                  <div key={t.technician} className="flex items-center justify-between border rounded-lg px-3 py-2 hover:border-teal-200 hover:shadow-sm transition-all">
                    <span className="text-[13px]">{t.technician}</span>
                    <span className="text-xs text-muted-foreground tnum">{faInt(t.repairs)} تعمیر · {faInt(t.parts)} قطعه</span>
                  </div>
                ))}
                {((data?.technicianPerf ?? []) as unknown[]).length === 0 && <div className="text-sm text-muted-foreground text-center py-6">داده‌ای موجود نیست</div>}
              </div>
            </Section>
            <Section title="قطعات پرمصرف خدمات" icon={<Boxes className="w-4 h-4" />}>
              <div className="space-y-2">
                {((data?.partsConsumption ?? []) as { component: string; qty: number; unit: string }[]).map((p) => (
                  <RankRow key={p.component} label={p.component} value={p.qty} valueLabel={`${faInt(p.qty)} ${p.unit}`} tone="info" />
                ))}
                {((data?.partsConsumption ?? []) as unknown[]).length === 0 && <div className="text-sm text-muted-foreground text-center py-6">مصرفی ثبت نشده است</div>}
              </div>
            </Section>
            <Section title="دستگاه‌های دارای بیشترین خرابی" icon={<TriangleAlert className="w-4 h-4" />}>
              <div className="space-y-2">
                {((data?.topFailureDevices ?? []) as { serial: string; count: number }[]).map((d) => (
                  <RankRow key={d.serial} label={d.serial} value={d.count} valueLabel={`${faInt(d.count)} تعمیر`} tone="danger" mono />
                ))}
                {((data?.topFailureDevices ?? []) as unknown[]).length === 0 && <div className="text-sm text-muted-foreground text-center py-6">داده‌ای موجود نیست</div>}
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
