'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './api'
import { useApp } from './store'
import { PageHeader, DataTable, Section, DateCell, StatusBadge, SearchBox, KpiCard } from './ui-bits'
import { CRITICALITY, LOT_STATUS, MOVEMENT_TYPE } from '@/lib/labels'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { Plus, PackagePlus, ClipboardCheck, Boxes, TriangleAlert, Check, ArrowUpDown, PackageSearch, Layers, PackageMinus, BookOpen, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'

interface ComponentRow {
  id: string; code: string; name: string; category: string | null; manufacturer: string | null; specs: string | null; unit: string
  criticality: string; supplier: { name: string; code: string } | null
  stockQty: number; reservedQty: number; minStock: number
  availableQty: number; belowMin: boolean; shortage: boolean
  lots: { id: string; lotNumber: string; quantity: number; remaining: number; status: string; receivedAt: string; inspections: { code: string; status: string }[] }[]
}

interface InspectionRow {
  id: string; code: string; qty: number; status: string; decisionNote: string | null
  component: { code: string; name: string; unit: string; criticality: string }
  lot: { lotNumber: string; status: string } | null
  inspector: { fullName: string } | null; inspectedAt: string | null; createdAt: string
}

interface MovementRow {
  id: string; code: string; type: string; qty: number; beforeQty: number; afterQty: number
  lotNumber: string | null; reason: string | null; createdAt: string
  component: { code: string; name: string; unit: string }
  user: { fullName: string }
  order: { code: string } | null
}

interface BomCatalogProduct {
  id: string; code: string; name: string; unit: string
  revisions: {
    id: string; revision: string
    boms: {
      id: string; revision: number
      items: {
        componentId: string; qty: number; criticality: string
        component: { id: string; code: string; name: string; unit: string; stockQty: number; reservedQty: number; criticality: string }
      }[]
    }[]
  }[]
}

export default function InventoryView() {
  const { can } = useApp()
  const [tab, setTab] = React.useState('components')
  const [q, setQ] = React.useState('')
  const [shortageOnly, setShortageOnly] = React.useState(false)
  const [receiveFor, setReceiveFor] = React.useState<ComponentRow | null>(null)
  const [adjustFor, setAdjustFor] = React.useState<ComponentRow | null>(null)
  const [outFor, setOutFor] = React.useState<ComponentRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', q, shortageOnly],
    queryFn: () => apiGet<{ components: ComponentRow[]; suppliers: { id: string; code: string; name: string }[]; inspections: InspectionRow[]; movements: MovementRow[]; bomCatalog: BomCatalogProduct[] }>(`/api/inventory${q ? `?q=${encodeURIComponent(q)}` : ''}${shortageOnly ? (q ? '&' : '?') + 'shortage=1' : ''}`),
  })

  const comps = data?.components ?? []
  const criticalShortage = comps.filter((c) => c.shortage || (c.belowMin && c.criticality === 'CRITICAL')).length
  const belowMin = comps.filter((c) => c.belowMin).length
  const pendingLots = comps.flatMap((c) => c.lots).filter((l) => l.status === 'PENDING').length

  return (
    <div className="space-y-4">
      <PageHeader
        title="انبار، دفتر گردش کالا و کنترل ورودی"
        desc="ورود و خروج دستی، مصرف خودکار بر اساس BOM (مثال: «۱۰ مجموعه مصرف شد»)، رزرو سفارش‌ها، ردیابی لات‌ها و گیت کنترل کیفیت روی اقلام ورودی — همهٔ تغییرات در دفتر گردش کالا ثبت می‌شوند."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
        <KpiCard label="اقلام فعال" value={comps.length} tone="info" icon={<Boxes className="w-5 h-5" />} />
        <KpiCard label="زیر حداقل موجودی" value={belowMin} tone="warning" icon={<TriangleAlert className="w-5 h-5" />} />
        <KpiCard label="کسری بحرانی" value={criticalShortage} tone="danger" icon={<TriangleAlert className="w-5 h-5" />} />
        <KpiCard label="لات در انتظار IQC" value={pendingLots} tone="warning" icon={<PackageSearch className="w-5 h-5" />} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="components" className="gap-1.5"><Boxes className="w-3.5 h-3.5" aria-hidden="true" /> قطعات و موجودی</TabsTrigger>
          <TabsTrigger value="bom" className="gap-1.5"><Zap className="w-3.5 h-3.5" aria-hidden="true" /> مصرف خودکار BOM</TabsTrigger>
          <TabsTrigger value="movements" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> دفتر گردش کالا</TabsTrigger>
          <TabsTrigger value="lots" className="gap-1.5"><Layers className="w-3.5 h-3.5" aria-hidden="true" /> لات‌ها</TabsTrigger>
          <TabsTrigger value="incoming" className="gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" /> کنترل ورودی (IQC)</TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="mt-3">
          <Section icon={<Boxes className="w-4 h-4" />}>
            <div className="flex flex-wrap gap-2 mb-3">
              <SearchBox value={q} onChange={setQ} placeholder="کد، نام یا سازنده…" className="w-64" />
              <Button variant={shortageOnly ? 'default' : 'outline'} onClick={() => setShortageOnly(!shortageOnly)}>
                فقط اقلام دارای کسری یا زیر حداقل
              </Button>
            </div>
            <DataTable
              columns={[
                { key: 'code', header: 'کد قطعه', render: (c: ComponentRow) => (
                  <div>
                    <span className="font-mono font-semibold text-[13px] tnum">{c.code}</span>
                    <div className="text-[11px] text-muted-foreground">{c.manufacturer ?? '—'}</div>
                  </div>
                ) },
                { key: 'name', header: 'نام', render: (c: ComponentRow) => (
                  <div>
                    <div className="text-[13px] flex items-center gap-1.5 flex-wrap">
                      {c.name}
                      {c.category && <span className="text-[10px] rounded-full bg-teal-100/70 text-teal-700 px-1.5 py-px whitespace-nowrap">{c.category}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate max-w-56" title={c.specs ?? ''}>{c.specs ?? ''}</div>
                  </div>
                ) },
                { key: 'supplier', header: 'تأمین‌کننده', hideOnMobile: true, render: (c: ComponentRow) => <span className="text-xs">{c.supplier?.name ?? '—'}</span> },
                { key: 'crit', header: 'اهمیت', render: (c: ComponentRow) => <StatusBadge map={CRITICALITY} value={c.criticality} /> },
                { key: 'stock', header: 'موجودی', render: (c: ComponentRow) => (
                  <div className="tnum">
                    <span className={cn('font-semibold', c.belowMin && 'text-amber-700', c.shortage && 'text-rose-700')}>{faInt(c.stockQty)}</span>
                    <span className="text-muted-foreground text-xs"> {c.unit}</span>
                  </div>
                ) },
                { key: 'reserved', header: 'رزرو', hideOnMobile: true, render: (c: ComponentRow) => <span className="tnum text-amber-700">{faInt(c.reservedQty)}</span> },
                { key: 'available', header: 'قابل استفاده', render: (c: ComponentRow) => (
                  <span className={cn('tnum font-semibold', c.availableQty < 0 ? 'text-rose-700' : 'text-emerald-700')}>{faInt(c.availableQty)}</span>
                ) },
                { key: 'status', header: 'وضعیت', render: (c: ComponentRow) => (
                  <div className="flex flex-col gap-1">
                    {c.shortage && <span className="text-[11px] text-rose-700 font-semibold flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" /> کسری</span>}
                    {!c.shortage && c.belowMin && <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" /> زیر حداقل</span>}
                    {!c.belowMin && !c.shortage && <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden="true" /> نرمال</span>}
                  </div>
                ) },
                { key: 'actions', header: 'اقدام', render: (c: ComponentRow) => (
                  <div className="flex gap-1">
                    {can('inventory.receive') && <Button size="sm" variant="outline" aria-label="ثبت رسید" title="ثبت رسید (ورود + کنترل ورودی)" onClick={() => setReceiveFor(c)}><PackagePlus className="w-3.5 h-3.5" /></Button>}
                    {can('inventory.move') && <Button size="sm" variant="outline" aria-label="خروج دستی" title="خروج دستی از انبار" onClick={() => setOutFor(c)}><PackageMinus className="w-3.5 h-3.5" /></Button>}
                    {can('inventory.adjust') && <Button size="sm" variant="outline" aria-label="اصلاح موجودی" title="اصلاح موجودی (شمارش)" onClick={() => setAdjustFor(c)}><ArrowUpDown className="w-3.5 h-3.5" /></Button>}
                  </div>
                ) },
              ]}
              rows={comps}
              loading={isLoading}
              empty="قطعه‌ای یافت نشد"
            />
          </Section>
        </TabsContent>

        <TabsContent value="bom" className="mt-3">
          <BomConsumeTab catalog={data?.bomCatalog ?? []} />
        </TabsContent>

        <TabsContent value="movements" className="mt-3">
          <MovementsTab movements={data?.movements ?? []} loading={isLoading} />
        </TabsContent>

        <TabsContent value="lots" className="mt-3">
          <Section title="لات‌های قطعات" desc="ردیابی دوسویه: لات ← دستگاه‌های مصرف‌کننده (از پروندهٔ دستگاه قابل مشاهده است)" icon={<Layers className="w-4 h-4" />}>
            <div className="space-y-2">
              {comps.flatMap((c) => c.lots.map((l) => ({ ...l, comp: c }))).sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()).map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 card-lift hover:border-teal-200 transition-all">
                  <span className="font-mono font-semibold text-[13px] tnum">{l.lotNumber}</span>
                  <span className="text-sm">{l.comp.name} <span className="text-[11px] text-muted-foreground tnum">({l.comp.code})</span></span>
                  <StatusBadge map={LOT_STATUS} value={l.status} />
                  <span className="text-xs text-muted-foreground">باقی‌مانده: <span className="tnum">{faInt(l.remaining)}</span> از <span className="tnum">{faInt(l.quantity)}</span></span>
                  <span className="text-xs text-muted-foreground mr-auto"><DateCell date={l.receivedAt} /></span>
                </div>
              ))}
              {comps.flatMap((c) => c.lots).length === 0 && <div className="text-sm text-muted-foreground text-center py-8">لاتی ثبت نشده است</div>}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="incoming" className="mt-3">
          <Section title="کنترل قطعات ورودی (Incoming QC)" desc="مواد اولیه ابتدا وارد کنترل کیفیت می‌شوند و پس از تأیید برای مصرف آزاد می‌شوند — ردِ لات به‌صورت خودکار NCR مواد صادر می‌کند و لات از موجودی خارج می‌شود" icon={<ClipboardCheck className="w-4 h-4" />}>
            <div className="space-y-2">
              {(data?.inspections ?? []).map((ins) => (
                <div key={ins.id} className={cn('rounded-xl border p-3.5 space-y-2', ins.status === 'PENDING' && 'border-amber-200 bg-amber-50/50', ins.status === 'APPROVED' && 'border-emerald-200 bg-emerald-50/40', ins.status === 'REJECTED' && 'border-rose-200 bg-rose-50/40')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-[13px] tnum">{ins.code}</span>
                    <span className="text-sm">{ins.component.name}</span>
                    <StatusBadge map={{ PENDING: { label: 'در انتظار تصمیم', tone: 'warning' }, APPROVED: { label: 'تأیید‌شده', tone: 'success' }, REJECTED: { label: 'رد‌شده', tone: 'danger' } }} value={ins.status} />
                    <span className="text-xs text-muted-foreground tnum mr-auto">{faInt(ins.qty)} {ins.component.unit} · {ins.lot?.lotNumber ?? '—'}</span>
                  </div>
                  {ins.decisionNote && <div className="text-xs text-muted-foreground">تصمیم: {ins.decisionNote} — {ins.inspector?.fullName ?? ''} · <DateCell date={ins.inspectedAt} withTime /></div>}
                  {ins.status === 'PENDING' && can('qc.incoming.decide') && <IncomingDecision inspection={ins} />}
                </div>
              ))}
              {(data?.inspections ?? []).length === 0 && <div className="text-sm text-muted-foreground text-center py-8">رسید کنترلی وجود ندارد</div>}
            </div>
          </Section>
        </TabsContent>
      </Tabs>

      {/* دیالوگ رسید انبار */}
      <ReceiveDialog comp={receiveFor} suppliers={data?.suppliers ?? []} onClose={() => setReceiveFor(null)} />
      {/* دیالوگ خروج دستی */}
      <ManualOutDialog comp={outFor} onClose={() => setOutFor(null)} />
      {/* دیالوگ اصلاح موجودی */}
      <AdjustDialog comp={adjustFor} onClose={() => setAdjustFor(null)} />
    </div>
  )
}

