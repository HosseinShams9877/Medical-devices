'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { apiGet, apiPost } from './api'
import { useApp } from './store'
import { PageHeader, DataTable, StatusBadge, SearchBox, Section, DateCell } from './ui-bits'
import { ORDER_STATUS, ORDER_ORIGIN, PRIORITY } from '@/lib/labels'
import { ORDER_TRANSITIONS, ORDER_ORIGINS } from '@/lib/workflow-defs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { Plus, Factory, TriangleAlert, CalendarDays, KanbanSquare, FileText, Users, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'

interface OrderRow {
  id: string; code: string; status: string; priority: string; qty: number
  product: { code: string; name: string }; productRevision: { revision: string }
  bom: { revision: number; status: string } | null
  owner: { fullName: string } | null; productionLine: string | null
  originType: string; originRef: string | null; originTitle: string | null
  originIssuedBy: string | null; originDate: string | null
  customer: { code: string; name: string } | null
  plannedStart: string | null; plannedEnd: string | null; actualStart: string | null; actualEnd: string | null
  notes: string | null; createdAt: string
  _count: { devices: number; tests: number; ncrs: number }
  deviceStatus: Record<string, number>
}

export default function OrdersView() {
  const { navigate, can } = useApp()
  const [status, setStatus] = React.useState('all')
  const [q, setQ] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [tab, setTab] = React.useState('list')

  const { data, isLoading } = useQuery({
    queryKey: ['orders', status, q],
    queryFn: () => apiGet<{ orders: OrderRow[] }>(`/api/orders${status !== 'all' ? `?status=${status}` : ''}${q ? `${status !== 'all' ? '&' : '?'}q=${encodeURIComponent(q)}` : ''}`),
  })

  const columns = [
    { key: 'code', header: 'شماره سفارش', render: (r: OrderRow) => (
      <div>
        <span className="font-semibold text-teal-700 tnum">{r.code}</span>
        {r.originRef && <div className="text-[11px] text-muted-foreground tnum">{r.originType === 'DIRECTIVE' ? 'دستور ' : r.originType === 'MINUTES' ? 'صورتجلسه ' : 'مرجع '}{r.originRef}</div>}
      </div>
    ) },
    { key: 'product', header: 'محصول', render: (r: OrderRow) => (
      <div>
        <div className="truncate max-w-52">{r.product.name}</div>
        <div className="text-[11px] text-muted-foreground tnum">{r.product.code} · نسخه {r.productRevision.revision} · BOM r{r.bom?.revision ?? '—'}</div>
      </div>
    ) },
    { key: 'origin', header: 'مبدأ درخواست', render: (r: OrderRow) => (
      <div className="space-y-1">
        <StatusBadge map={ORDER_ORIGIN} value={r.originType} />
        {r.customer && <div className="text-[11px] text-muted-foreground truncate max-w-40">{r.customer.name}</div>}
      </div>
    ) },
    { key: 'qty', header: 'تعداد', render: (r: OrderRow) => (
      <div>
        <span className="font-semibold tnum">{faInt(r.qty)}</span>
        <span className="text-muted-foreground text-xs tnum"> / {faInt(r._count.devices)} ساخته‌شده</span>
      </div>
    ) },
    { key: 'priority', header: 'اولویت', render: (r: OrderRow) => <StatusBadge map={PRIORITY} value={r.priority} /> },
    { key: 'status', header: 'وضعیت', render: (r: OrderRow) => <StatusBadge map={ORDER_STATUS} value={r.status} /> },
    { key: 'dates', header: 'برنامه (شروع → پایان)', hideOnMobile: true, render: (r: OrderRow) => (
      <div className="text-xs space-y-0.5">
        <DateCell date={r.plannedStart} /> <span className="text-muted-foreground">→</span> <DateCell date={r.plannedEnd} />
      </div>
    ) },
    { key: 'line', header: 'خط تولید', hideOnMobile: true, render: (r: OrderRow) => <span className="text-xs">{r.productionLine ?? '—'}</span> },
    { key: 'devices', header: 'وضعیت دستگاه‌ها', hideOnMobile: true, render: (r: OrderRow) => (
      <div className="flex flex-wrap gap-1">
        {Object.entries(r.deviceStatus).map(([s, c]) => (
          <span key={s} className="text-[11px] tnum rounded-md border bg-muted/60 px-1.5 py-0.5">{faInt(c)} {s === 'QC_PASS' ? 'پاس' : s === 'QC_FAIL' ? 'رد' : s === 'RELEASED' ? 'آزاد' : s === 'DELIVERED' ? 'تحویل' : s === 'IN_PRODUCTION' ? 'تولید' : s === 'REWORK' ? 'اصلاح' : s}</span>
        ))}
      </div>
    ) },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="سفارش‌های تولید"
        desc="از صدور درخواست (دستور مدیریتی، صورت‌جلسه یا سفارش مشتری) تا خروج از انبار و بستن پروژه — گردش‌کار با کنترل سخت سمت سرور، قابل ردیابی در برد کانبان."
        actions={can('production.create') && <Button onClick={() => setCreateOpen(true)} className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25"><Plus className="w-4 h-4 ml-1" /> درخواست تولید جدید</Button>}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="list" className="gap-1.5"><Factory className="w-3.5 h-3.5" aria-hidden="true" /> فهرست سفارش‌ها</TabsTrigger>
          <TabsTrigger value="kanban" className="gap-1.5"><KanbanSquare className="w-3.5 h-3.5" aria-hidden="true" /> برد کانبان</TabsTrigger>
          <TabsTrigger value="plan" className="gap-1.5"><CalendarDays className="w-3.5 h-3.5" aria-hidden="true" /> برنامهٔ تولید</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-3">
          <Section>
            <div className="flex flex-wrap gap-2 mb-3">
              <SearchBox value={q} onChange={setQ} placeholder="جستجوی شماره سفارش، خط یا شمارهٔ دستور…" className="w-64" />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                  {Object.entries(ORDER_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DataTable
              columns={columns}
              rows={data?.orders ?? []}
              loading={isLoading}
              onRowClick={(r) => navigate('order-detail', { id: r.id })}
              empty="سفارشی با این فیلتر‌ها یافت نشد"
            />
          </Section>
        </TabsContent>
        <TabsContent value="kanban" className="mt-3">
          <KanbanTab orders={data?.orders ?? []} loading={isLoading} onOpen={(id) => navigate('order-detail', { id })} />
        </TabsContent>
        <TabsContent value="plan" className="mt-3">
          <PlanningTab orders={data?.orders ?? []} loading={isLoading} onOpen={(id) => navigate('order-detail', { id })} />
        </TabsContent>
      </Tabs>

      <CreateOrderDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

// ═══════════════════ برد کانبان (کشیدن و ر‌ها کردن) ═══════════════════
const KANBAN_COLUMNS = [
  'DRAFT', 'APPROVED', 'MATERIAL_CHECK', 'READY', 'IN_PRODUCTION', 'WAITING_QC',
  'REWORK', 'COMPLETED', 'IN_WAREHOUSE', 'SHIPPED', 'CLOSED', 'CANCELLED',
]

const TONE_BAR: Record<string, string> = {
  neutral: 'from-slate-400 to-slate-300',
  info: 'from-teal-500 to-emerald-400',
  success: 'from-emerald-500 to-lime-400',
  warning: 'from-amber-500 to-orange-400',
  danger: 'from-rose-500 to-red-400',
  muted: 'from-gray-400 to-gray-300',
}

function KanbanTab({ orders, loading, onOpen }: { orders: OrderRow[]; loading: boolean; onOpen: (id: string) => void }) {
  const { can } = useApp()
  const qc = useQueryClient()
  const [activeOrder, setActiveOrder] = React.useState<OrderRow | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // اهداف مجاز کارت فعال بر اساس گردش‌کار و مجوز نقش (راهنمای بصری؛ مرجع نهایی سرور است)
  const allowedTargets = React.useMemo(() => {
    if (!activeOrder) return new Set<string>()
    const defs = ORDER_TRANSITIONS[activeOrder.status] ?? []
    return new Set(defs.filter((t) => can(t.perm as never)).map((t) => t.to))
  }, [activeOrder, can])

  const transition = useMutation({
    mutationFn: (v: { id: string; to: string }) => apiPost(`/api/orders/${v.id}`, { action: 'transition', to: v.to }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['orders'] }) // بازگشت کارت به ستون اصلی در صورت رد شدن
    },
  })

  function onDragStart(e: DragStartEvent) {
    const o = orders.find((x) => x.id === e.active.id) ?? null
    setActiveOrder(o)
  }

  function onDragEnd(e: DragEndEvent) {
    const order = activeOrder
    setActiveOrder(null)
    if (!order || !e.over) return
    const to = String(e.over.id)
    if (to === order.status) return
    const def = (ORDER_TRANSITIONS[order.status] ?? []).find((t) => t.to === to)
    if (!def) {
      toast({ title: 'این جابه‌جایی مجاز نیست', description: `از وضعیت «${ORDER_STATUS[order.status]?.label ?? order.status}» به «${ORDER_STATUS[to]?.label ?? to}» گذاری تعریف نشده است.`, variant: 'destructive' })
      return
    }
    transition.mutate({ id: order.id, to })
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveOrder(null)}>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-muted-foreground bg-gradient-to-l from-teal-50/70 to-transparent border border-teal-100 rounded-xl px-3 py-2">
        <KanbanSquare className="w-4 h-4 text-teal-600" aria-hidden="true" />
        <span>کارت هر سفارش را به ستون مقصد بکشید و ر‌ها کنید — ستون‌های مجاز با قاب فیروزه‌ای مشخص می‌شوند و گذار نهایی با گارد‌های سمت سرور (مجوز، QC، آزادسازی، تحویل) اعتبارسنجی می‌شود.</span>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col}
              status={col}
              orders={orders.filter((o) => o.status === col)}
              loading={loading}
              highlight={!!activeOrder && allowedTargets.has(col)}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeOrder ? <KanbanCard order={activeOrder} onOpen={() => {}} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({ status, orders, loading, highlight, onOpen }: {
  status: string; orders: OrderRow[]; loading: boolean; highlight: boolean; onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const l = ORDER_STATUS[status] ?? { label: status, tone: 'neutral' as const }
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-60 shrink-0 rounded-xl border flex flex-col transition-all duration-200',
        highlight ? 'border-teal-400 ring-2 ring-teal-300/50 bg-teal-50/50' : 'border-slate-200 bg-slate-50/60',
        isOver && highlight && 'ring-4 ring-teal-400/60 scale-[1.02]',
      )}
    >
      <div className={cn('h-1.5 rounded-t-xl bg-gradient-to-l', TONE_BAR[l.tone])} aria-hidden="true" />
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-slate-200/70">
        <span className="text-xs font-bold text-slate-700">{l.label}</span>
        <span className="text-[11px] tnum rounded-full bg-white border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">{faInt(orders.length)}</span>
      </div>
      <div className="p-2 space-y-2 max-h-[62vh] overflow-y-auto min-h-20 flex-1">
        {loading && orders.length === 0 && <div className="h-16 rounded-lg shimmer bg-white/70 border border-slate-200/60" />}
        {orders.map((o) => <KanbanCard key={o.id} order={o} onOpen={onOpen} />)}
        {!loading && orders.length === 0 && <div className="text-center text-[11px] text-muted-foreground/70 py-4">—</div>}
      </div>
    </div>
  )
}

function KanbanCard({ order, onOpen, overlay }: { order: OrderRow; onOpen: (id: string) => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id })
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`, rotate: '2deg' }
    : {}
  const overdue = order.plannedEnd && new Date(order.plannedEnd) < new Date() && !['COMPLETED', 'IN_WAREHOUSE', 'SHIPPED', 'CLOSED', 'CANCELLED'].includes(order.status)
  return (
    <div
      ref={setNodeRef}
      style={overlay ? { rotate: '2deg' } : style}
      {...listeners}
      {...attributes}
      role="button"
      aria-label={`سفارش ${order.code}`}
      className={cn(
        'rounded-lg border bg-white p-2.5 shadow-sm cursor-grab active:cursor-grabbing space-y-1.5 touch-none select-none',
        overlay ? 'shadow-xl ring-2 ring-teal-400/60 scale-[1.03] border-teal-300' : 'border-slate-200 hover:border-teal-300 card-lift',
        isDragging && !overlay && 'opacity-30',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <button
          className="font-mono font-bold text-[12px] tnum text-teal-700 hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onOpen(order.id)}
          title="مشاهدهٔ جزئیات سفارش"
        >
          {order.code}
        </button>
        <StatusBadge map={PRIORITY} value={order.priority} />
      </div>
      <div className="text-[11px] leading-snug text-slate-700 truncate">{order.product.name}</div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-muted-foreground tnum">{faInt(order.qty)} دستگاه · {faInt(order._count.devices)} ساخته‌شده</span>
        <StatusBadge map={ORDER_ORIGIN} value={order.originType} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{order.owner?.fullName ?? '—'}</span>
        {overdue ? (
          <span className="text-rose-700 font-semibold flex items-center gap-0.5"><TriangleAlert className="w-3 h-3" aria-hidden="true" /> تأخیر</span>
        ) : order.plannedEnd ? (
          <span className="tnum">مهلت: <DateCell date={order.plannedEnd} /></span>
        ) : null}
      </div>
    </div>
  )
}

// ═══ برنامه تولید (Timeline) ═══
function PlanningTab({ orders, loading, onOpen }: { orders: OrderRow[]; loading: boolean; onOpen: (id: string) => void }) {
  const active = orders.filter((o) => !['CANCELLED', 'SHIPPED', 'CLOSED'].includes(o.status))
  const now = new Date()
  const min = active.length ? Math.min(...active.map((o) => new Date(o.plannedStart ?? o.createdAt).getTime())) : now.getTime()
  const max = active.length ? Math.max(...active.map((o) => new Date(o.plannedEnd ?? o.createdAt).getTime())) : now.getTime() + 1
  const span = Math.max(max - min, 86400000)
  const totalDays = Math.ceil(span / 86400000)

  return (
    <Section title="برنامهٔ تولید (خط زمانی)" desc={`بازهٔ ${faInt(totalDays)} روز — سفارش‌های فعال بر اساس تاریخ برنامه‌ریزی‌شده`}>
      {loading && <div className="text-sm text-muted-foreground py-8 text-center">در حال بارگذاری…</div>}
      {!loading && active.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">سفارش فعالی وجود ندارد</div>}
      <div className="space-y-3">
        {active.map((o) => {
          const start = new Date(o.plannedStart ?? o.createdAt).getTime()
          const end = new Date(o.plannedEnd ?? o.plannedStart ?? o.createdAt).getTime()
          const right = ((start - min) / span) * 100
          const width = Math.max(((end - start) / span) * 100, 4)
          const overdue = o.plannedEnd && new Date(o.plannedEnd) < now && !['COMPLETED', 'IN_WAREHOUSE', 'SHIPPED', 'CLOSED'].includes(o.status)
          return (
            <div key={o.id} className="group">
              <div className="flex items-center justify-between text-xs mb-1">
                <button className="font-semibold text-teal-700 hover:underline tnum" onClick={() => onOpen(o.id)}>{o.code} — {o.product.name}</button>
                <span className="flex items-center gap-2">
                  {overdue && <span className="text-rose-700 font-semibold text-xs flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" /> تأخیر</span>}
                  <StatusBadge map={ORDER_STATUS} value={o.status} />
                </span>
              </div>
              <div className="relative h-7 rounded-lg bg-gradient-to-l from-slate-100 to-slate-50 border border-slate-200/60 overflow-hidden">
                <div
                  className={`absolute h-full rounded-lg flex items-center px-2 text-[11px] text-white font-medium transition-all shadow-md ${o.priority === 'URGENT' ? 'bg-gradient-to-l from-rose-600 to-red-500' : o.priority === 'HIGH' ? 'bg-gradient-to-l from-amber-500 to-orange-400' : 'bg-gradient-to-l from-teal-600 to-teal-500'} ${overdue ? 'ring-2 ring-rose-400' : ''}`}
                  style={{ right: `${right}%`, width: `${width}%` }}
                  title={`${o.plannedStart ?? ''} → ${o.plannedEnd ?? ''}`}
                >
                  <span className="truncate tnum">{faInt(o.qty)} × {o.product.code}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ═══ ایجاد درخواست تولید (با انتخاب مبدأ) ═══
const ORIGIN_ICONS: Record<string, React.ReactNode> = {
  DIRECTIVE: <FileText className="w-4 h-4" aria-hidden="true" />,
  MINUTES: <ScrollText className="w-4 h-4" aria-hidden="true" />,
  CUSTOMER_ORDER: <Users className="w-4 h-4" aria-hidden="true" />,
  INTERNAL: <Factory className="w-4 h-4" aria-hidden="true" />,
}

function CreateOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => apiGet<{ products: { id: string; code: string; name: string; revisions: { id: string; revision: string; isActive: boolean; _count: { boms: number } }[] }[] }>('/api/products') })
  const { data: custData } = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiGet<{ customers: { id: string; code: string; name: string }[] }>('/api/customers'),
    enabled: open,
  })
  const [productId, setProductId] = React.useState('')
  const [revisionId, setRevisionId] = React.useState('')
  const [qty, setQty] = React.useState('10')
  const [priority, setPriority] = React.useState('NORMAL')
  const [line, setLine] = React.useState('')
  const [plannedStart, setPlannedStart] = React.useState('')
  const [plannedEnd, setPlannedEnd] = React.useState('')
  const [notes, setNotes] = React.useState('')
  // مبدأ درخواست
  const [originType, setOriginType] = React.useState('INTERNAL')
  const [originRef, setOriginRef] = React.useState('')
  const [originTitle, setOriginTitle] = React.useState('')
  const [originIssuedBy, setOriginIssuedBy] = React.useState('')
  const [originDate, setOriginDate] = React.useState('')
  const [customerId, setCustomerId] = React.useState('')
  const [error, setError] = React.useState('')

  const product = products?.products.find((p) => p.id === productId)
  const revisions = product?.revisions ?? []
  const activeRev = revisions.find((r) => r.isActive) ?? revisions[revisions.length - 1]

  React.useEffect(() => {
    if (product && activeRev && !revisions.find((r) => r.id === revisionId)) setRevisionId(activeRev.id)
  }, [product, activeRev, revisions, revisionId])

  const needsRef = originType === 'DIRECTIVE' || originType === 'MINUTES' || originType === 'CUSTOMER_ORDER'

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/orders', {
      productId, productRevisionId: revisionId, qty: parseInt(qty) || 0, priority,
      productionLine: line || undefined, plannedStart: plannedStart || undefined, plannedEnd: plannedEnd || undefined,
      notes: notes || undefined,
      originType,
      originRef: originRef || undefined,
      originTitle: originTitle || undefined,
      originIssuedBy: originIssuedBy || undefined,
      originDate: originDate || undefined,
      customerId: customerId || undefined,
    }),
    onSuccess: () => {
      toast({ title: 'درخواست تولید ثبت شد', description: 'سفارش در وضعیت پیش‌نویس ثبت شد و نیازمند تأیید است؛ از برد کانبان قابل پیگیری است.' })
      qc.invalidateQueries({ queryKey: ['orders'] })
      onOpenChange(false)
      reset()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  const reset = () => {
    setProductId(''); setRevisionId(''); setQty('10'); setPriority('NORMAL'); setLine('')
    setPlannedStart(''); setPlannedEnd(''); setNotes('')
    setOriginType('INTERNAL'); setOriginRef(''); setOriginTitle(''); setOriginIssuedBy(''); setOriginDate(''); setCustomerId('')
    setError('')
  }

  const selectedRev = revisions.find((r) => r.id === revisionId)
  const noBom = selectedRev && selectedRev._count.boms === 0

  const refLabel = originType === 'DIRECTIVE' ? 'شمارهٔ دستور مدیریتی *' : originType === 'MINUTES' ? 'شمارهٔ صورت‌جلسه *' : 'شمارهٔ سفارش مشتری'
  const issuedLabel = originType === 'MINUTES' ? 'مرجع ابلاغ‌کننده' : 'صادرکنندهٔ دستور'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Factory className="w-5 h-5 text-teal-700" /> ثبت درخواست تولید</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {/* ── مبدأ درخواست ── */}
          <div className="space-y-1.5 col-span-2">
            <Label>مبدأ درخواست تولید *</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ORDER_ORIGINS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setOriginType(k); setCustomerId('') }}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all',
                    originType === k
                      ? 'border-teal-400 bg-gradient-to-l from-teal-50 to-teal-50/40 text-teal-800 shadow-md shadow-teal-500/10 ring-1 ring-teal-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50/30',
                  )}
                  aria-pressed={originType === k}
                >
                  {ORIGIN_ICONS[k]}
                  {ORDER_ORIGIN[k].label}
                </button>
              ))}
            </div>
          </div>
          {needsRef && (
            <>
              <div className="space-y-1.5">
                <Label>{refLabel}</Label>
                <Input value={originRef} onChange={(e) => setOriginRef(e.target.value)} placeholder={originType === 'DIRECTIVE' ? 'MSD-1405-001' : originType === 'MINUTES' ? 'MJ-1405-012' : 'SO-1405-003'} dir="ltr" className="text-left" />
              </div>
              <div className="space-y-1.5">
                <Label>تاریخ صدور / ابلاغ</Label>
                <Input type="date" value={originDate} onChange={(e) => setOriginDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{issuedLabel}</Label>
                <Input value={originIssuedBy} onChange={(e) => setOriginIssuedBy(e.target.value)} placeholder={originType === 'DIRECTIVE' ? 'مدیرعالی محترم' : originType === 'MINUTES' ? 'دبیر جلسه' : 'واحد فروش'} />
              </div>
              <div className="space-y-1.5">
                <Label>موضوع / عنوان</Label>
                <Input value={originTitle} onChange={(e) => setOriginTitle(e.target.value)} placeholder="مثال: تولید نیم‌سال دوم…" />
              </div>
              {originType === 'CUSTOMER_ORDER' && (
                <div className="space-y-1.5 col-span-2">
                  <Label>مشتری سفارش‌دهنده *</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger><SelectValue placeholder="انتخاب مشتری…" /></SelectTrigger>
                    <SelectContent>
                      {(custData?.customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
          {/* ── پارامتر‌های تولید ── */}
          <div className="space-y-1.5 col-span-2">
            <Label>محصول (کد و نام دستگاه) *</Label>
            <Select value={productId} onValueChange={(v) => { setProductId(v); setRevisionId('') }}>
              <SelectTrigger><SelectValue placeholder="انتخاب محصول" /></SelectTrigger>
              <SelectContent>
                {(products?.products ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>نسخه محصول *</Label>
            <Select value={revisionId} onValueChange={setRevisionId} disabled={!productId}>
              <SelectTrigger><SelectValue placeholder="نسخه" /></SelectTrigger>
              <SelectContent>
                {revisions.map((r) => <SelectItem key={r.id} value={r.id}>{`نسخه ${r.revision}${r.isActive ? ' (فعال)' : ''}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>تعداد *</Label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} dir="ltr" className="text-left" />
          </div>
          <div className="space-y-1.5">
            <Label>اولویت</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>خط تولید</Label>
            <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="مثال: خط ۱ — مونتاژ" />
          </div>
          <div className="space-y-1.5">
            <Label>تاریخ شروع برنامه‌ریزی</Label>
            <Input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>تاریخ پایان برنامه‌ریزی</Label>
            <Input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>توضیحات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {noBom && <div className="col-span-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">این نسخه محصول BOM فعال ندارد؛ ابتدا از بخش «محصولات و BOM» نسخه BOM تعریف کنید.</div>}
          {error && <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !productId || !revisionId || noBom || (originType === 'CUSTOMER_ORDER' && !customerId) || ((originType === 'DIRECTIVE' || originType === 'MINUTES') && !originRef.trim())}
          >
            {mutation.isPending ? 'در حال ثبت…' : 'ثبت پیش‌نویس درخواست'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
