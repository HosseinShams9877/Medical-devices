'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './api'
import { useApp } from './store'
import { PageHeader, DataTable, Section, DateCell, StatusBadge, SearchBox, WorkflowActions, Field, InfoGrid, KpiCard, RelDate, WorkflowStepper, StatChips, type TransitionBtn } from './ui-bits'
import { TICKET_STATUS, PRIORITY, COMPLAINT_STATUS, SEVERITY, SAFETY_IMPACT, REG_STATUS, WARRANTY_STATUS, REPAIR_RESULT, CUSTOMER_TYPES } from '@/lib/labels'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { Plus, Wrench, MessageSquare, ShieldAlert, Users, ShieldCheck, ClipboardList, ListTodo, Hammer, CalendarCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt, relTime } from '@/lib/jalali'

export default function ServiceView() {
  const { params } = useApp()
  const [tab, setTab] = React.useState((params.tab as string) || 'tickets')
  React.useEffect(() => { if (params.tab) setTab(params.tab as string) }, [params.tab])

  return (
    <div className="space-y-4">
      <PageHeader
        title="خدمات پس از فروش"
        desc="تیکت خدمات، شکایت (مجزا)، تعمیر با قطعات قابل ردیابی، گارانتی محاسبه‌شده و تاریخچه خودکار دستگاه"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="tickets" className="gap-1.5"><Wrench className="w-3.5 h-3.5" aria-hidden="true" /> تیکت‌های خدمات</TabsTrigger>
          <TabsTrigger value="complaints" className="gap-1.5"><ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" /> شکایات</TabsTrigger>
          <TabsTrigger value="repairs" className="gap-1.5"><Hammer className="w-3.5 h-3.5" aria-hidden="true" /> تعمیرات</TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5"><Users className="w-3.5 h-3.5" aria-hidden="true" /> مشتریان</TabsTrigger>
          <TabsTrigger value="warranty" className="gap-1.5"><CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" /> گارانتی</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets" className="mt-3"><TicketsTab /></TabsContent>
        <TabsContent value="complaints" className="mt-3"><ComplaintsTab /></TabsContent>
        <TabsContent value="repairs" className="mt-3"><RepairsTab /></TabsContent>
        <TabsContent value="customers" className="mt-3"><CustomersTab /></TabsContent>
        <TabsContent value="warranty" className="mt-3"><WarrantyTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ═══ تیکت‌ها ═══
interface TicketRow {
  id: string; code: string; problem: string; category: string | null; priority: string; status: string
  contactPhone: string | null; notes: string | null; receivedAt: string; resolvedAt: string | null; closedAt: string | null
  customer: { code: string; name: string; city: string | null }
  device: { id: string; serial: string; status: string; product: { code: string; name: string } } | null
  deviceSerialText: string | null
  assignedTechnician: { id: string; fullName: string } | null
  _count: { repairs: number; updates: number }
}

function TicketsTab() {
  const { can, navigate } = useApp()
  const [status, setStatus] = React.useState('all')
  const [q, setQ] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', status, q],
    queryFn: () => apiGet<{ tickets: TicketRow[] }>(`/api/tickets${status !== 'all' || q ? '?' + [status !== 'all' ? `status=${status}` : '', q ? `q=${encodeURIComponent(q)}` : ''].filter(Boolean).join('&') : ''}`),
  })

  const tickets = data?.tickets ?? []
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 stagger">
        <KpiCard label="تیکت‌های باز" value={tickets.filter((t) => t.status !== 'CLOSED').length} tone="warning" icon={<Wrench className="w-5 h-5" />} />
        <KpiCard label="فوری" value={tickets.filter((t) => t.priority === 'URGENT' && t.status !== 'CLOSED').length} tone="danger" icon={<ShieldAlert className="w-5 h-5" />} />
        <KpiCard label="در انتظار قطعه" value={tickets.filter((t) => t.status === 'WAITING_PART').length} tone="warning" />
        <KpiCard label="بسته‌شده" value={tickets.filter((t) => t.status === 'CLOSED').length} tone="success" />
      </div>

      <Section>
        <div className="flex flex-wrap gap-2 mb-3">
          <SearchBox value={q} onChange={setQ} placeholder="کد تیکت، مشکل، سریال یا مشتری…" className="w-64" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه وضعیت‌ها</SelectItem>
              {Object.entries(TICKET_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {can('service.create') && <Button className="mr-auto bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 ml-1" /> ثبت درخواست خدمات</Button>}
        </div>
        <DataTable
          columns={[
            { key: 'code', header: 'شماره', render: (t: TicketRow) => <span className="font-mono font-semibold text-teal-700 tnum">{t.code}</span> },
            { key: 'problem', header: 'شرح مشکل', render: (t: TicketRow) => (
              <div>
                <div className="text-[13px] max-w-72 truncate">{t.problem}</div>
                <div className="text-[11px] text-muted-foreground">{t.category ?? '—'}</div>
              </div>
            ) },
            { key: 'customer', header: 'مشتری', render: (t: TicketRow) => <span className="text-xs">{t.customer.name}</span> },
            { key: 'device', header: 'دستگاه', render: (t: TicketRow) => t.device ? (
              <button className="font-mono text-xs tnum text-teal-700 hover:underline" onClick={(e) => { e.stopPropagation(); navigate('device', { serial: t.device!.serial }) }}>{t.device.serial}</button>
            ) : <span className="text-[11px] text-muted-foreground">{t.deviceSerialText ?? '—'}</span> },
            { key: 'priority', header: 'اولویت', render: (t: TicketRow) => <StatusBadge map={PRIORITY} value={t.priority} /> },
            { key: 'status', header: 'وضعیت', render: (t: TicketRow) => <StatusBadge map={TICKET_STATUS} value={t.status} /> },
            { key: 'tech', header: 'تکنسین', hideOnMobile: true, render: (t: TicketRow) => <span className="text-xs">{t.assignedTechnician?.fullName ?? 'ارجاع نشده'}</span> },
            { key: 'received', header: 'دریافت', render: (t: TicketRow) => <RelDate date={t.receivedAt} /> },
          ]}
          rows={tickets}
          loading={isLoading}
          onRowClick={(t) => setDetailId(t.id)}
          empty="تیکتی یافت نشد"
        />
      </Section>

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} />
      {detailId && <TicketDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}

function TicketDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { can, navigate } = useApp()
  const [comment, setComment] = React.useState('')
  const [internal, setInternal] = React.useState(false)

  const { data } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => apiGet<{
      ticket: TicketRow & {
        notes: string | null; slaHours: number | null
        device: (TicketRow['device']) & { productRevision: { revision: string } } | null
        updates: { id: string; text: string; internal: boolean; createdAt: string; user: { fullName: string; role: string } }[]
        repairs: { id: string; code: string; result: string; action: string; performedAt: string; technician: { fullName: string }; parts: { component: { code: string; name: string } }[] }[]
        complaint: { id: string; code: string; status: string } | null
      }
      transitions: TransitionBtn[]
      technicians: { id: string; fullName: string; role: string }[]
    }>(`/api/tickets/${id}`),
  })
  const t = data?.ticket

  const transition = useMutation({
    mutationFn: (tr: TransitionBtn) => apiPost(`/api/tickets/${id}`, { action: 'transition', to: tr.to, text: comment || undefined }),
    onSuccess: () => { toast({ title: 'وضعیت تیکت تغییر کرد' }); qc.invalidateQueries({ queryKey: ['ticket', id] }); qc.invalidateQueries({ queryKey: ['tickets'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); setComment('') },
  })
  const assign = useMutation({
    mutationFn: (technicianId: string) => apiPost(`/api/tickets/${id}`, { action: 'assign', technicianId }),
    onSuccess: () => { toast({ title: 'ارجاع انجام شد' }); qc.invalidateQueries({ queryKey: ['ticket', id] }); qc.invalidateQueries({ queryKey: ['tickets'] }) },
  })
  const addComment = useMutation({
    mutationFn: () => apiPost(`/api/tickets/${id}`, { action: 'comment', text: comment, internal }),
    onSuccess: () => { setComment(''); qc.invalidateQueries({ queryKey: ['ticket', id] }) },
  })
  const close = useMutation({
    mutationFn: () => apiPost(`/api/tickets/${id}`, { action: 'close', resolutionNote: comment || undefined }),
    onSuccess: () => { toast({ title: 'تیکت بسته شد' }); qc.invalidateQueries({ queryKey: ['ticket', id] }); qc.invalidateQueries({ queryKey: ['tickets'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })

  if (!t) return null
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="tnum">{t.code}</span>
            <StatusBadge map={TICKET_STATUS} value={t.status} />
            <StatusBadge map={PRIORITY} value={t.priority} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* نمایشگر زنجیرهٔ وضعیت تیکت */}
          <div className="rounded-xl border border-slate-200/70 bg-gradient-to-l from-teal-50/60 to-transparent p-3.5 anim-fade-in">
            <WorkflowStepper
              compact
              steps={['NEW', 'REVIEWING', 'ASSIGNED', 'DIAGNOSING', 'WAITING_PART', 'REPAIRING', 'TESTING', 'RESOLVED', 'CLOSED'].map((k) => ({ key: k, label: TICKET_STATUS[k]?.label ?? k }))}
              activeIndex={['NEW', 'REVIEWING', 'ASSIGNED', 'DIAGNOSING', 'WAITING_PART', 'REPAIRING', 'TESTING', 'RESOLVED', 'CLOSED'].indexOf(t.status)}
            />
          </div>

          <Section title="اطلاعات تیکت" icon={<ClipboardList className="w-4 h-4" />}>
            <InfoGrid cols={3}>
              <Field label="مشتری" value={t.customer.name} />
              <Field label="تلفن تماس" value={<span className="tnum">{t.contactPhone ?? t.customer.code}</span>} />
              <Field label="دریافت" value={<DateCell date={t.receivedAt} withTime />} />
              <Field label="دستگاه" value={t.device ? (
                <button className="text-teal-700 hover:underline font-mono tnum" onClick={() => { onClose(); navigate('device', { serial: t.device!.serial }) }}>{t.device.serial} — {t.device.product.name}</button>
              ) : (t.deviceSerialText ?? '—')} />
              <Field label="دسته‌بندی" value={t.category ?? '—'} />
              <Field label="تکنسین" value={t.assignedTechnician?.fullName ?? 'ارجاع نشده'} />
              <Field label="شرح مشکل" value={<span className="leading-relaxed">{t.problem}</span>} full />
              {t.notes && <Field label="یادداشت" value={t.notes} full />}
            </InfoGrid>
          </Section>

          {t.complaint && (
            <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              این تیکت به شکایت <span className="font-mono tnum">{t.complaint.code}</span> متصل است.
            </div>
          )}

          <Section title="گردش‌کار" desc="گذار‌های مجاز بر اساس نقش شما — تکنسین فقط تیکت ارجاعی خودش را به‌روز می‌کند" icon={<ListTodo className="w-4 h-4" />}>
            <WorkflowActions transitions={data?.transitions ?? []} onTransition={(tr) => transition.mutate(tr)} loading={transition.isPending} />
            {can('service.assign') && (
              <div className="flex flex-wrap gap-2 items-end mt-3 pt-3 border-t">
                <div className="space-y-1.5 flex-1 min-w-52">
                  <Label>ارجاع به تکنسین</Label>
                  <Select onValueChange={(v) => assign.mutate(v)} value={t.assignedTechnician?.id ?? ''}>
                    <SelectTrigger><SelectValue placeholder="انتخاب تکنسین…" /></SelectTrigger>
                    <SelectContent>
                      {(data?.technicians ?? []).map((tech) => <SelectItem key={tech.id} value={tech.id}>{tech.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </Section>

          {(t.repairs?.length ?? 0) > 0 && (
            <Section title="تعمیرات این تیکت" icon={<Hammer className="w-4 h-4" />}>
              <div className="space-y-2">
                {t.repairs.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 card-lift">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs tnum">{r.code}</span>
                      <StatusBadge map={REPAIR_RESULT} value={r.result} />
                      <span className="text-[11px] text-muted-foreground mr-auto">{r.technician.fullName} · <DateCell date={r.performedAt} /></span>
                    </div>
                    <div className="text-[13px] mt-1">{r.action}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{r.parts.map((p) => `${p.component.name} ×1`).join('، ') || 'بدون تعویض قطعه'}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="گفتگو و رویداد‌ها" icon={<MessageSquare className="w-4 h-4" />}>
            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {t.updates.map((u) => (
                <div key={u.id} className={cn('rounded-lg border p-2.5', u.internal && 'border-dashed bg-amber-50/40')}>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground text-xs">{u.user.fullName}</span>
                    <span className="text-[10px]">{u.user.role === 'SERVICE_MGR' ? 'مدیر خدمات' : u.user.role === 'TECHNICIAN' ? 'تکنسین' : u.user.role === 'SALES' ? 'فروش' : u.user.role}</span>
                    {u.internal && <span className="text-[10px] text-amber-700 border border-amber-200 rounded px-1">داخلی</span>}
                    <span className="mr-auto">{relTime(u.createdAt)}</span>
                  </div>
                  <div className="text-sm mt-1 leading-relaxed">{u.text}</div>
                </div>
              ))}
            </div>
            {(can('service.update') || can('service.assign')) && (
              <div className="flex gap-2 mt-3 pt-3 border-t">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="یادداشت / شرح اقدام…" rows={2} className="flex-1" />
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" onClick={() => addComment.mutate()} disabled={!comment || addComment.isPending}><MessageSquare className="w-3.5 h-3.5 ml-1" /> ثبت یادداشت</Button>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-teal-700" /> داخلی
                  </label>
                  {can('service.close') && t.status !== 'CLOSED' && (
                    <Button size="sm" variant="destructive" onClick={() => close.mutate()} disabled={close.isPending}>بستن تیکت</Button>
                  )}
                </div>
              </div>
            )}
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data: custData } = useQuery({ queryKey: ['customers'], queryFn: () => apiGet<{ customers: { id: string; code: string; name: string }[] }>('/api/customers'), enabled: open })
  const { data: devData } = useQuery({ queryKey: ['qc-devices'], queryFn: () => apiGet<{ devices: { id: string; serial: string; product: { name: string } }[] }>('/api/devices'), enabled: open })

  const [form, setForm] = React.useState({ customerId: '', deviceId: '', deviceSerialText: '', contactPhone: '', problem: '', category: '', priority: 'NORMAL' })
  const [error, setError] = React.useState('')
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/tickets', {
      customerId: form.customerId, deviceId: form.deviceId || undefined, deviceSerialText: form.deviceSerialText || undefined,
      contactPhone: form.contactPhone || undefined, problem: form.problem, category: form.category || undefined, priority: form.priority,
    }),
    onSuccess: () => {
      toast({ title: 'تیکت ثبت شد', description: 'مدیر خدمات پس از فروش مطلع شد.' })
      qc.invalidateQueries({ queryKey: ['tickets'] })
      onOpenChange(false); setError('')
      setForm({ customerId: '', deviceId: '', deviceSerialText: '', contactPhone: '', problem: '', category: '', priority: 'NORMAL' })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>ثبت درخواست خدمات</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label>مشتری *</Label>
            <Select value={form.customerId} onValueChange={(v) => set('customerId', v)}>
              <SelectTrigger><SelectValue placeholder="انتخاب مشتری…" /></SelectTrigger>
              <SelectContent>{(custData?.customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>دستگاه (اگر در سیستم است)</Label>
            <Select value={form.deviceId} onValueChange={(v) => set('deviceId', v)}>
              <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(devData?.devices ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.serial}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>سریال خارج از رجیستری</Label>
            <Input value={form.deviceSerialText} onChange={(e) => set('deviceSerialText', e.target.value)} placeholder="در صورت عدم ثبت دستگاه" />
          </div>
          <div className="space-y-1.5"><Label>تلفن تماس</Label><Input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} dir="ltr" className="text-left" /></div>
          <div className="space-y-1.5">
            <Label>اولویت</Label>
            <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2"><Label>شرح مشکل *</Label><Textarea value={form.problem} onChange={(e) => set('problem', e.target.value)} rows={3} /></div>
          <div className="space-y-1.5 col-span-2"><Label>دسته‌بندی</Label><Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="خطای الکترونیکی / قطعه / کالیبراسیون…" /></div>
          {error && <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.customerId || form.problem.length < 5}>{mutation.isPending ? '…' : 'ثبت تیکت'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══ شکایات ═══
interface ComplaintRow {
  id: string; code: string; description: string; severity: string; safetyImpact: string
  status: string; receivedAt: string; rootCause: string | null; correctiveAction: string | null
  preventiveAction: string | null; resolution: string | null; rejectionReason: string | null
  regulatoryReviewStatus: string | null; regulatoryNote: string | null
  customer: { code: string; name: string }
  device: { id: string; serial: string } | null
  approvedBy: { fullName: string } | null
  regulatoryReviewer: { fullName: string } | null
  ticket: { code: string; status: string } | null
}

function ComplaintsTab() {
  const { can, navigate } = useApp()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ['complaints'], queryFn: () => apiGet<{ complaints: ComplaintRow[] }>('/api/complaints') })

  const complaints = data?.complaints ?? []
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 stagger">
        <KpiCard label="شکایات باز" value={complaints.filter((c) => !['CLOSED', 'REJECTED'].includes(c.status)).length} tone="danger" icon={<ShieldAlert className="w-5 h-5" />} />
        <KpiCard label="اثر بر ایمنی" value={complaints.filter((c) => c.safetyImpact !== 'NO').length} tone="danger" icon={<ShieldAlert className="w-5 h-5" />} />
        <KpiCard label="در بررسی رگولاتوری" value={complaints.filter((c) => ['PENDING', 'REVIEWING'].includes(c.regulatoryReviewStatus ?? '')).length} tone="warning" />
        <KpiCard label="بسته‌شده" value={complaints.filter((c) => c.status === 'CLOSED').length} tone="success" />
      </div>

      <Section>
        <div className="flex justify-end mb-3">
          {can('service.complaint.create') && <Button className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 ml-1" /> ثبت شکایت</Button>}
        </div>
        <DataTable
          columns={[
            { key: 'code', header: 'شماره', render: (c: ComplaintRow) => <span className="font-mono font-semibold text-teal-700 tnum">{c.code}</span> },
            { key: 'desc', header: 'شرح', render: (c: ComplaintRow) => <div className="text-[13px] max-w-80 truncate">{c.description}</div> },
            { key: 'customer', header: 'مشتری', render: (c: ComplaintRow) => <span className="text-xs">{c.customer.name}</span> },
            { key: 'severity', header: 'شدت', render: (c: ComplaintRow) => <StatusBadge map={SEVERITY} value={c.severity} /> },
            { key: 'safety', header: 'ایمنی', render: (c: ComplaintRow) => <StatusBadge map={SAFETY_IMPACT} value={c.safetyImpact} /> },
            { key: 'status', header: 'وضعیت', render: (c: ComplaintRow) => <StatusBadge map={COMPLAINT_STATUS} value={c.status} /> },
            { key: 'reg', header: 'بررسی رگولاتوری', render: (c: ComplaintRow) => c.regulatoryReviewStatus ? <StatusBadge map={REG_STATUS} value={c.regulatoryReviewStatus} /> : <span className="text-xs text-muted-foreground">—</span> },
            { key: 'received', header: 'دریافت', render: (c: ComplaintRow) => <RelDate date={c.receivedAt} /> },
          ]}
          rows={complaints}
          loading={isLoading}
          onRowClick={(c) => setDetailId(c.id)}
          empty="شکایتی ثبت نشده است"
        />
      </Section>

      <CreateComplaintDialog open={createOpen} onOpenChange={setCreateOpen} />
      {detailId && <ComplaintDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}

function ComplaintDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { can, navigate } = useApp()
  const { data } = useQuery({
    queryKey: ['complaint', id],
    queryFn: () => apiGet<{ complaint: ComplaintRow; transitions: TransitionBtn[]; canRegulatory: boolean }>(`/api/complaints/${id}`),
  })
  const c = data?.complaint
  const [form, setForm] = React.useState({ rootCause: '', correctiveAction: '', preventiveAction: '', resolution: '' })
  const [regNote, setRegNote] = React.useState('')

  React.useEffect(() => {
    if (c) setForm({ rootCause: c.rootCause ?? '', correctiveAction: c.correctiveAction ?? '', preventiveAction: c.preventiveAction ?? '', resolution: c.resolution ?? '' })
  }, [c])

  const update = useMutation({
    mutationFn: () => apiPost(`/api/complaints/${id}`, { action: 'update', ...form }),
    onSuccess: () => { toast({ title: 'بررسی ذخیره شد' }); qc.invalidateQueries({ queryKey: ['complaint', id] }); qc.invalidateQueries({ queryKey: ['complaints'] }) },
  })
  const transition = useMutation({
    mutationFn: (t: TransitionBtn) => apiPost(`/api/complaints/${id}`, { action: 'transition', to: t.to, rejectionReason: form.resolution }),
    onSuccess: () => { toast({ title: 'وضعیت شکایت تغییر کرد' }); qc.invalidateQueries({ queryKey: ['complaint', id] }); qc.invalidateQueries({ queryKey: ['complaints'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })
  const regulatory = useMutation({
    mutationFn: (decision: string) => apiPost(`/api/complaints/${id}`, { action: 'regulatory', decision, note: regNote || undefined }),
    onSuccess: () => { toast({ title: 'تصمیم رگولاتوری ثبت شد', description: 'این تصمیم توسط فرد واجد صلاحیت گرفته و در Audit ثبت شد.' }); qc.invalidateQueries({ queryKey: ['complaint', id] }); qc.invalidateQueries({ queryKey: ['complaints'] }) },
  })

  if (!c) return null
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="tnum">{c.code}</span>
            <StatusBadge map={COMPLAINT_STATUS} value={c.status} />
            <StatusBadge map={SEVERITY} value={c.severity} />
            <StatusBadge map={SAFETY_IMPACT} value={c.safetyImpact} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* نمایشگر زنجیرهٔ وضعیت شکایت */}
          <div className={cn('rounded-xl border p-3.5 anim-fade-in', c.status === 'REJECTED' ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200/70 bg-gradient-to-l from-amber-50/50 to-teal-50/30')}>
            <WorkflowStepper
              compact
              steps={['OPEN', 'INVESTIGATING', 'CAPA', 'PENDING_APPROVAL', 'CLOSED'].map((k) => ({ key: k, label: COMPLAINT_STATUS[k]?.label ?? k }))}
              activeIndex={['OPEN', 'INVESTIGATING', 'CAPA', 'PENDING_APPROVAL', 'CLOSED'].indexOf(c.status)}
              alert={c.status === 'REJECTED' ? { label: 'این شکایت بررسی و رد شده است', tone: 'muted' } : null}
            />
          </div>

          <div className="text-sm leading-relaxed bg-muted/50 rounded-lg p-3">{c.description}</div>
          <InfoGrid cols={3}>
            <Field label="مشتری" value={c.customer.name} />
            <Field label="دستگاه" value={c.device ? <button className="text-teal-700 hover:underline font-mono tnum" onClick={() => { onClose(); navigate('device', { serial: c.device!.serial }) }}>{c.device.serial}</button> : '—'} />
            <Field label="دریافت" value={<DateCell date={c.receivedAt} withTime />} />
            <Field label="تیکت متصل" value={c.ticket ? <span className="tnum">{c.ticket.code}</span> : '—'} />
            <Field label="تأییدکننده نهایی" value={c.approvedBy?.fullName ?? '—'} />
            <Field label="بررسی‌کننده رگولاتوری" value={c.regulatoryReviewer?.fullName ?? '—'} />
          </InfoGrid>

          {c.regulatoryReviewStatus && (
            <div className={cn('rounded-xl border p-3.5 space-y-2', ['PENDING', 'REVIEWING'].includes(c.regulatoryReviewStatus) ? 'border-amber-200 bg-amber-50/60' : c.regulatoryReviewStatus === 'REPORTABLE' ? 'border-rose-200 bg-rose-50/60' : 'border-emerald-200 bg-emerald-50/50')}>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                <StatusBadge map={REG_STATUS} value={c.regulatoryReviewStatus} />
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                سیستم درباره Reportable بودن تصمیم نمی‌گیرد؛ این موضوع باید توسط فرد واجد صلاحیت (QC/مدیر) بررسی و ثبت شود.
              </div>
              {c.regulatoryNote && <div className="text-xs">یادداشت: {c.regulatoryNote}</div>}
              {data?.canRegulatory && ['PENDING', 'REVIEWING'].includes(c.regulatoryReviewStatus) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Input value={regNote} onChange={(e) => setRegNote(e.target.value)} placeholder="یادداشت بررسی…" className="flex-1 min-w-40" />
                  <Button size="sm" variant="outline" onClick={() => regulatory.mutate('REVIEWING')}>شروع بررسی</Button>
                  <Button size="sm" variant="destructive" onClick={() => regulatory.mutate('REPORTABLE')}>قابل گزارش (Reportable)</Button>
                  <Button size="sm" onClick={() => regulatory.mutate('NOT_REPORTABLE')}>غیرقابل گزارش</Button>
                </div>
              )}
            </div>
          )}

          {can('service.complaint.manage') && !['CLOSED', 'REJECTED'].includes(c.status) && (
            <Section title="بررسی، علت ریشه‌ای و CAPA" icon={<ClipboardList className="w-4 h-4" />}>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>علت ریشه‌ای (Root Cause)</Label><Textarea value={form.rootCause} onChange={(e) => setForm((f) => ({ ...f, rootCause: e.target.value }))} rows={2} /></div>
                <div className="space-y-1.5"><Label>اقدام اصلاحی (Corrective)</Label><Textarea value={form.correctiveAction} onChange={(e) => setForm((f) => ({ ...f, correctiveAction: e.target.value }))} rows={2} /></div>
                <div className="space-y-1.5"><Label>اقدام پیشگیرانه (Preventive)</Label><Textarea value={form.preventiveAction} onChange={(e) => setForm((f) => ({ ...f, preventiveAction: e.target.value }))} rows={2} /></div>
                <div className="space-y-1.5"><Label>نتیجه بررسی (Resolution)</Label><Textarea value={form.resolution} onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))} rows={2} /></div>
                <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending}>ذخیره بررسی</Button>
              </div>
            </Section>
          )}

          <Section title="گردش‌کار شکایت" icon={<ListTodo className="w-4 h-4" />}>
            <WorkflowActions transitions={data?.transitions ?? []} onTransition={(t) => transition.mutate(t)} loading={transition.isPending} />
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateComplaintDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data: custData } = useQuery({ queryKey: ['customers'], queryFn: () => apiGet<{ customers: { id: string; name: string }[] }>('/api/customers'), enabled: open })
  const { data: devData } = useQuery({ queryKey: ['qc-devices'], queryFn: () => apiGet<{ devices: { id: string; serial: string }[] }>('/api/devices'), enabled: open })

  const [form, setForm] = React.useState({ customerId: '', deviceId: 'none', description: '', severity: 'MEDIUM', safetyImpact: 'NO' })
  const [error, setError] = React.useState('')
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/complaints', { ...form, deviceId: form.deviceId === 'none' ? undefined : form.deviceId }),
    onSuccess: () => {
      toast({ title: 'شکایت ثبت شد', description: form.safetyImpact !== 'NO' || ['HIGH', 'CRITICAL'].includes(form.severity) ? 'نیازمند بررسی رگولاتوری توسط فرد واجد صلاحیت است.' : undefined })
      qc.invalidateQueries({ queryKey: ['complaints'] })
      onOpenChange(false); setError('')
      setForm({ customerId: '', deviceId: 'none', description: '', severity: 'MEDIUM', safetyImpact: 'NO' })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>ثبت شکایت مشتری</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label>مشتری *</Label>
            <Select value={form.customerId} onValueChange={(v) => set('customerId', v)}>
              <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
              <SelectContent>{(custData?.customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>دستگاه (در صورت وجود)</Label>
            <Select value={form.deviceId} onValueChange={(v) => set('deviceId', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(devData?.devices ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.serial}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2"><Label>شرح شکایت *</Label><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} /></div>
          <div className="space-y-1.5">
            <Label>شدت *</Label>
            <Select value={form.severity} onValueChange={(v) => set('severity', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(SEVERITY).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>اثر احتمالی بر ایمنی *</Label>
            <Select value={form.safetyImpact} onValueChange={(v) => set('safetyImpact', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(SAFETY_IMPACT).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {(form.safetyImpact !== 'NO' || ['HIGH', 'CRITICAL'].includes(form.severity)) && (
            <div className="col-span-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
              با این انتخاب، شکایت وارد صف «بررسی رگولاتوری» می‌شود. سامانه درباره گزارش‌دهی تصمیم نمی‌گیرد؛ این بررسی بر عهدهٔ فرد واجد صلاحیت است.
            </div>
          )}
          {error && <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.customerId || form.description.length < 5}>{mutation.isPending ? '…' : 'ثبت شکایت'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══ تعمیرات ═══
function RepairsTab() {
  const { can } = useApp()
  const [open, setOpen] = React.useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['repairs'],
    queryFn: () => apiGet<{ repairs: { id: string; code: string; diagnosis: string | null; failureMode: string | null; action: string; result: string; performedAt: string; notes: string | null; device: { serial: string; product: { name: string } }; ticket: { code: string } | null; technician: { fullName: string }; parts: { component: { code: string; name: string } }[] }[] }>('/api/repairs'),
  })
  const repairs = data?.repairs ?? []

  return (
    <>
      <StatChips className="mb-4" items={[
        { label: 'کل تعمیر‌های ثبت‌شده', value: faInt(repairs.length), tone: 'info', icon: <Hammer className="w-3.5 h-3.5" /> },
        { label: 'تعمیر کامل', value: faInt(repairs.filter((r) => r.result === 'FIXED').length), tone: 'success' },
        { label: 'قطعهٔ تعویض‌شده', value: faInt(repairs.reduce((s, r) => s + r.parts.length, 0)), tone: 'neutral' },
        { label: 'تعمیر ناموفق', value: faInt(repairs.filter((r) => r.result === 'NOT_FIXED').length), tone: 'danger' },
      ]} />

      <Section icon={<Hammer className="w-4 h-4" />}>
        <div className="flex justify-end mb-3">
          {can('service.update') && <Button className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25" onClick={() => setOpen(true)}><Plus className="w-4 h-4 ml-1" /> ثبت تعمیر</Button>}
        </div>
        <DataTable
          columns={[
            { key: 'code', header: 'کد', render: (r: never) => <span className="font-mono font-semibold text-teal-700 tnum">{(r as { code: string }).code}</span> },
            { key: 'device', header: 'دستگاه', render: (r: never) => <span className="font-mono text-xs tnum">{(r as { device: { serial: string } }).device.serial}</span> },
            { key: 'ticket', header: 'تیکت', render: (r: never) => <span className="text-xs tnum">{(r as { ticket: { code: string } | null }).ticket?.code ?? '—'}</span> },
            { key: 'diagnosis', header: 'تشخیص / حالت خرابی', render: (r: never) => <span className="text-[13px] max-w-72 truncate">{(r as { diagnosis: string | null; failureMode: string | null }).diagnosis ?? '—'}{(r as { failureMode: string | null }).failureMode ? ` (${(r as { failureMode: string | null }).failureMode})` : ''}</span> },
            { key: 'action', header: 'اقدام', render: (r: never) => <span className="text-[13px] max-w-72 truncate">{(r as { action: string }).action}</span> },
            { key: 'parts', header: 'قطعات', render: (r: never) => <span className="text-[11px] text-muted-foreground">{(r as { parts: unknown[] }).parts.length ? `${faInt((r as { parts: unknown[] }).parts.length)} قلم` : '—'}</span> },
            { key: 'result', header: 'نتیجه', render: (r: never) => <StatusBadge map={REPAIR_RESULT} value={(r as { result: string }).result} /> },
            { key: 'tech', header: 'تکنسین', hideOnMobile: true, render: (r: never) => <span className="text-xs">{(r as { technician: { fullName: string } }).technician.fullName}</span> },
            { key: 'date', header: 'تاریخ', render: (r: never) => <DateCell date={(r as { performedAt: string }).performedAt} /> },
          ]}
          rows={(data?.repairs ?? []) as never[]}
          loading={isLoading}
          empty="تعمیری ثبت نشده است"
        />
      </Section>
      <CreateRepairDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function CreateRepairDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['repairs-form'],
    queryFn: () => apiGet<{
      devices: { id: string; serial: string; product: { name: string } }[]
      tickets: { id: string; code: string; deviceId: string | null }[]
      technicians: { id: string; fullName: string }[]
      components: { id: string; code: string; name: string; stockQty: number; reservedQty: number; unit: string }[]
    }>('/api/repairs'),
    enabled: open,
  })

  const [form, setForm] = React.useState({ deviceId: '', ticketId: 'none', technicianId: '', diagnosis: '', failureMode: '', rootCause: '', action: '', result: 'FIXED', notes: '', qcRequired: false })
  const [parts, setParts] = React.useState<{ componentId: string; qty: number; oldPart: string; newPart: string }[]>([])
  const [error, setError] = React.useState('')
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/repairs', { ...form, ticketId: form.ticketId === 'none' ? undefined : form.ticketId, parts: parts.map((p) => ({ ...p, qty: Number(p.qty) || 1 })) }),
    onSuccess: () => {
      toast({ title: 'تعمیر ثبت شد', description: 'قطعات از موجودی کسر و در تاریخچه دستگاه ثبت شد.' })
      qc.invalidateQueries({ queryKey: ['repairs'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
      onOpenChange(false); setError('')
      setParts([])
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  const tickets = (data?.tickets ?? []).filter((t) => !form.deviceId || t.deviceId === form.deviceId)
  const comps = data?.components ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>ثبت تعمیر و قطعات مصرفی</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>دستگاه *</Label>
            <Select value={form.deviceId} onValueChange={(v) => { set('deviceId', v); set('ticketId', 'none') }}>
              <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
              <SelectContent>{(data?.devices ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.serial} — {d.product.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>تیکت مرتبط</Label>
            <Select value={form.ticketId} onValueChange={(v) => set('ticketId', v)} disabled={!form.deviceId}>
              <SelectTrigger><SelectValue placeholder="اختیاری" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {tickets.map((t) => <SelectItem key={t.id} value={t.id}>{t.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>تکنسین *</Label>
            <Select value={form.technicianId} onValueChange={(v) => set('technicianId', v)}>
              <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
              <SelectContent>{(data?.technicians ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>نتیجه *</Label>
            <Select value={form.result} onValueChange={(v) => set('result', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(REPAIR_RESULT).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2"><Label>تشخیص</Label><Input value={form.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>حالت خرابی (Failure Mode)</Label><Input value={form.failureMode} onChange={(e) => set('failureMode', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>علت ریشه‌ای</Label><Input value={form.rootCause} onChange={(e) => set('rootCause', e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>اقدام انجام‌شده *</Label><Textarea value={form.action} onChange={(e) => set('action', e.target.value)} rows={2} /></div>

          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <Label className="mb-0">قطعات تعویض‌شده (با ردیابی لات)</Label>
              <Button size="sm" variant="outline" onClick={() => setParts((p) => [...p, { componentId: comps[0]?.id ?? '', qty: 1, oldPart: '', newPart: '' }])}><Plus className="w-3.5 h-3.5 ml-1" /> قطعه</Button>
            </div>
            <div className="space-y-2">
              {parts.map((p, i) => {
                const comp = comps.find((c) => c.id === p.componentId)
                const available = comp ? comp.stockQty - comp.reservedQty : 0
                return (
                  <div key={i} className="flex flex-wrap gap-2 items-center rounded-lg border p-2">
                    <Select value={p.componentId} onValueChange={(v) => setParts((prev) => prev.map((x, j) => j === i ? { ...x, componentId: v } : x))}>
                      <SelectTrigger className="flex-1 min-w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>{comps.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min={0.1} value={p.qty} onChange={(e) => setParts((prev) => prev.map((x, j) => j === i ? { ...x, qty: parseFloat(e.target.value) || 0 } : x))} dir="ltr" className="w-20 text-left" />
                    <Input value={p.oldPart} onChange={(e) => setParts((prev) => prev.map((x, j) => j === i ? { ...x, oldPart: e.target.value } : x))} placeholder="قطعه قبلی" className="w-32" />
                    {comp && <span className={cn('text-[11px] tnum', available < p.qty ? 'text-rose-700 font-medium' : 'text-muted-foreground')}>موجود: {faInt(available)}</span>}
                    <Button variant="ghost" size="sm" className="text-rose-700" onClick={() => setParts((prev) => prev.filter((_, j) => j !== i))}>×</Button>
                  </div>
                )
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={form.qcRequired} onChange={(e) => set('qcRequired', e.target.checked)} className="accent-teal-700" />
            نیازمند تأیید QC پس از تعمیر
          </label>
          {error && <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.deviceId || !form.technicianId || form.action.length < 3}>{mutation.isPending ? '…' : 'ثبت تعمیر'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══ مشتریان ═══
function CustomersTab() {
  const { can, navigate } = useApp()
  const [createOpen, setCreateOpen] = React.useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiGet<{ customers: { id: string; code: string; name: string; type: string; contactPerson: string | null; phone: string | null; city: string | null; email: string | null; _count: { devices: number; tickets: number; complaints: number } }[] }>('/api/customers'),
  })

  return (
    <>
      <StatChips className="mb-4" items={[
        { label: 'مشتری ثبت‌شده', value: faInt((data?.customers ?? []).length), tone: 'info', icon: <Users className="w-3.5 h-3.5" /> },
        { label: 'دستگاه در اختیار مشتریان', value: faInt((data?.customers ?? []).reduce((s, c) => s + c._count.devices, 0)), tone: 'neutral' },
        { label: 'تیکت خدمات', value: faInt((data?.customers ?? []).reduce((s, c) => s + c._count.tickets, 0)), tone: 'warning' },
      ]} />

      <Section icon={<Users className="w-4 h-4" />}>
        <div className="flex justify-end mb-3">
          {can('customer.create') && <Button className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 ml-1" /> مشتری جدید</Button>}
        </div>
        <DataTable
          columns={[
            { key: 'code', header: 'کد', render: (c: { id: string; code: string }) => <span className="font-mono font-semibold text-teal-700 tnum">{c.code}</span> },
            { key: 'name', header: 'نام مشتری', render: (c: { name: string; type: string }) => <div><div className="text-[13px] font-medium">{c.name}</div><div className="text-[11px] text-muted-foreground">{CUSTOMER_TYPES[c.type] ?? c.type}</div></div> },
            { key: 'contact', header: 'رابط / تلفن', render: (c: { contactPerson: string | null; phone: string | null }) => <span className="text-xs tnum">{c.contactPerson ?? '—'} · {c.phone ?? '—'}</span> },
            { key: 'city', header: 'شهر', hideOnMobile: true, render: (c: { city: string | null }) => <span className="text-xs">{c.city ?? '—'}</span> },
            { key: 'devices', header: 'دستگاه‌ها', render: (c: { _count: { devices: number } }) => <span className="tnum text-xs">{faInt(c._count.devices)}</span> },
            { key: 'tickets', header: 'تیکت‌ها', render: (c: { _count: { tickets: number } }) => <span className="tnum text-xs">{faInt(c._count.tickets)}</span> },
            { key: 'complaints', header: 'شکایات', render: (c: { _count: { complaints: number } }) => <span className="tnum text-xs">{faInt(c._count.complaints)}</span> },
          ]}
          rows={(data?.customers ?? []) as never[]}
          loading={isLoading}
          empty="مشتری ثبت نشده است"
        />
      </Section>
      <CreateCustomerDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

function CreateCustomerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({ code: '', name: '', type: 'HOSPITAL', contactPerson: '', phone: '', email: '', city: '', address: '' })
  const [error, setError] = React.useState('')
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/customers', { ...form, email: form.email || undefined }),
    onSuccess: () => { toast({ title: 'مشتری ثبت شد' }); qc.invalidateQueries({ queryKey: ['customers'] }); onOpenChange(false); setError('') },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-teal-700" /> مشتری جدید</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>کد *</Label><Input value={form.code} onChange={(e) => set('code', e.target.value)} dir="ltr" className="text-left" /></div>
          <div className="space-y-1.5">
            <Label>نوع</Label>
            <Select value={form.type} onValueChange={(v) => set('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CUSTOMER_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2"><Label>نام مشتری *</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>شخص رابط</Label><Input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>تلفن</Label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} dir="ltr" className="text-left" /></div>
          <div className="space-y-1.5"><Label>ایمیل</Label><Input value={form.email} onChange={(e) => set('email', e.target.value)} dir="ltr" className="text-left" type="email" /></div>
          <div className="space-y-1.5"><Label>شهر</Label><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>آدرس</Label><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
          {error && <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.code || !form.name}>{mutation.isPending ? '…' : 'ثبت مشتری'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══ گارانتی ═══
function WarrantyTab() {
  const { can, navigate } = useApp()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['warranty'],
    queryFn: () => apiGet<{ devices: { id: string; serial: string; deliveredAt: string | null; warranty: { status: string; reason: string; source: string; endDate: string | null }; product: { code: string; name: string; warrantyMonths: number }; productRevision: { revision: string }; customer: { code: string; name: string } | null; _count: { repairs: number; tickets: number; complaints: number } }[] }>('/api/warranty'),
  })
  const [overrideFor, setOverrideFor] = React.useState<{ id: string; serial: string } | null>(null)
  const [status, setStatus] = React.useState('IN_WARRANTY')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState('')

  const override = useMutation({
    mutationFn: () => apiPost('/api/warranty', { action: 'override', deviceId: overrideFor!.id, status, reason }),
    onSuccess: () => { toast({ title: 'وضعیت گارانتی تغییر کرد', description: 'این تغییر کنترل‌شده در Audit Trail ثبت شد.' }); qc.invalidateQueries({ queryKey: ['warranty'] }); setOverrideFor(null); setReason(''); setError('') },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  const devices = data?.devices ?? []
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 stagger">
        <KpiCard label="دستگاه‌های تحویل‌شده" value={devices.length} tone="info" icon={<ShieldCheck className="w-5 h-5" />} />
        <KpiCard label="در گارانتی" value={devices.filter((d) => d.warranty.status === 'IN_WARRANTY').length} tone="success" icon={<CalendarCheck className="w-5 h-5" />} />
        <KpiCard label="گارانتی منقضی" value={devices.filter((d) => d.warranty.status === 'OUT_OF_WARRANTY').length} tone="danger" />
        <KpiCard label="نامشخص" value={devices.filter((d) => d.warranty.status === 'UNKNOWN').length} tone="warning" />
      </div>

      <Section title="وضعیت گارانتی (محاسبهٔ خودکار)" desc="محاسبه بر پایهٔ تاریخ تحویل و مدت گارانتی محصول؛ تغییر دستی فقط برای کاربران مجاز و با ثبت در Audit Trail انجام می‌شود" icon={<CalendarCheck className="w-4 h-4" />}>
        <DataTable
          columns={[
            { key: 'serial', header: 'دستگاه', render: (d: never) => <button className="font-mono text-xs tnum text-teal-700 hover:underline" onClick={() => navigate('device', { serial: (d as { serial: string }).serial })}>{(d as { serial: string }).serial}</button> },
            { key: 'product', header: 'محصول', render: (d: never) => <span className="text-xs">{(d as { product: { name: string } }).product.name} · {faInt((d as { product: { warrantyMonths: number } }).product.warrantyMonths)}ماه</span> },
            { key: 'customer', header: 'مشتری', render: (d: never) => <span className="text-xs">{(d as { customer: { name: string } | null }).customer?.name ?? '—'}</span> },
            { key: 'delivered', header: 'تحویل', render: (d: never) => <DateCell date={(d as { deliveredAt: string | null }).deliveredAt} /> },
            { key: 'warranty', header: 'وضعیت گارانتی', render: (d: never) => (
              <div>
                <StatusBadge map={WARRANTY_STATUS} value={(d as { warranty: { status: string } }).warranty.status} />
                {(d as { warranty: { source: string } }).warranty.source === 'override' && <div className="text-[10px] text-amber-700 mt-0.5">تغییر دستی ثبت‌شده</div>}
              </div>
            ) },
            { key: 'reason', header: 'جزئیات', hideOnMobile: true, render: (d: never) => <span className="text-[11px] text-muted-foreground">{(d as { warranty: { reason: string } }).warranty.reason}</span> },
            { key: 'history', header: 'سابقه', render: (d: never) => <span className="text-[11px] text-muted-foreground tnum">{faInt((d as { _count: { repairs: number } })._count.repairs)} تعمیر · {faInt((d as { _count: { tickets: number } })._count.tickets)} تیکت</span> },
            { key: 'actions', header: 'اقدام', render: (d: never) => can('service.warranty.override') ? (
              <Button size="sm" variant="outline" onClick={() => setOverrideFor(d as { id: string; serial: string })}>تغییر دستی</Button>
            ) : <span className="text-xs text-muted-foreground">—</span> },
          ]}
          rows={devices as never[]}
          loading={isLoading}
          empty="دستگاه تحویل‌شده‌ای وجود ندارد"
        />
      </Section>

      <Dialog open={!!overrideFor} onOpenChange={(v) => !v && setOverrideFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تغییر دستی گارانتی — {overrideFor?.serial}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>وضعیت جدید *</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_WARRANTY">در گارانتی</SelectItem>
                  <SelectItem value="OUT_OF_WARRANTY">خارج از گارانتی</SelectItem>
                  <SelectItem value="UNKNOWN">نامشخص</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>دلیل (الزامی — در Audit ثبت می‌شود) *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideFor(null)}>انصراف</Button>
            <Button onClick={() => override.mutate()} disabled={override.isPending || reason.length < 5}>{override.isPending ? '…' : 'ثبت تغییر'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