// ═══ مصرف خودکار بر اساس BOM ═══
function BomConsumeTab({ catalog }: { catalog: BomCatalogProduct[] }) {
  const qc = useQueryClient()
  const { can } = useApp()
  const [productId, setProductId] = React.useState('')
  const [count, setCount] = React.useState('1')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState('')

  const product = catalog.find((p) => p.id === productId)
  const rev = product?.revisions[0]
  const bom = rev?.boms[0]
  const items = bom?.items ?? []
  const countN = parseInt(count) || 0
  const plan = items.map((it) => ({
    ...it,
    required: Math.round(it.qty * countN * 1e6) / 1e6,
    available: Math.max(0, it.component.stockQty - it.component.reservedQty),
  }))
  const hasShortage = countN > 0 && plan.some((p) => p.required > p.available)

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/inventory', { action: 'bom-consume', productId, count: countN, reason }),
    onSuccess: (r: { consumed?: { code: string; name: string; qty: number }[] }) => {
      toast({
        title: 'مصرف BOM ثبت شد',
        description: `${faInt(r.consumed?.length ?? 0)} قلم به نسبت ${faInt(countN)} مجموعه از BOM کسر و در دفتر گردش کالا ثبت شد.`,
      })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setReason(''); setError(''); setCount('1')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  if (catalog.length === 0) {
    return (
      <Section title="مصرف خودکار بر اساس BOM" desc="هیچ محصول فعال با BOM فعال یافت نشد؛ ابتدا محصول و BOM تعریف کنید." icon={<Zap className="w-4 h-4" />}>
        <div className="text-sm text-muted-foreground text-center py-8">محصولی با BOM فعال وجود ندارد</div>
      </Section>
    )
  }

  return (
    <Section
      title="مصرف خودکار موجودی بر اساس BOM"
      desc="به‌جای خروج تک‌تک قطعات، محصول (BOM) و تعداد مجموعه را انتخاب کنید — مثلاً «۱۰ مجموعه از این BOM مصرف شده» — سامانه همهٔ اقلام را به نسبت BOM × تعداد، با مصرف FIFO لات‌ها و ثبت دفتر گردش کالا کسر می‌کند."
      icon={<Zap className="w-4 h-4" />}
    >
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>محصول (BOM فعال) *</Label>
          <Select value={productId} onValueChange={(v) => { setProductId(v); setError('') }}>
            <SelectTrigger><SelectValue placeholder="انتخاب محصول…" /></SelectTrigger>
            <SelectContent>
              {catalog.map((p) => (
                <SelectItem key={p.id} value={p.id} disabled={p.revisions.length === 0 || p.revisions[0].boms.length === 0}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>تعداد مجموعه (BOM) *</Label>
          <Input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} dir="ltr" className="text-left" />
        </div>
        <div className="space-y-1.5">
          <Label>دلیل / مبنای مصرف *</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: پایان مرحلهٔ مونتاژ شمارهٔ ۳" />
        </div>
      </div>

      {bom && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
            <span className="font-semibold">{product?.name}</span>
            <span className="text-muted-foreground tnum">نسخه {rev?.revision} · BOM r{bom.revision} · {faInt(items.length)} قلم</span>
            <span className="text-muted-foreground tnum mr-auto">نتیجهٔ محاسبه: {faInt(countN)} × BOM</span>
          </div>
          <div className="overflow-auto rounded-lg border border-slate-200/70 max-h-72">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-l from-teal-50/90 via-slate-50/95 to-slate-50/95">
                  <th className="text-right font-bold text-xs text-muted-foreground px-3 py-2.5 border-b">قطعه</th>
                  <th className="text-right font-bold text-xs text-muted-foreground px-3 py-2.5 border-b">در هر مجموعه</th>
                  <th className="text-right font-bold text-xs text-muted-foreground px-3 py-2.5 border-b">مصرف کل</th>
                  <th className="text-right font-bold text-xs text-muted-foreground px-3 py-2.5 border-b">قابل استفاده</th>
                  <th className="text-right font-bold text-xs text-muted-foreground px-3 py-2.5 border-b">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.componentId} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <div className="text-[13px]">{p.component.name}</div>
                      <div className="text-[10px] text-muted-foreground tnum">{p.component.code}</div>
                    </td>
                    <td className="px-3 py-2 tnum text-xs">{faInt(p.qty)} {p.component.unit}</td>
                    <td className="px-3 py-2 tnum font-semibold">{faInt(p.required)}</td>
                    <td className={cn('px-3 py-2 tnum', p.required > p.available ? 'text-rose-700 font-semibold' : 'text-emerald-700')}>{faInt(p.available)}</td>
                    <td className="px-3 py-2">
                      {p.required > p.available ? (
                        <span className="text-[11px] text-rose-700 font-semibold flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" /> کسری {faInt(p.required - p.available)}</span>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden="true" /> کافی</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasShortage && (
            <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              موجودی برای یک یا چند قلم کافی نیست؛ تا تأمین موجودی، ثبت مصرف انجام نمی‌شود (هیچ قلمی کسر نمی‌شود).
            </div>
          )}
          {error && <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !productId || !countN || countN < 1 || !reason.trim() || hasShortage}
              className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25"
            >
              <Zap className="w-4 h-4 ml-1" />
              {mutation.isPending ? 'در حال ثبت…' : `ثبت مصرف ${faInt(countN)} مجموعه از BOM`}
            </Button>
            {!can('inventory.bomConsume') && <span className="text-xs text-amber-700">مجوز «مصرف خودکار BOM» را ندارید.</span>}
          </div>
        </div>
      )}
    </Section>
  )
}

// ═══ دفتر گردش کالا ═══
function MovementsTab({ movements, loading }: { movements: MovementRow[]; loading: boolean }) {
  const [typeFilter, setTypeFilter] = React.useState('all')
  const filtered = typeFilter === 'all' ? movements : movements.filter((m) => m.type === typeFilter)
  const totalIn = movements.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0)
  const totalOut = movements.filter((m) => m.qty < 0).reduce((s, m) => s + Math.abs(m.qty), 0)

  return (
    <Section
      title="دفتر گردش کالا (تغییرناپذیر)"
      desc={`آخرین ${faInt(movements.length)} رویداد — جمع ورود: ${faInt(totalIn)} · جمع خروج: ${faInt(totalOut)} — هر رویداد شامل مقدار قبل/بعد، مبنا و کاربر ثبت‌کننده است`}
      icon={<BookOpen className="w-4 h-4" />}
      actions={
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همهٔ انواع</SelectItem>
            {Object.entries(MOVEMENT_TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      }
    >
      <DataTable
        columns={[
          { key: 'code', header: 'شماره', render: (m: MovementRow) => <span className="font-mono text-[12px] font-semibold tnum text-teal-700">{m.code}</span> },
          { key: 'date', header: 'زمان', render: (m: MovementRow) => <DateCell date={m.createdAt} withTime /> },
          { key: 'component', header: 'قطعه', render: (m: MovementRow) => (
            <div>
              <div className="text-[13px] truncate max-w-44">{m.component.name}</div>
              <div className="text-[10px] text-muted-foreground tnum">{m.component.code}</div>
            </div>
          ) },
          { key: 'type', header: 'نوع', render: (m: MovementRow) => <StatusBadge map={MOVEMENT_TYPE} value={m.type} /> },
          { key: 'qty', header: 'مقدار', render: (m: MovementRow) => (
            <span className={cn('tnum font-bold', m.qty > 0 ? 'text-emerald-700' : 'text-rose-700')}>
              {m.qty > 0 ? '+' : '−'}{faInt(Math.abs(m.qty))} <span className="text-[10px] text-muted-foreground font-normal">{m.component.unit}</span>
            </span>
          ) },
          { key: 'bal', header: 'قبل ← بعد', hideOnMobile: true, render: (m: MovementRow) => (
            <span className="tnum text-xs text-muted-foreground">{faInt(m.beforeQty)} ← {faInt(m.afterQty)}</span>
          ) },
          { key: 'lot', header: 'لات', hideOnMobile: true, render: (m: MovementRow) => <span className="font-mono text-[11px] tnum">{m.lotNumber ?? '—'}</span> },
          { key: 'order', header: 'سفارش', hideOnMobile: true, render: (m: MovementRow) => m.order ? <span className="tnum text-xs text-teal-700">{m.order.code}</span> : <span className="text-xs text-muted-foreground">—</span> },
          { key: 'user', header: 'ثبت‌کننده', hideOnMobile: true, render: (m: MovementRow) => <span className="text-xs">{m.user.fullName}</span> },
          { key: 'reason', header: 'مبنا/دلیل', render: (m: MovementRow) => <span className="text-[11px] text-muted-foreground truncate max-w-48 block" title={m.reason ?? ''}>{m.reason ?? '—'}</span> },
        ]}
        rows={filtered}
        loading={loading}
        empty="رویدادی در دفتر گردش کالا ثبت نشده است"
      />
    </Section>
  )
}

function IncomingDecision({ inspection }: { inspection: InspectionRow }) {
  const qc = useQueryClient()
  const [note, setNote] = React.useState('')
  const mutation = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') => apiPost('/api/incoming', { action: 'decide', inspectionId: inspection.id, decision, note: note || undefined }),
    onSuccess: () => {
      toast({ title: 'تصمیم IQC ثبت شد' })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت تصمیم (نمونه‌گیری، مشاهدات…)" className="flex-1 min-w-48" />
      <Button size="sm" variant="destructive" onClick={() => mutation.mutate('REJECTED')} disabled={mutation.isPending}>رد لات (خروج از موجودی + NCR)</Button>
      <Button size="sm" onClick={() => mutation.mutate('APPROVED')} disabled={mutation.isPending}>تأیید لات</Button>
    </div>
  )
}

function ReceiveDialog({ comp, suppliers, onClose }: { comp: ComponentRow | null; suppliers: { id: string; code: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [lotNumber, setLotNumber] = React.useState('')
  const [qty, setQty] = React.useState('')
  const [supplierId, setSupplierId] = React.useState('')
  const [error, setError] = React.useState('')

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/inventory', { action: 'receive', componentId: comp!.id, lotNumber, qty: parseFloat(qty), supplierId: supplierId || undefined }),
    onSuccess: () => {
      toast({ title: 'رسید ثبت شد', description: 'لات در انتظار کنترل ورودی (IQC) است و پس از تأیید QC برای مصرف آزاد می‌شود.' })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      onClose(); setLotNumber(''); setQty(''); setError('')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Dialog open={!!comp} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-teal-700" /> ثبت رسید انبار — {comp?.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label>شماره لات *</Label>
            <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} dir="ltr" className="text-left" placeholder="LT-XXX-0000" />
          </div>
          <div className="space-y-1.5">
            <Label>تعداد *</Label>
            <Input type="number" min={0.1} value={qty} onChange={(e) => setQty(e.target.value)} dir="ltr" className="text-left" />
          </div>
          <div className="space-y-1.5">
            <Label>تأمین‌کننده</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 text-[11px] text-muted-foreground">پس از ثبت، لات در وضعیت «در انتظار کنترل ورودی» قرار می‌گیرد و پس از تأیید QC برای مصرف آزاد می‌شود.</div>
          {error && <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !lotNumber || !qty}>{mutation.isPending ? 'در حال ثبت…' : 'ثبت رسید'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══ خروج دستی انبار ═══
function ManualOutDialog({ comp, onClose }: { comp: ComponentRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [qty, setQty] = React.useState('')
  const [lotId, setLotId] = React.useState('auto')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState('')

  React.useEffect(() => { if (comp) { setQty(''); setLotId('auto'); setReason(''); setError('') } }, [comp])

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/inventory', {
      action: 'out', componentId: comp!.id, qty: parseFloat(qty),
      lotId: lotId === 'auto' ? undefined : lotId, reason,
    }),
    onSuccess: () => {
      toast({ title: 'خروج دستی ثبت شد', description: 'خروج با دلیل و شمارهٔ گردش در دفتر ثبت شد.' })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  const approvedLots = (comp?.lots ?? []).filter((l) => l.status === 'APPROVED' && l.remaining > 0)

  return (
    <Dialog open={!!comp} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><PackageMinus className="w-5 h-5 text-rose-600" /> خروج دستی انبار — {comp?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>موجودی / قابل استفاده</Label>
              <div className="tnum text-sm pt-1.5">{faInt(comp?.stockQty ?? 0)} / {faInt(comp?.availableQty ?? 0)} {comp?.unit}</div>
            </div>
            <div className="space-y-1.5">
              <Label>تعداد خروج *</Label>
              <Input type="number" min={0.1} value={qty} onChange={(e) => setQty(e.target.value)} dir="ltr" className="text-left" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>لات (اختیاری — پیش‌فرض: مصرف FIFO)</Label>
            <Select value={lotId} onValueChange={setLotId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">خودکار (FIFO از لات‌های تأیید‌شده)</SelectItem>
                {approvedLots.map((l) => <SelectItem key={l.id} value={l.id}>{l.lotNumber} — باقیمانده {faInt(l.remaining)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>دلیل خروج *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="مصرف داخلی، ضایعات، ارسال نمونه…" />
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> خروج در دفتر گردش کالا با مقدار قبل/بعد ثبت می‌شود و رزرو سفارش‌های دیگر قابل مصرف دستی نیست.</div>
          {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending || !qty || !reason.trim()}>{mutation.isPending ? 'در حال ثبت…' : 'ثبت خروج'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AdjustDialog({ comp, onClose }: { comp: ComponentRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [newQty, setNewQty] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState('')

  React.useEffect(() => { if (comp) setNewQty(String(comp.stockQty)) }, [comp])

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/inventory', { action: 'adjust', componentId: comp!.id, newQty: parseFloat(newQty), reason }),
    onSuccess: () => {
      toast({ title: 'موجودی اصلاح شد', description: 'اصلاح همراه با دلیل در ردّ تغییرات ثبت شد.' })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      onClose(); setReason(''); setError('')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Dialog open={!!comp} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>اصلاح موجودی — {comp?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>موجودی فعلی</Label><div className="tnum text-sm pt-1.5">{faInt(comp?.stockQty ?? 0)} {comp?.unit}</div></div>
            <div className="space-y-1.5"><Label>مقدار جدید *</Label><Input type="number" min={0} value={newQty} onChange={(e) => setNewQty(e.target.value)} dir="ltr" className="text-left" /></div>
          </div>
          <div className="space-y-1.5"><Label>دلیل اصلاح *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="شمارش انبار، ضایعات، مغایرت…" /></div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" /> این اقدام با مقادیر قبلی و جدید در ردّ تغییرات ثبت می‌شود.</div>
          {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !reason || newQty === ''}>{mutation.isPending ? 'در حال ثبت…' : 'ثبت اصلاح'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
