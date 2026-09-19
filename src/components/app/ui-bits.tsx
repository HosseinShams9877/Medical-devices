'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Inbox, AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatJalali, fa, faInt, relTime } from '@/lib/jalali'
import type { Label } from '@/lib/labels'

// ═══════════════ انیمیشن شمارنده اعداد ═══════════════
function useCountUp(target: number, duration = 850): number {
  const [n, setN] = React.useState(0)
  React.useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setN(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return n
}

// ─── Badge وضعیت (با نقطه رنگی و پس‌زمینه گرادیانی) ───
const TONE_CLASS: Record<Label['tone'], string> = {
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  info: 'bg-gradient-to-l from-teal-50 to-teal-50/40 text-teal-800 border-teal-200',
  success: 'bg-gradient-to-l from-emerald-50 to-emerald-50/40 text-emerald-800 border-emerald-200',
  warning: 'bg-gradient-to-l from-amber-50 to-amber-50/40 text-amber-800 border-amber-200',
  danger: 'bg-gradient-to-l from-rose-50 to-rose-50/40 text-rose-800 border-rose-200',
  muted: 'bg-gray-50 text-gray-500 border-gray-200',
}
const TONE_DOT: Record<Label['tone'], string> = {
  neutral: 'bg-slate-400',
  info: 'bg-teal-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  muted: 'bg-gray-400',
}

export function StatusBadge({ map, value, className }: { map: Record<string, Label>; value: string | null | undefined; className?: string }) {
  if (!value) return <Badge variant="outline" className={cn('text-xs font-medium', TONE_CLASS.muted, className)}>—</Badge>
  const l = map[value] ?? { label: value, tone: 'neutral' as const }
  return (
    <Badge variant="outline" className={cn('text-xs font-medium whitespace-nowrap gap-1.5', TONE_CLASS[l.tone], className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TONE_DOT[l.tone])} />
      {l.label}
    </Badge>
  )
}

// ─── حباب آیکون گرادیانی ───
const ICON_GRAD: Record<string, string> = {
  info: 'from-teal-600 to-emerald-500 shadow-teal-600/25',
  success: 'from-emerald-600 to-lime-500 shadow-emerald-600/25',
  warning: 'from-amber-500 to-orange-400 shadow-amber-500/25',
  danger: 'from-rose-600 to-red-500 shadow-rose-600/25',
  neutral: 'from-slate-500 to-slate-400 shadow-slate-500/25',
}

// ─── کارت KPI (شمارنده متحرک + حباب گرادیانی + جلوه شناور) ───
export function KpiCard({ label, value, sub, icon, tone = 'info', onClick, spark }: {
  label: string; value: string | number; sub?: string; icon?: React.ReactNode
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'; onClick?: () => void
  spark?: number[]
}) {
  const numeric = typeof value === 'number'
  const animated = useCountUp(numeric ? value : 0)
  return (
    <Card
      className={cn('relative overflow-hidden card-lift', onClick && 'cursor-pointer group', 'border-slate-200/80')}
      onClick={onClick}
    >
      {/* هالهٔ تزئینی گوشه */}
      <div className={cn('absolute -top-10 -left-10 w-28 h-28 rounded-full opacity-[0.13] bg-gradient-to-br pointer-events-none',
        tone === 'success' ? 'from-emerald-400 to-lime-300' : tone === 'warning' ? 'from-amber-400 to-orange-300' : tone === 'danger' ? 'from-rose-500 to-red-400' : tone === 'neutral' ? 'from-slate-400 to-slate-300' : 'from-teal-400 to-emerald-300')} />
      {numeric && (
        <div className="absolute top-0 right-0 h-full w-1 pointer-events-none">
          <div className={cn('h-full w-full', tone === 'success' ? 'bg-gradient-to-b from-emerald-400 to-emerald-500/20' : tone === 'warning' ? 'bg-gradient-to-b from-amber-400 to-amber-500/20' : tone === 'danger' ? 'bg-gradient-to-b from-rose-400 to-rose-500/20' : tone === 'neutral' ? 'bg-gradient-to-b from-slate-300 to-slate-400/20' : 'bg-gradient-to-b from-teal-400 to-teal-500/20')} />
        </div>
      )}
      <CardContent className="p-4 relative">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="text-2xl font-extrabold tnum leading-tight tracking-tight">
              {numeric ? faInt(animated) : value}
            </div>
            <div className="text-xs text-muted-foreground truncate mt-1">{label}</div>
            {sub && <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">{sub}</div>}
          </div>
          {icon && (
            <div className={cn(
              'rounded-xl bg-gradient-to-br text-white p-2.5 shrink-0 shadow-lg transition-transform duration-300',
              ICON_GRAD[tone],
              onClick && 'group-hover:scale-110 group-hover:-rotate-3',
            )}>
              {icon}
            </div>
          )}
        </div>
        {spark && spark.length > 1 && <Sparkline data={spark} className="mt-2.5" />}
      </CardContent>
    </Card>
  )
}

// ─── نمودار خطی کوچک (Sparkline) ───
export function Sparkline({ data, className, tone = 'info' }: { data: number[]; className?: string; tone?: 'info' | 'success' | 'danger' | 'warning' }) {
  const max = Math.max(...data, 1)
  const w = 100
  const h = 26
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`)
  const stroke = { info: '#0d9488', success: '#059669', danger: '#e11d48', warning: '#d97706' }[tone]
  const gid = React.useId()
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('w-full h-6', className)} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={`url(#${gid})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── حلقه پیشرفت (Progress Ring) ───
export function ProgressRing({ value, max = 100, size = 92, thickness = 9, label, sub, tone = 'info' }: {
  value: number; max?: number; size?: number; thickness?: number
  label?: React.ReactNode; sub?: string; tone?: 'info' | 'success' | 'danger' | 'warning' | 'neutral'
}) {
  const gid = React.useId()
  const pct = Math.min(value / (max || 1), 1)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const colors = { info: ['#0d9488', '#34d399'], success: ['#059669', '#84cc16'], danger: ['#e11d48', '#fb7185'], warning: ['#d97706', '#fbbf24'], neutral: ['#64748b', '#94a3b8'] }[tone]
  const [drawn, setDrawn] = React.useState(0)
  React.useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - start) / 900, 1)
      setDrawn(pct * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pct])
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colors[0]} />
              <stop offset="100%" stopColor={colors[1]} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-slate-100" strokeWidth={thickness} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={thickness}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - drawn)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold tnum leading-none">{label}</span>
        </div>
      </div>
      {sub && <span className="text-[11px] text-muted-foreground text-center leading-snug">{sub}</span>}
    </div>
  )
}

