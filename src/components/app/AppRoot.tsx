'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApp, type ViewName, type SessionUserClient } from './store'
import { apiGet, apiPost } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { relTime } from '@/lib/jalali'
import { NOTIF_TONE } from '@/lib/labels'
import { ROLE_LABELS } from '@/lib/rbac'
import {
  LayoutDashboard, Factory, Package, Boxes, ClipboardCheck, Cpu, PackageCheck, Wrench,
  BarChart3, Settings, FileText, Search, Bell, LogOut, Menu, X, Activity, ShieldCheck,
  Clock, HeartPulse, BadgeCheck, Layers, Check, AlertTriangle, RotateCcw,
} from 'lucide-react'

// ─── Dashboard و نماها ───
import Dashboard from './Dashboard'
import OrdersView from './OrdersView'
import OrderDetail from './OrderDetail'
import ProductsView from './ProductsView'
import InventoryView from './InventoryView'
import QualityView from './QualityView'
import ReleasesView from './ReleasesView'
import DevicesView from './DevicesView'
import ServiceView from './ServiceView'
import ReportsView from './ReportsView'
import AdminView from './AdminView'
import ArchitectureView from './ArchitectureView'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false } },
})

const DEMO_ACCOUNTS: { username: string; role: string }[] = [
  { username: 'admin', role: 'ADMIN' },
  { username: 'pmgr', role: 'PRODUCTION_MGR' },
  { username: 'operator', role: 'OPERATOR' },
  { username: 'qc', role: 'QC' },
  { username: 'warehouse', role: 'WAREHOUSE' },
  { username: 'smgr', role: 'SERVICE_MGR' },
  { username: 'tech1', role: 'TECHNICIAN' },
  { username: 'sales', role: 'SALES' },
  { username: 'viewer', role: 'VIEWER' },
]

// ═══════════════ خط نبض پزشکی (ECG) — تزئین گرافیکی ═══════════════
function EcgLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 56" className={cn('w-full h-12', className)} fill="none" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id="ecg-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0d9488" stopOpacity="0" />
          <stop offset="25%" stopColor="#0d9488" stopOpacity="0.8" />
          <stop offset="65%" stopColor="#10b981" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 28 L36 28 L46 28 L52 14 L60 44 L66 28 L112 28 L122 28 L128 20 L136 38 L142 28 L190 28 L200 28 L206 12 L214 46 L220 28 L268 28 L278 28 L284 22 L292 36 L298 28 L320 28"
        stroke="url(#ecg-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ecg-path"
      />
    </svg>
  )
}

