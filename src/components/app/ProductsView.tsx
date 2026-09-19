'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './api'
import { useApp } from './store'
import { PageHeader, DataTable, Section, DateCell, StatusBadge, Field, InfoGrid, StatChips } from './ui-bits'
import { CRITICALITY, ORDER_STATUS } from '@/lib/labels'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { Plus, Layers, ListOrdered, Check, Package, Boxes, Cpu, FileCog } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'

interface ProductRow {
  id: string; code: string; name: string; category: string | null; warrantyMonths: number; hasFirmware: boolean; active: boolean
  revisions: { id: string; revision: string; isActive: boolean; notes: string | null; _count: { boms: number; devices: number; orders: number } }[]
  _count: { devices: number; orders: number }
}

interface BomItemRow { id: string; componentId: string; qty: number; criticality: string }
interface BomComp { id: string; code: string; name: string; manufacturer: string | null; supplier: { name: string } | null; unit: string; criticality: string; stockQty: number }

export default function ProductsView() {
  const { can, params } = useApp()
  const [tab, setTab] = React.useState('list')
  const [detailId, setDetailId] = React.useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['products'], queryFn: () => apiGet<{ products: ProductRow[] }>('/api/products') })
  const products = data?.products ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="محصولات، نسخه‌ها و BOM"
        desc="BOM کنترل‌شده: هر تغییر، نسخهٔ جدیدی ایجاد می‌کند و سفارش‌های قبلی به نسخهٔ زمان تولید خودشان متصل می‌مانند (بدون بازنویسی)"
      />

      <StatChips items={[
        { label: 'محصول فعال', value: faInt(products.filter((p) => p.active).length), tone: 'info', icon: <Package className="w-3.5 h-3.5" /> },
        { label: 'نسخهٔ محصول', value: faInt(products.reduce((s, p) => s + p.revisions.length, 0)), tone: 'neutral', icon: <Layers className="w-3.5 h-3.5" /> },
        { label: 'BOM فعال', value: faInt(products.reduce((s, p) => s + p.revisions.filter((r) => r.isActive && r._count.boms > 0).length, 0)), tone: 'success', icon: <Boxes className="w-3.5 h-3.5" /> },
        { label: 'دستگاه ساخته‌شده', value: faInt(products.reduce((s, p) => s + p._count.devices, 0)), tone: 'neutral', icon: <Cpu className="w-3.5 h-3.5" /> },
      ]} />

      <Section icon={<Package className="w-4 h-4" />}>
        <DataTable
          columns={[
            { key: 'code', header: 'کد', render: (p: ProductRow) => <span className="font-mono font-semibold text-teal-700 tnum">{p.code}</span> },
            { key: 'name', header: 'نام محصول', render: (p: ProductRow) => <div><div className="font-medium">{p.name}</div><div className="text-[11px] text-muted-foreground">{p.category ?? '—'} · گارانتی {faInt(p.warrantyMonths)} ماه{p.hasFirmware ? ' · دارای Firmware' : ''}</div></div> },
            { key: 'revs', header: 'نسخه‌ها', render: (p: ProductRow) => (
              <div className="flex flex-wrap gap-1">
                {p.revisions.map((r) => (
                  <span key={r.id} className={cn('text-[11px] rounded-md border px-1.5 py-0.5', r.isActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium' : 'bg-muted/50 text-muted-foreground')}>
                    {r.revision}{r.isActive && <Check className="w-3 h-3 inline -mt-0.5" aria-hidden="true" />}
                  </span>
                ))}
              </div>
            ) },
            { key: 'bom', header: 'BOM فعال', render: (p: ProductRow) => {
              const active = p.revisions.find((r) => r.isActive)
              return <span className="text-xs tnum">{active && active._count.boms > 0 ? `r${active._count.boms} تعریف‌شده` : 'ندارد'}</span>
            } },
            { key: 'devices', header: 'دستگاه‌های ساخته‌شده', hideOnMobile: true, render: (p: ProductRow) => <span className="tnum">{faInt(p._count.devices)}</span> },
            { key: 'orders', header: 'سفارش‌ها', hideOnMobile: true, render: (p: ProductRow) => <span className="tnum">{faInt(p._count.orders)}</span> },
          ]}
          rows={data?.products ?? []}
          loading={isLoading}
          onRowClick={(p) => { setDetailId(p.id); setTab('detail') }}
          empty="محصولی ثبت نشده است"
        />
      </Section>

      {detailId && <ProductDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

// ═══ جزئیات محصول: BOM + قالب فرایند ═══
function ProductDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { can } = useApp()
  const { data } = useQuery({
    queryKey: ['product', id],
    queryFn: () => apiGet<{ product: {
      id: string; code: string; name: string; description: string | null; category: string | null; warrantyMonths: number; hasFirmware: boolean
      revisions: { id: string; revision: string; isActive: boolean; notes: string | null
        boms: { id: string; revision: number; status: string; effectiveDate: string; notes: string | null; items: { id: string; qty: number; criticality: string; component: { id: string; code: string; name: string; manufacturer: string | null; supplier: { name: string } | null; unit: string } }[] }[]
        processSteps: { id: string; stepIndex: number; name: string; description: string | null; tools: string | null; acceptance: string | null; required: boolean; needsQc: boolean; isPackaging: boolean }[] }[]
      orders: { id: string; code: string; status: string; qty: number; bom: { revision: number } | null }[]
    } }>(`/api/products/${id}`),
  })
  const [tab, setTab] = React.useState('bom')
  const [newBomOpen, setNewBomOpen] = React.useState(false)
  const [revOpen, setRevOpen] = React.useState(false)
  const [revName, setRevName] = React.useState('')
  const [revNotes, setRevNotes] = React.useState('')

  const createRevision = useMutation({
    mutationFn: () => apiPost(`/api/products/${id}`, { action: 'new-revision', revision: revName, notes: revNotes || undefined }),
    onSuccess: () => {
      toast({ title: 'نسخه محصول جدید ایجاد شد', description: 'BOM و قالب فرایندِ نسخهٔ جدید باید تعریف شوند.' })
      qc.invalidateQueries({ queryKey: ['product', id] })
      setRevOpen(false)
    },
  })

  const p = data?.product
  if (!p) return null
  const activeRev = p.revisions.find((r) => r.isActive) ?? p.revisions[p.revisions.length - 1]

  return (
    <div className="mt-6 border-t pt-6 anim-fade-up">
      <div className="relative flex flex-wrap items-start justify-between gap-3 mb-4 pr-4">
        <span className="absolute right-0 top-1 bottom-1 w-1.5 rounded-full bg-gradient-to-b from-teal-600 via-emerald-400 to-teal-300" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold tracking-tight">{p.code} — {p.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{p.description ?? p.category ?? ''} · گارانتی {faInt(p.warrantyMonths)} ماه</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('product.manage') && <Button variant="outline" onClick={() => setRevOpen(true)}><Layers className="w-4 h-4 ml-1" /> نسخه محصول جدید</Button>}
          {can('bom.revise') && activeRev && <Button className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25" onClick={() => setNewBomOpen(true)}><Plus className="w-4 h-4 ml-1" /> نسخه BOM جدید</Button>}
          <Button variant="ghost" onClick={onClose}>بستن</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="bom" className="gap-1.5"><ListOrdered className="w-3.5 h-3.5" aria-hidden="true" /> نسخه‌های BOM</TabsTrigger>
          <TabsTrigger value="process" className="gap-1.5"><FileCog className="w-3.5 h-3.5" aria-hidden="true" /> قالب فرایند تولید</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5"><Boxes className="w-3.5 h-3.5" aria-hidden="true" /> سفارش‌های متصل</TabsTrigger>
        </TabsList>

        <TabsContent value="bom" className="mt-3 space-y-4">
          {p.revisions.flatMap((r) => r.boms.map((b) => (
            <Section key={b.id} title={`نسخه محصول ${r.revision} — BOM نسخه ${faInt(b.revision)}`} desc={`${b.status === 'ACTIVE' ? 'فعال' : 'بازنشسته (سفارش‌های قبلی به آن متصل‌اند)'} · اعمال از ${new Date(b.effectiveDate).toLocaleDateString('fa-IR')}${b.notes ? ' · ' + b.notes : ''}`}>
              <div className="overflow-auto max-h-80">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/70 text-xs text-muted-foreground">
                    <th className="text-right px-2 py-2">#</th><th className="text-right px-2 py-2">کد</th><th className="text-right px-2 py-2">قطعه</th>
                    <th className="text-right px-2 py-2">سازنده</th><th className="text-right px-2 py-2">تأمین‌کننده</th>
                    <th className="text-right px-2 py-2">تعداد/دستگاه</th><th className="text-right px-2 py-2">اهمیت</th>
                  </tr></thead>
                  <tbody>
                    {b.items.map((item, i) => (
                      <tr key={item.id} className="border-b last:border-b-0">
                        <td className="px-2 py-2 text-muted-foreground tnum">{faInt(i + 1)}</td>
                        <td className="px-2 py-2 font-mono text-xs tnum">{item.component.code}</td>
                        <td className="px-2 py-2">{item.component.name}</td>
                        <td className="px-2 py-2 text-xs">{item.component.manufacturer ?? '—'}</td>
                        <td className="px-2 py-2 text-xs">{item.component.supplier?.name ?? '—'}</td>
                        <td className="px-2 py-2 tnum">{faInt(item.qty)}</td>
                        <td className="px-2 py-2"><StatusBadge map={CRITICALITY} value={item.criticality} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )))}
        </TabsContent>

        <TabsContent value="process" className="mt-3">
          <Section title="قالب فرایند تولید" desc={`نسخه ${activeRev?.revision} — با تأیید هر سفارش، مراحل آن در سفارش کپی می‌شود`} icon={<FileCog className="w-4 h-4" />}>
            <div className="space-y-2">
              {(activeRev?.processSteps ?? []).map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                  <span className="w-6 h-6 rounded-md bg-gradient-to-br from-teal-600 to-emerald-500 text-white flex items-center justify-center text-[11px] font-bold tnum shadow-sm">{faInt(s.stepIndex)}</span>
                  <span className="text-[13px] font-medium">{s.name}</span>
                  {s.required && <span className="text-[10px] text-rose-600 border border-rose-200 rounded px-1">اجباری</span>}
                  {s.isPackaging && <span className="text-[10px] text-teal-700 border border-teal-200 rounded px-1">بسته‌بندی</span>}
                  {s.needsQc && <span className="text-[10px] text-purple-700 border border-purple-200 rounded px-1">QC</span>}
                  <span className="text-[11px] text-muted-foreground mr-auto">{s.acceptance ?? s.tools ?? ''}</span>
                </div>
              ))}
              {(activeRev?.processSteps ?? []).length === 0 && <div className="text-sm text-muted-foreground text-center py-6">قالب فرایندی تعریف نشده است</div>}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="orders" className="mt-3">
          <Section title="سفارش‌های متصل به نسخه‌های این محصول" desc="هر سفارش به نسخهٔ BOM زمان تولید خود متصل است" icon={<Boxes className="w-4 h-4" />}>
            <DataTable
              columns={[
                { key: 'code', header: 'سفارش', render: (o: { id: string; code: string }) => <span className="text-teal-700 tnum font-medium">{o.code}</span> },
                { key: 'qty', header: 'تعداد', render: (o: { qty: number }) => <span className="tnum">{faInt(o.qty)}</span> },
                { key: 'bom', header: 'BOM', render: (o: { bom: { revision: number } | null }) => <span className="tnum">r{faInt(o.bom?.revision ?? 0)}</span> },
                { key: 'status', header: 'وضعیت', render: (o: { status: string }) => <StatusBadge map={ORDER_STATUS} value={o.status} /> },
              ]}
              rows={p.orders as never[]}
              empty="سفارشی ثبت نشده"
            />
          </Section>
        </TabsContent>
      </Tabs>

      {/* نسخه BOM جدید */}
      {activeRev && (
        <NewBomDialog
          open={newBomOpen}
          onOpenChange={setNewBomOpen}
          productId={id}
          revisionId={activeRev.id}
          currentItems={activeRev.boms.find((b) => b.status === 'ACTIVE')?.items ?? activeRev.boms[0]?.items ?? []}
        />
      )}

      {/* نسخه محصول جدید */}
      <Dialog open={revOpen} onOpenChange={setRevOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>نسخه محصول جدید</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>شناسه نسخه (A/B/C…)</Label><Input value={revName} onChange={(e) => setRevName(e.target.value.toUpperCase())} dir="ltr" className="text-left" maxLength={5} /></div>
            <div className="space-y-1.5"><Label>توضیح تغییرات</Label><Textarea value={revNotes} onChange={(e) => setRevNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevOpen(false)}>انصراف</Button>
            <Button onClick={() => createRevision.mutate()} disabled={createRevision.isPending || !revName}>ایجاد نسخه</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══ ایجاد نسخه BOM جدید (کپی + ویرایش) ═══
function NewBomDialog({ open, onOpenChange, productId, revisionId, currentItems }: {
  open: boolean; onOpenChange: (v: boolean) => void; productId: string; revisionId: string
  currentItems: { id: string; componentId: string; qty: number; criticality: string; component: { id: string; code: string; name: string; manufacturer: string | null; unit: string } }[]
}) {
  const qc = useQueryClient()
  const { data: comps } = useQuery({ queryKey: ['components-min'], queryFn: () => apiGet<{ components: { id: string; code: string; name: string; criticality: string }[] }>('/api/inventory') })
  const [items, setItems] = React.useState<BomItemRow[]>([])
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setItems(currentItems.map((i) => ({ id: i.id, componentId: i.componentId, qty: i.qty, criticality: i.criticality })))
      setNotes(''); setError('')
    }
  }, [open, currentItems])

  const update = (idx: number, patch: Partial<BomItemRow>) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  const remove = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))
  const add = () => setItems((prev) => [...prev, { id: `new-${Date.now()}`, componentId: comps?.components[0]?.id ?? '', qty: 1, criticality: 'NORMAL' }])

  const mutation = useMutation({
    mutationFn: () => apiPost(`/api/products/${productId}`, {
      action: 'new-bom-revision', productRevisionId: revisionId, notes: notes || undefined,
      items: items.map((i) => ({ componentId: i.componentId, qty: i.qty, criticality: i.criticality })),
    }),
    onSuccess: () => {
      toast({ title: 'نسخه جدید BOM فعال شد', description: 'نسخهٔ قبلی بازنشسته شد؛ سفارش‌های قبلی به نسخهٔ خود متصل باقی می‌مانند.' })
      qc.invalidateQueries({ queryKey: ['product', productId] })
      onOpenChange(false)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  const compById = (cid: string) => comps?.components.find((c) => c.id === cid)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ListOrdered className="w-5 h-5 text-teal-700" /> نسخه جدید BOM</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">روی نسخهٔ فعلی بازنویسی (Overwrite) نمی‌شود؛ نسخهٔ جدید ایجاد و نسخهٔ قبلی بازنشسته می‌شود.</p>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={it.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
              <Select value={it.componentId} onValueChange={(v) => update(idx, { componentId: v })}>
                <SelectTrigger className="w-56 flex-1"><SelectValue placeholder="قطعه" /></SelectTrigger>
                <SelectContent>
                  {(comps?.components ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" min={0.1} step="0.1" value={it.qty} onChange={(e) => update(idx, { qty: parseFloat(e.target.value) || 0 })} dir="ltr" className="w-24 text-left" title="تعداد در هر دستگاه" />
              <Select value={it.criticality} onValueChange={(v) => update(idx, { criticality: v })}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRITICAL">بحرانی</SelectItem>
                  <SelectItem value="NORMAL">عادی</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => remove(idx)} className="text-rose-700">حذف</Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={add}><Plus className="w-4 h-4 ml-1" /> افزودن قطعه</Button>
          <div className="space-y-1.5">
            <Label>علت تغییر نسخه</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="مثال: افزودن فیوز دوم برای ایمنی بیشتر…" />
          </div>
          {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || items.length === 0}>
            {mutation.isPending ? 'در حال ثبت…' : 'ایجاد و فعال‌سازی نسخه'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