// ─── هدر صفحه (با نشان گرادیانی) ───
export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5 anim-fade-up">
      <div className="relative pr-4">
        {/* نشان عمودی گرادیانی */}
        <span className="absolute right-0 top-1 bottom-1 w-1.5 rounded-full bg-gradient-to-b from-teal-600 via-emerald-400 to-teal-300 shadow-sm" aria-hidden="true" />
        <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
        {desc && <p className="text-sm text-muted-foreground mt-1.5 max-w-3xl leading-relaxed">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 anim-fade-in">{actions}</div>}
    </div>
  )
}

// ─── جدول داده عمومی ───
export interface Column<T> {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  className?: string
  hideOnMobile?: boolean
}

export function DataTable<T extends { id: string }>({ columns, rows, onRowClick, empty, loading, maxHeight = 'max-h-[65vh]' }: {
  columns: Column<T>[]; rows: T[]; onRowClick?: (row: T) => void
  empty?: string; loading?: boolean; maxHeight?: string
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full shimmer" />)}
      </div>
    )
  }
  if (rows.length === 0) {
    return <EmptyState text={empty ?? 'موردی برای نمایش وجود ندارد'} />
  }
  return (
    <div className={cn('overflow-auto rounded-lg border border-slate-200/70', maxHeight)} style={{ direction: 'rtl' }}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gradient-to-l from-teal-50/90 via-slate-50/95 to-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/75">
            {columns.map((c) => (
              <th key={c.key} className={cn('text-right font-bold text-xs text-muted-foreground px-3 py-2.5 border-b whitespace-nowrap', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-teal-500/50" aria-hidden="true" />
                  {c.header}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={cn('border-b last:border-b-0 transition-colors hover:bg-teal-50/50', onRowClick && 'cursor-pointer')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3 py-2.5 align-middle', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── حالت خالی (تصویرسازی SVG به‌جای ایموجی) ───
export function EmptyState({ text, icon }: { text?: string; icon?: React.ReactNode }) {
  return (
    <div className="py-12 text-center text-muted-foreground anim-fade-in">
      <div className="relative mx-auto w-24 h-24 mb-4">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-100/70 to-emerald-50/50 anim-float" />
        <div className="absolute inset-0 flex items-center justify-center text-teal-600/60">
          {icon ?? <Inbox className="w-10 h-10" strokeWidth={1.5} />}
        </div>
      </div>
      <div className="text-sm">{text ?? 'موردی برای نمایش وجود ندارد'}</div>
    </div>
  )
}

// ─── فیلد نمایشی ───
export function Field({ label, value, mono, full }: { label: string; value: React.ReactNode; mono?: boolean; full?: boolean }) {
  return (
    <div className={cn('space-y-1 rounded-lg bg-slate-50/60 border border-slate-100 px-3 py-2 transition-colors hover:border-teal-200/70 hover:bg-teal-50/40', full && 'md:col-span-2')}>
      <div className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full bg-teal-400" aria-hidden="true" />
        {label}
      </div>
      <div className={cn('text-sm break-words', mono && 'font-mono tnum text-[13px]')}>{value ?? '—'}</div>
    </div>
  )
}

export function InfoGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-3', cols === 3 && 'md:grid-cols-3', cols === 4 && 'md:grid-cols-4')}>{children}</div>
}

// ─── بخش صفحه (با نوار عنوان گرادیانی و آیکون اختیاری) ───
export function Section({ title, desc, actions, children, className, icon }: { title: string; desc?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <div className="absolute top-0 right-0 left-0 h-0.5 bg-gradient-to-l from-teal-500/0 via-teal-500/50 to-emerald-400/0" aria-hidden="true" />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {icon ? (
                <span className="rounded-lg bg-gradient-to-br from-teal-600 to-emerald-500 text-white p-1.5 shadow-md shadow-teal-600/20 shrink-0">{icon}</span>
              ) : (
                <span className="w-1 h-4 rounded-full bg-gradient-to-b from-teal-500 to-emerald-400 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{title}</span>
            </CardTitle>
            {desc && <p className="text-xs text-muted-foreground mt-1.5 font-normal leading-relaxed">{desc}</p>}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

// ─── تاریخ جلالی ───
export function DateCell({ date, withTime }: { date: string | Date | null | undefined; withTime?: boolean }) {
  return <span className="tnum text-[13px]" title={date ? new Date(date).toLocaleString('fa-IR') : undefined}>{formatJalali(date, withTime)}</span>
}

export function RelDate({ date }: { date: string | Date | null | undefined }) {
  return <span className="text-xs text-muted-foreground" title={formatJalali(date, true)}>{relTime(date)}</span>
}

// ─── نوار گذار‌های مجاز (Workflow) ───
export interface TransitionBtn {
  to: string; label: string; perm: string; danger?: boolean; disabled?: boolean; disabledReason?: string
}

export function WorkflowActions({ transitions, onTransition, loading }: {
  transitions: TransitionBtn[]; onTransition: (t: TransitionBtn) => void; loading?: boolean
}) {
  if (!transitions || transitions.length === 0) return <span className="text-xs text-muted-foreground">این رکورد در وضعیت نهایی قرار دارد و گذار مجازی برای آن تعریف نشده است</span>
  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map((t) => (
        <Button
          key={t.to}
          size="sm"
          variant={t.danger ? 'destructive' : 'default'}
          disabled={loading || t.disabled}
          title={t.disabled ? (t.disabledReason || 'مجوز لازم را ندارید') : t.label}
          onClick={() => onTransition(t)}
          className={cn(
            'shadow-sm transition-all',
            !t.danger && 'bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 hover:shadow-teal-600/25',
            t.disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {t.label}
        </Button>
      ))}
    </div>
  )
}

// ─── خط زمانی (با خط گرادیانی و دایره‌های رنگی) ───
export function Timeline({ items }: { items: { title: string; time: string | Date | null; body?: React.ReactNode; tone?: 'info' | 'success' | 'danger' | 'warning' | 'muted' }[] }) {
  const dot: Record<string, string> = {
    info: 'bg-gradient-to-br from-teal-400 to-teal-600', success: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
    danger: 'bg-gradient-to-br from-rose-400 to-rose-600', warning: 'bg-gradient-to-br from-amber-400 to-amber-600',
    muted: 'bg-gray-300',
  }
  return (
    <div className="relative space-y-5 pr-5">
      <div className="absolute right-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-teal-400/70 via-teal-200/50 to-transparent" aria-hidden="true" />
      {items.map((item, i) => (
        <div key={i} className="relative pr-4 anim-fade-right" style={{ animationDelay: `${Math.min(i * 0.06, 0.5)}s` }}>
          <div className={cn('absolute right-0 top-1.5 w-3 h-3 rounded-full ring-2 ring-background shadow-sm', dot[item.tone ?? 'info'])} />
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold">{item.title}</span>
            <span className="text-[11px] text-muted-foreground tnum bg-slate-100/80 rounded px-1.5 py-0.5">{formatJalali(item.time, true)}</span>
          </div>
          {item.body && <div className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{item.body}</div>}
        </div>
      ))}
    </div>
  )
}

// ─── ورودی جستجو (با آیکون Lucide) ───
export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'جستجو…'}
        className="pr-9"
      />
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
    </div>
  )
}

// ─── نوار وضعیت مراحل ───
export function StepsBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 flex items-center gap-1 min-w-16">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-l from-teal-600 to-emerald-400 bar-grow" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground tnum">{fa(current)}/{fa(total)}</span>
    </div>
  )
}

// ─── نشان ریز آماری (برای درون کارت‌ها) ───
export function MiniStat({ value, label, tone = 'info' }: { value: React.ReactNode; label: string; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  const cls = {
    info: 'text-teal-700 bg-teal-50/70 border-teal-100',
    success: 'text-emerald-700 bg-emerald-50/70 border-emerald-100',
    warning: 'text-amber-700 bg-amber-50/70 border-amber-100',
    danger: 'text-rose-700 bg-rose-50/70 border-rose-100',
  }[tone]
  return (
    <div className={cn('rounded-xl border p-3 text-center transition-transform hover:scale-[1.03] duration-200', cls)}>
      <div className="text-xl font-extrabold tnum leading-none">{value}</div>
      <div className="text-[11px] opacity-80 mt-1.5 leading-snug">{label}</div>
    </div>
  )
}

// ═══════════════ نمایشگر گرافیکی زنجیرهٔ وضعیت (Stepper) ═══════════════
// مسیر اصلی گردش‌کار را به‌صورت تصویری نمایش می‌دهد: گام‌های انجام‌شده (سبز)،
// گام جاری (فیروزه‌ای با نبض) و گام‌های آینده (خاکستری). وضعیت‌های خارج از
// مسیر (اصلاح/لغو) به‌صورت هشدار جداگانه در انت‌های زنجیره نشان داده می‌شوند.
export interface StepperStep { key: string; label: string }

export function WorkflowStepper({ steps, activeIndex, alert, compact }: {
  steps: StepperStep[]
  activeIndex: number                 // اندیس گام جاری در زنجیرهٔ اصلی؛ -1 یعنی هنوز آغاز نشده
  alert?: { label: string; tone?: 'danger' | 'muted' | 'warning' } | null
  compact?: boolean                   // حالت فشرده برای فضاهای کم
}) {
  const alertTone = alert?.tone ?? 'danger'
  return (
    <div className="space-y-2.5">
      <div className={cn('flex flex-wrap items-center', compact ? 'gap-x-1 gap-y-2' : 'gap-x-1.5 gap-y-3')} role="list" aria-label="زنجیرهٔ وضعیت">
        {steps.map((s, i) => {
          const done = i < activeIndex
          const active = i === activeIndex
          return (
            <React.Fragment key={s.key}>
              {i > 0 && (
                <div
                  className={cn(
                    'hidden sm:block h-0.5 rounded-full shrink min-w-3',
                    compact ? 'flex-none w-4 mx-0.5' : 'flex-1 mx-1 min-w-4',
                    done ? 'bg-gradient-to-l from-emerald-500 to-teal-400' : active ? 'bg-gradient-to-l from-teal-300/70 to-teal-100/50' : 'bg-slate-200',
                  )}
                  aria-hidden="true"
                />
              )}
              <div className="flex items-center gap-1.5 shrink-0" role="listitem" aria-current={active ? 'step' : undefined}>
                <span className={cn(
                  'relative flex items-center justify-center rounded-full border-2 font-bold shrink-0 transition-all duration-300',
                  compact ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-[11px]',
                  done && 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white border-emerald-400 shadow-sm shadow-emerald-500/30',
                  active && 'bg-gradient-to-br from-teal-600 to-emerald-500 text-white border-teal-400 shadow-lg shadow-teal-500/40 ring-4 ring-teal-500/15',
                  !done && !active && 'bg-white text-slate-400 border-slate-200',
                )}>
                  {done ? <Check className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} strokeWidth={3} /> : <span className="tnum">{fa(i + 1)}</span>}
                  {active && <span className="absolute inset-0 rounded-full bg-teal-400/40 anim-pulse-ring" aria-hidden="true" />}
                </span>
                <span className={cn(
                  'whitespace-nowrap leading-tight',
                  compact ? 'text-[10px]' : 'text-[11px]',
                  done && 'text-emerald-700 font-medium',
                  active && 'text-teal-800 font-bold',
                  !done && !active && 'text-slate-400',
                )}>{s.label}</span>
              </div>
            </React.Fragment>
          )
        })}
      </div>
      {alert && (
        <div className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold anim-fade-in',
          alertTone === 'danger' && 'bg-gradient-to-l from-rose-50/90 to-rose-50/40 border-rose-200 text-rose-800',
          alertTone === 'warning' && 'bg-gradient-to-l from-amber-50/90 to-amber-50/40 border-amber-200 text-amber-800',
          alertTone === 'muted' && 'bg-slate-50 border-slate-200 text-slate-500',
        )} role="status">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {alert.label}
        </div>
      )}
    </div>
  )
}

// ─── نوار خلاصهٔ آماری بالای نما (چیپ‌های رنگی) ───
export function StatChips({ items, className }: {
  items: { label: string; value: React.ReactNode; tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'; icon?: React.ReactNode }[]
  className?: string
}) {
  const cls = {
    info: 'text-teal-800 bg-gradient-to-l from-teal-50/90 to-teal-50/30 border-teal-200/80',
    success: 'text-emerald-800 bg-gradient-to-l from-emerald-50/90 to-emerald-50/30 border-emerald-200/80',
    warning: 'text-amber-800 bg-gradient-to-l from-amber-50/90 to-amber-50/30 border-amber-200/80',
    danger: 'text-rose-800 bg-gradient-to-l from-rose-50/90 to-rose-50/30 border-rose-200/80',
    neutral: 'text-slate-600 bg-slate-50/80 border-slate-200',
  }
  return (
    <div className={cn('flex flex-wrap gap-2 anim-fade-in', className)} role="group" aria-label="خلاصهٔ آماری">
      {items.map((it, i) => (
        <div
          key={i}
          className={cn('flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-transform hover:scale-[1.03] duration-200', cls[it.tone ?? 'neutral'])}
          style={{ animationDelay: `${i * 0.04}s` }}
        >
          {it.icon && <span className="shrink-0 opacity-80">{it.icon}</span>}
          <span className="text-sm font-extrabold tnum leading-none">{it.value}</span>
          <span className="text-[11px] opacity-80 leading-none">{it.label}</span>
        </div>
      ))}
    </div>
  )
}

export const fa_ = fa