// ═══════════════ صفحه ورود (گرافیکی) ═══════════════
function LoginPage({ onLogin }: { onLogin: (u: SessionUserClient) => void }) {
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!username || !password) { setError('نام کاربری و رمز عبور را وارد کنید.'); return }
    setLoading(true)
    setError('')
    try {
      await apiPost('/api/auth/login', { username, password })
      const me = await apiGet<{ user: SessionUserClient }>('/api/auth/me')
      onLogin(me.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ورود')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 md:p-8 bg-aurora overflow-hidden">
      {/* الگوی شبکه‌ای و ذرات شناور */}
      <div className="absolute inset-0 bg-med-grid pointer-events-none" aria-hidden="true" />
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-teal-300/20 blur-3xl anim-float" aria-hidden="true" />
      <div className="absolute bottom-10 -left-24 w-80 h-80 rounded-full bg-emerald-300/20 blur-3xl anim-float-slow" aria-hidden="true" />
      {/* به‌علاوه‌های پزشکی شناور */}
      <PlusDecorative className="top-[18%] left-[12%] anim-float" />
      <PlusDecorative className="top-[70%] left-[38%] anim-float-slow" />
      <PlusDecorative className="top-[24%] right-[8%] anim-float" delay="1.2s" />
      <PlusDecorative className="bottom-[16%] right-[22%] anim-float-slow" delay="0.6s" />

      <div className="relative w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center">
        {/* ─── ستون فرم ورود ─── */}
        <Card className="order-2 md:order-1 glass anim-fade-up !bg-white/80">
          <CardContent className="p-6 md:p-8">
            {/* نشان برند */}
            <div className="flex items-center gap-3 mb-6">
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-2xl bg-teal-500/50 anim-pulse-ring" aria-hidden="true" />
                <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-teal-600/30 anim-heartbeat">
                  <HeartPulse className="w-7 h-7" strokeWidth={2.2} />
                </div>
              </div>
              <div className="min-w-0">
                <h1 className="font-extrabold text-lg leading-snug grad-text">سامانهٔ مدیریت تولید تجهیزات پزشکی</h1>
                <p className="text-xs text-muted-foreground mt-1">کنترل کیفیت، ردیابی کامل و خدمات پس از فروش</p>
              </div>
            </div>

            <EcgLine className="mb-6 opacity-70" />

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="login-username" className="text-sm font-semibold">نام کاربری</label>
                <Input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" className="text-left h-11 focus-visible:ring-teal-500/40" placeholder="username" autoComplete="username" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="login-password" className="text-sm font-semibold">رمز عبور</label>
                <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" className="text-left h-11 focus-visible:ring-teal-500/40" placeholder="••••••••" autoComplete="current-password" />
              </div>
              {error && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 anim-fade-in" role="alert">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full h-11 text-sm font-bold bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25 transition-all" disabled={loading}>
                {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin ml-2" aria-hidden="true" />در حال ورود…</> : 'ورود به سامانه'}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2.5 leading-relaxed">
                برای آزمودن نقش‌ها روی هر نقش کلیک کنید <span className="tnum">(رمز همه: demo1234)</span>:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_ACCOUNTS.map((a, i) => (
                  <button
                    key={a.username}
                    type="button"
                    onClick={() => { setUsername(a.username); setPassword('demo1234') }}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 bg-white/70 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 transition-all hover:shadow-sm hover:-translate-y-0.5 anim-fade-in"
                    title={ROLE_LABELS[a.role as keyof typeof ROLE_LABELS]}
                    style={{ animationDelay: `${0.05 * i}s` }}
                  >
                    {ROLE_LABELS[a.role as keyof typeof ROLE_LABELS]}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── ستون معرفی (شیشه‌ای) ─── */}
        <div className="order-1 md:order-2 flex flex-col justify-center gap-4 p-2">
          <div className="space-y-3 stagger">
            {[
              { icon: <ShieldCheck className="w-5 h-5" />, t: 'ردیابی کامل (Traceability)', d: 'پروندهٔ دیجیتال هر دستگاه: قطعات، لات‌ها، اپراتور، Firmware، QC و تعمیرات', grad: 'from-teal-500 to-emerald-400' },
              { icon: <ClipboardCheck className="w-5 h-5" />, t: 'کنترل کیفیت سه‌سطحی', d: 'کنترل ورودی، حین تولید و نهایی همراه با تست مجدد و مدیریت عدم انطباق', grad: 'from-emerald-500 to-lime-400' },
              { icon: <Factory className="w-5 h-5" />, t: 'گردش‌کار کنترل‌شده', d: 'هیچ تغییر وضعیتی بدون مجوز و بدون برقراری شرایط انجام نمی‌شود', grad: 'from-amber-500 to-orange-400' },
              { icon: <Wrench className="w-5 h-5" />, t: 'خدمات پس از فروش', d: 'تیکت، شکایت، گارانتیِ محاسبه‌شده و تعمیر با قطعاتِ قابل ردیابی', grad: 'from-rose-500 to-red-400' },
            ].map((f, i) => (
              <div key={i} className="flex gap-3.5 items-start glass !bg-white/60 rounded-2xl p-4 card-lift glow-ring">
                <div className={cn('rounded-xl bg-gradient-to-br text-white p-2.5 shrink-0 shadow-lg', f.grad)}>{f.icon}</div>
                <div className="min-w-0">
                  <div className="font-bold text-sm">{f.t}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.d}</div>
                </div>
              </div>
            ))}
          </div>

          {/* نوار اعتماد */}
          <div className="flex items-center justify-center gap-5 pt-2 anim-fade-in" style={{ animationDelay: '0.7s' }}>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Layers className="w-3.5 h-3.5 text-teal-600" /><span>۳۵ موجودیت داده</span></div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><BadgeCheck className="w-3.5 h-3.5 text-teal-600" /><span>۹ نقش با ۵۰+ مجوز</span></div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Activity className="w-3.5 h-3.5 text-teal-600" /><span>ردّ تغییرات کامل</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── نشان به‌علاوهٔ پزشکی شناور ───
function PlusDecorative({ className, delay }: { className?: string; delay?: string }) {
  return (
    <div className={cn('absolute w-8 h-8 text-teal-600/20 pointer-events-none', className)} style={delay ? { animationDelay: delay } : undefined} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M12 4 v16 M4 12 h16" />
      </svg>
    </div>
  )
}

// ═══════════════ منوی کناری (گرادیانی) ═══════════════
interface NavItem { view: ViewName; label: string; icon: React.ReactNode; perm: string; badge?: number }

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, view, navigate, can } = useApp()
  if (!user) return null

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'اصلی',
      items: [
        { view: 'dashboard', label: 'داشبورد', icon: <LayoutDashboard className="w-4 h-4" />, perm: 'production.view' },
      ],
    },
    {
      title: 'تولید',
      items: [
        { view: 'orders', label: 'سفارش‌های تولید', icon: <Factory className="w-4 h-4" />, perm: 'production.view' },
        { view: 'products', label: 'محصولات و BOM', icon: <Package className="w-4 h-4" />, perm: 'bom.view' },
        { view: 'inventory', label: 'موجودی و انبار', icon: <Boxes className="w-4 h-4" />, perm: 'inventory.view' },
        { view: 'quality', label: 'کنترل کیفیت', icon: <ClipboardCheck className="w-4 h-4" />, perm: 'qc.view' },
        { view: 'release', label: 'آزادسازی و تحویل', icon: <PackageCheck className="w-4 h-4" />, perm: 'qc.view' },
      ],
    },
    {
      title: 'ردیابی و خدمات',
      items: [
        { view: 'devices', label: 'دستگاه‌ها و ردیابی', icon: <Cpu className="w-4 h-4" />, perm: 'device.view' },
        { view: 'service', label: 'خدمات پس از فروش', icon: <Wrench className="w-4 h-4" />, perm: 'service.view' },
      ],
    },
    {
      title: 'مدیریت',
      items: [
        { view: 'reports', label: 'گزارش‌های مدیریتی', icon: <BarChart3 className="w-4 h-4" />, perm: 'reports.view' },
        { view: 'admin', label: 'مدیریت سامانه', icon: <Settings className="w-4 h-4" />, perm: 'audit.view' },
        { view: 'architecture', label: 'معماری سامانه', icon: <FileText className="w-4 h-4" />, perm: 'production.view' },
      ],
    },
  ]

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />}
      <aside className={cn(
        'fixed lg:sticky top-0 right-0 h-screen w-64 shrink-0 text-slate-100 z-50 flex flex-col transition-transform duration-200',
        'bg-gradient-to-b from-teal-950 via-slate-900 to-slate-900',
        !open && 'translate-x-full lg:translate-x-0',
      )}>
        {/* سربرگ برند */}
        <div className="relative flex items-center gap-2.5 p-4 border-b border-white/10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-l from-teal-500/10 to-transparent pointer-events-none" aria-hidden="true" />
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-xl bg-teal-400/30 anim-pulse-ring" aria-hidden="true" />
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-teal-500/25">
              <HeartPulse className="w-5 h-5" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-sm leading-tight">سامانهٔ تولید MED</div>
            <div className="text-[10px] text-slate-400">تجهیزات پزشکی</div>
          </div>
          <button className="lg:hidden mr-auto text-slate-400 hover:text-white transition-colors" onClick={onClose} aria-label="بستن منو"><X className="w-5 h-5" /></button>
        </div>

        {/* ناوبری */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] font-bold text-slate-500 px-3 mb-1.5 flex items-center gap-2" aria-hidden="true">
                <span className="w-3 h-px bg-teal-500/50" />
                {g.title}
              </div>
              <div className="space-y-1">
                {g.items.filter((it) => can(it.perm)).map((it) => {
                  const active = view === it.view || (view === 'order-detail' && it.view === 'orders') || (view === 'device' && it.view === 'devices')
                  return (
                    <button
                      key={it.view}
                      onClick={() => { navigate(it.view); onClose() }}
                      className={cn(
                        'group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-right transition-all duration-200',
                        active
                          ? 'bg-gradient-to-l from-teal-500/25 to-emerald-400/10 text-white font-semibold shadow-lg shadow-teal-950/40'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white hover:translate-x-[-2px]',
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      {active && <span className="absolute right-0 top-2 bottom-2 w-1 rounded-full bg-gradient-to-b from-teal-300 to-emerald-400" aria-hidden="true" />}
                      <span className={cn(
                        'shrink-0 rounded-lg p-1.5 transition-all duration-200',
                        active ? 'bg-teal-400/20 text-teal-300' : 'text-slate-500 group-hover:text-teal-300 group-hover:bg-white/5',
                      )}>
                        {it.icon}
                      </span>
                      <span className="truncate">{it.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* کارت کاربر در پاورقی سایدبار */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 rounded-xl bg-white/5 border border-white/10 p-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0 shadow-md shadow-teal-500/20">
              {user.fullName.split(' ').map((s) => s[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">{user.fullName}</div>
              <div className="text-[10px] text-slate-500 truncate">{user.roleLabel}</div>
            </div>
            <span className="live-dot shrink-0" aria-label="برخط" />
          </div>
          <div className="mt-2.5 px-1 text-[10px] text-slate-500 leading-relaxed flex items-center justify-between">
            <span>داده‌های نمایشی — نسخهٔ ارزیابی</span>
            <span className="tnum">{new Date().toLocaleDateString('fa-IR')}</span>
          </div>
        </div>
      </aside>
    </>
  )
}

// ═══════════════ جستجوی سراسری ═══════════════
interface SearchGroup { type: string; label: string; view: string; items: { id: string; title: string; subtitle: string; key: string }[] }

function GlobalSearch() {
  const { navigate, can } = useApp()
  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const { data } = useQuery({
    queryKey: ['search', q],
    queryFn: () => apiGet<{ groups: SearchGroup[] }>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  })

  const pick = (g: SearchGroup, item: { id: string; title: string; key: string }) => {
    if (g.type === 'DEVICE') navigate('device', { serial: item.key })
    else if (g.type === 'ORDER') navigate('order-detail', { id: item.id })
    else if (g.type === 'TICKET' || g.type === 'COMPLAINT' || g.type === 'CUSTOMER') navigate('service', { tab: g.type === 'CUSTOMER' ? 'customers' : g.type === 'TICKET' ? 'tickets' : 'complaints' })
    else if (g.type === 'COMPONENT' || g.type === 'LOT') navigate('inventory')
    else if (g.type === 'NCR') navigate('quality', { tab: 'ncrs' })
    setOpen(false)
    setQ('')
  }

  if (!can('search.use')) return null

  return (
    <div className="relative flex-1 max-w-md">
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="جستجوی سراسری: شماره سریال، سفارش، تیکت، قطعه، لات…"
        className="pr-9 bg-white/80 focus-visible:ring-teal-500/35 shadow-sm"
        aria-label="جستجوی سراسری"
      />
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
      {open && q.trim().length >= 2 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1.5 w-[480px] max-w-[90vw] max-h-[70vh] overflow-y-auto glass !bg-white/95 rounded-xl shadow-2xl z-50 p-2 anim-fade-in">
            {!data && <div className="p-3 text-sm text-muted-foreground">در حال جستجو…</div>}
            {data && data.groups.length === 0 && <div className="p-3 text-sm text-muted-foreground text-center py-6">نتیجه‌ای یافت نشد</div>}
            {data?.groups.map((g) => (
              <div key={g.type} className="mb-1">
                <div className="text-[10px] font-bold text-muted-foreground px-2 py-1.5 flex items-center gap-1.5" aria-hidden="true">
                  <span className="w-1 h-1 rounded-full bg-teal-500/60" />{g.label}
                </div>
                {g.items.map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-right px-2.5 py-2 rounded-lg hover:bg-teal-50/80 hover:shadow-sm transition-all"
                    onClick={() => pick(g, item)}
                  >
                    <div className="text-sm font-medium tnum">{item.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════ اعلان‌ها ═══════════════
function NotificationBell() {
  const { can, navigate } = useApp()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<{ notifications: { id: string; title: string; body: string; severity: string; entityType: string; linkView: string | null; createdAt: string; read: boolean }[]; unread: number }>('/api/notifications'),
    refetchInterval: 30_000,
  })
  if (!can('notifications.view')) return null
  const unread = data?.unread ?? 0

  const markAll = async () => {
    await apiPost('/api/notifications', { action: 'mark-all-read' })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  const go = (n: { entityType: string; linkView: string | null; id: string }) => {
    const view = n.linkView as ViewName | null
    if (view) {
      if (['order-detail'].includes(view)) navigate('orders')
      else if (['device'].includes(view)) navigate('devices')
      else navigate(view)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-teal-50" aria-label="اعلان‌ها">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -left-0.5 min-w-4 h-4 px-0.5 rounded-full bg-gradient-to-br from-rose-500 to-red-500 text-white text-[10px] font-bold flex items-center justify-center tnum shadow-md shadow-rose-500/30">
              {unread}
              {unread > 0 && unread < 10 && <span className="absolute inset-0 rounded-full bg-rose-400/60 anim-pulse-ring" aria-hidden="true" />}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 glass !bg-white/95 rounded-xl">
        <div className="flex items-center justify-between px-3 py-2.5 border-b bg-gradient-to-l from-teal-50/60 to-transparent rounded-t-xl">
          <span className="text-sm font-bold flex items-center gap-2">
            <Bell className="w-4 h-4 text-teal-700" /> اعلان‌ها
            {unread > 0 && <span className="text-[10px] font-semibold text-teal-700 bg-teal-100 rounded-full px-2 py-0.5 tnum">{unread} ناخوانده</span>}
          </span>
          {unread > 0 && <Button variant="ghost" size="sm" onClick={markAll} className="text-xs h-7 hover:bg-teal-50">خواندن همهٔ اعلان‌ها</Button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(data?.notifications ?? []).length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">اعلان تازه‌ای وجود ندارد</div>}
          {data?.notifications.slice(0, 12).map((n) => (
            <button key={n.id} className="w-full text-right p-3 border-b last:border-b-0 hover:bg-teal-50/50 transition-colors" onClick={() => go(n)}>
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full shrink-0', n.read ? 'bg-slate-200' : NOTIF_TONE[n.severity] === 'danger' ? 'bg-rose-500' : NOTIF_TONE[n.severity] === 'warning' ? 'bg-amber-500' : NOTIF_TONE[n.severity] === 'success' ? 'bg-emerald-500' : 'bg-teal-500')} />
                <span className={cn('text-sm font-medium leading-snug', !n.read && 'text-foreground', n.read && 'text-muted-foreground')}>{n.title}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{n.body}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-1">{relTime(n.createdAt)}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ═══════════════ ساعت زندهٔ شمسی ═══════════════
function LiveClock() {
  const [now, setNow] = React.useState<Date | null>(null)
  React.useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!now) return null
  return (
    <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground bg-slate-100/80 border border-slate-200/70 rounded-lg px-2.5 py-1.5 tabular-nums" aria-live="off">
      <Clock className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
      <span>{now.toLocaleDateString('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <span className="text-teal-700 font-bold">{now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    </div>
  )
}

// ═══════════════ سربرگ ═══════════════
function Header({ onMenu }: { onMenu: () => void }) {
  const { user, setUser } = useApp()
  if (!user) return null

  const logout = async () => {
    await apiPost('/api/auth/logout', {})
    setUser(null)
    toast({ title: 'خروج انجام شد', description: 'نشست شما با موفقیت بسته شد.' })
  }

  return (
    <header className="sticky top-0 z-30 bg-white/75 backdrop-blur-xl border-b border-slate-200/70 px-3 md:px-5 h-14 flex items-center gap-3 shadow-sm">
      <Button variant="ghost" size="icon" className="lg:hidden hover:bg-teal-50" onClick={onMenu} aria-label="گشودن منو"><Menu className="w-5 h-5" /></Button>
      <GlobalSearch />
      <div className="flex items-center gap-2 mr-auto">
        <LiveClock />
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-teal-50 transition-colors">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-md shadow-teal-600/25">
                  {user.fullName.split(' ').map((s) => s[0]).slice(0, 2).join('')}
                </div>
                <span className="absolute bottom-0 left-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white" aria-label="برخط" />
              </div>
              <div className="hidden md:block text-right leading-tight">
                <div className="text-[13px] font-semibold">{user.fullName}</div>
                <div className="text-[10px] text-muted-foreground">{user.roleLabel}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2.5 bg-gradient-to-l from-teal-50/70 to-transparent -mt-1 rounded-t-lg">
              <div className="text-sm font-bold">{user.fullName}</div>
              <div className="text-[11px] text-muted-foreground">{user.roleLabel} — <span className="tnum" dir="ltr">{user.username}</span></div>
              <Badge variant="outline" className="mt-2 text-[10px] bg-teal-50 border-teal-200 text-teal-700"><Check className="w-3 h-3 ml-1" />{user.permissions.length} مجوز فعال</Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => useApp.getState().navigate('architecture')}>
              <FileText className="w-4 h-4 ml-2" /> مستندات معماری
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="text-rose-700 focus:text-rose-700">
              <LogOut className="w-4 h-4 ml-2" /> خروج از سامانه
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

// ═══════════════ مسیریاب نماها ═══════════════
function ViewRouter() {
  const { view } = useApp()
  switch (view) {
    case 'dashboard': return <Dashboard />
    case 'orders': return <OrdersView />
    case 'order-detail': return <OrderDetail />
    case 'products': return <ProductsView />
    case 'inventory': return <InventoryView />
    case 'quality': return <QualityView />
    case 'release': return <ReleasesView />
    case 'devices': return <DevicesView />
    case 'device': return <DevicesView />
    case 'service': return <ServiceView />
    case 'reports': return <ReportsView />
    case 'admin': return <AdminView />
    case 'architecture': return <ArchitectureView />
    default: return <Dashboard />
  }
}

// ═══════════════ مرز خطای نما — اگر یک نما خطا کند، پوسته و منو زنده می‌مانند ═══════════════
class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('VIEW_ERROR', error)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center p-8" dir="rtl">
          <div className="max-w-md w-full rounded-2xl border bg-card p-7 text-center shadow-md">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-600" aria-hidden="true" />
            </div>
            <h2 className="font-bold mb-1.5">خطا در نمایش این بخش</h2>
            <p className="text-sm text-muted-foreground leading-6 mb-4">
              سایر بخش‌های سامانه سالم هستند و از منوی کنار می‌توانید به آن‌ها بروید.
              با تلاش مجدد معمولاً این بخش هم بازیابی می‌شود.
            </p>
            <div className="flex gap-2 justify-center">
              <Button size="sm" onClick={() => this.setState({ error: null })} className="gap-1.5 bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700">
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> تلاش مجدد
              </Button>
              <Button size="sm" variant="outline" onClick={() => { useApp.getState().navigate('dashboard') }}>بازگشت به داشبورد</Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ═══════════════ ریشهٔ برنامه ═══════════════
function AppInner() {
  const { user, setUser } = useApp()
  const view = useApp((s) => s.view)
  const [ready, setReady] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => {
    apiGet<{ user: SessionUserClient | null }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true))
    const onExpired = () => { setUser(null) }
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [setUser])

  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-aurora">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-teal-500/40 anim-pulse-ring" aria-hidden="true" />
          <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white flex items-center justify-center shadow-xl shadow-teal-600/30 anim-heartbeat">
            <HeartPulse className="w-7 h-7" />
          </div>
        </div>
        <div className="text-sm text-muted-foreground">در حال بارگذاری سامانه…</div>
        <div className="w-40 h-1 rounded-full bg-slate-200 overflow-hidden shimmer" aria-hidden="true">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-l from-teal-600 to-emerald-400" />
        </div>
      </div>
    )
  }
  if (!user) return <LoginPage onLogin={(u) => { setUser(u); queryClient.clear() }} />

  return (
    <div className="min-h-screen flex" style={{ direction: 'rtl' }}>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-gradient-to-b from-slate-50/60 to-transparent">
        <Header onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 p-3 md:p-6">
          <div key={view} className="anim-fade-in">
            <ViewErrorBoundary>
              <ViewRouter />
            </ViewErrorBoundary>
          </div>
        </main>
        <footer className="mt-auto border-t border-slate-200/70 py-3.5 px-6 text-center text-[11px] text-muted-foreground bg-gradient-to-l from-teal-50/30 to-transparent">
          سامانهٔ مدیریت تولید و خدمات پس از فروش تجهیزات پزشکی — نسخهٔ ارزیابی | همهٔ تغییرات در ردّ تغییراتِ فقط‌افزوده ثبت می‌شود (Append-Only Audit Trail)
        </footer>
      </div>
    </div>
  )
}

export default function AppRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
