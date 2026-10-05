'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './api'
import { useApp } from './store'
import { PageHeader, Section, DateCell, StatusBadge, KpiCard, Field, InfoGrid } from './ui-bits'
import { DEVICE_STATUS } from '@/lib/labels'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { PackageCheck, CheckCircle2, XCircle, Truck, ClipboardList, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'

interface QueueItem {
  id: string; serial: string; status: string
  product: { code: string; name: string }; productRevision: { revision: string }
  order: { code: string; status: string } | null
  firmwareVersion: string | null; producedAt: string | null
  checks: { key: string; label: string; pass: boolean; detail?: string }[]
}

interface ReleaseRow {
  id: string; releasedAt: string; notes: string | null
  device: { id: string; serial: string; status: string; product: { code: string; name: string }; deliveredAt: string | null; customer: { name: string } | null }
  user: { fullName: string; role: string }
}

export default function ReleasesView() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="آزادسازی محصول و تحویل"
        desc="آزادسازی فقط توسط QC و پس از احراز تمام شرایط سمت سرور: مراحل تکمیل، تست‌های اجباری پاس، بسته‌بندی، Firmware ثبت‌شده و تأیید QC"
      />
      <Tabs defaultValue="queue">
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="queue" className="gap-1.5"><PackageCheck className="w-3.5 h-3.5" aria-hidden="true" /> صف آزادسازی</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" aria-hidden="true" /> سابقهٔ آزادسازی و تحویل</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-3"><ReleaseQueue /></TabsContent>
        <TabsContent value="history" className="mt-3"><ReleaseHistory /></TabsContent>
      </Tabs>
    </div>
  )
}

function ReleaseQueue() {
  const { can, navigate } = useApp()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['releases'], queryFn: () => apiGet<{ queue: QueueItem[]; history: ReleaseRow[] }>('/api/releases') })
  const [confirmFor, setConfirmFor] = React.useState<QueueItem | null>(null)
  const [notes, setNotes] = React.useState('')

  const release = useMutation({
    mutationFn: () => apiPost('/api/releases', { action: 'release', deviceId: confirmFor!.id, notes: notes || undefined }),
    onSuccess: () => {
      toast({ title: 'محصول آزاد شد', description: 'رکورد آزادسازی با Snapshot شرایط در Audit Trail ثبت شد.' })
      qc.invalidateQueries({ queryKey: ['releases'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setConfirmFor(null); setNotes('')
    },
  })

  const queue = data?.queue ?? []
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 stagger">
        <KpiCard label="در صف آزادسازی" value={queue.length} tone="warning" icon={<PackageCheck className="w-5 h-5" />} />
        <KpiCard label="آماده (همه شرایط برقرار)" value={queue.filter((d) => d.checks.every((c) => c.pass)).length} tone="success" icon={<CheckCircle2 className="w-5 h-5" />} />
        <KpiCard label="دارای مانع" value={queue.filter((d) => d.checks.some((c) => !c.pass)).length} tone="danger" icon={<XCircle className="w-5 h-5" />} />
      </div>

      <Section title="دستگاه‌های در انتظار آزادسازی" desc="بررسی خودکار شرایط پیش‌آزادسازی (گارد‌های سمت سرور)" icon={<PackageCheck className="w-4 h-4" />}>
        <div className="space-y-3">
          {queue.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">دستگاهی در صف آزادسازی نیست</div>}
          {queue.map((d) => {
            const allPass = d.checks.every((c) => c.pass)
            return (
              <div key={d.id} className={cn('rounded-xl border p-4 space-y-3 card-lift anim-fade-right', allPass ? 'border-emerald-200 bg-gradient-to-l from-emerald-50/50 to-emerald-50/20' : 'border-amber-200 bg-gradient-to-l from-amber-50/50 to-amber-50/20')}>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="font-mono font-semibold text-teal-700 tnum hover:underline" onClick={() => navigate('device', { serial: d.serial })}>{d.serial}</button>
                  <span className="text-sm">{d.product.name} · نسخه {d.productRevision.revision}</span>
                  <span className="text-xs text-muted-foreground tnum">{d.order?.code} · <DateCell date={d.producedAt} /></span>
                  <span className="mr-auto text-[11px]">{d.firmwareVersion ? `FW ${d.firmwareVersion}` : 'FW ندارد'}</span>
                  {allPass ? <span className="text-xs text-emerald-700 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> همه شرایط برقرار</span> : <span className="text-xs text-rose-700 font-semibold inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" aria-hidden="true" /> دارای مانع</span>}
                  {can('qc.release') && (
                    <Button size="sm" className={cn(allPass && 'bg-gradient-to-l from-emerald-700 to-emerald-600 hover:from-emerald-800 hover:to-emerald-700 shadow-lg shadow-emerald-600/25')} disabled={!allPass || release.isPending} onClick={() => setConfirmFor(d)}>
                      {allPass ? 'آزادسازی' : 'غیرقابل آزادسازی'}
                    </Button>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {d.checks.map((c) => (
                    <div key={c.key} className={cn('flex items-center gap-1.5 text-[11px] rounded-md border px-2 py-1', c.pass ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800')} title={c.detail}>
                      {c.pass ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">{c.label}{c.detail ? ` — ${c.detail}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Dialog open={!!confirmFor} onOpenChange={(v) => !v && setConfirmFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>تأیید آزادسازی {confirmFor?.serial}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              تمام شرایط پیش‌آزادسازی سمت سرور احراز شده است. پس از آزادسازی، سوابق کنترل‌شده دستگاه برای کاربران عادی قفل می‌شود.
            </div>
            <div className="space-y-1.5"><Label>یادداشت آزادسازی</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختیاری" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFor(null)}>انصراف</Button>
            <Button onClick={() => release.mutate()} disabled={release.isPending}>{release.isPending ? '…' : 'آزادسازی نهایی'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {can('device.deliver') && <DeliverySection />}
    </>
  )
}

function DeliverySection() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['released-devices'], queryFn: () => apiGet<{ devices: { id: string; serial: string; product: { name: string } }[] }>('/api/devices?status=RELEASED') })
  const { data: custData } = useQuery({ queryKey: ['customers'], queryFn: () => apiGet<{ customers: { id: string; code: string; name: string }[] }>('/api/customers') })
  const [device, setDevice] = React.useState('')
  const [customer, setCustomer] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState('')

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/deliveries', { action: 'deliver', deviceId: device, customerId: customer, deliveryNote: note || undefined }),
    onSuccess: () => {
      toast({ title: 'تحویل ثبت شد', description: 'گارانتی از تاریخ تحویل آغاز شد و در پرونده دستگاه ثبت گردید.' })
      qc.invalidateQueries({ queryKey: ['released-devices'] })
      qc.invalidateQueries({ queryKey: ['releases'] })
      setDevice(''); setCustomer(''); setNote(''); setError('')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Section title="ثبت تحویل به مشتری" desc="تحویل فقط برای دستگاه آزاد‌شده — آغاز دورهٔ گارانتی" className="mt-4" icon={<Truck className="w-4 h-4" />}>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1.5 flex-1 min-w-52">
          <Label>دستگاه آزاد‌شده</Label>
          <Select value={device} onValueChange={setDevice}>
            <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
            <SelectContent>
              {(data?.devices ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{`${d.serial} (${d.product.name})`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 flex-1 min-w-52">
          <Label>مشتری</Label>
          <Select value={customer} onValueChange={setCustomer}>
            <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
            <SelectContent>
              {(custData?.customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 flex-1 min-w-40">
          <Label>شماره سند تحویل</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25" onClick={() => mutation.mutate()} disabled={mutation.isPending || !device || !customer}><Truck className="w-4 h-4 ml-1" /> ثبت تحویل</Button>
      </div>
      {error && <div className="mt-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
    </Section>
  )
}

function ReleaseHistory() {
  const { data } = useQuery({ queryKey: ['releases'], queryFn: () => apiGet<{ queue: QueueItem[]; history: ReleaseRow[] }>('/api/releases') })
  const { navigate } = useApp()
  return (
    <Section title="سابقهٔ آزادسازی" desc="هر آزادسازی با مجری، زمان و Snapshot شرایط ثبت می‌شود — سوابق قفل‌شده" icon={<History className="w-4 h-4" />}>
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/70 text-xs text-muted-foreground">
            <th className="text-right px-3 py-2">دستگاه</th><th className="text-right px-3 py-2">محصول</th>
            <th className="text-right px-3 py-2">آزادکننده</th><th className="text-right px-3 py-2">زمان</th>
            <th className="text-right px-3 py-2">وضعیت فعلی</th><th className="text-right px-3 py-2">یادداشت</th>
          </tr></thead>
          <tbody>
            {(data?.history ?? []).map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/50">
                <td className="px-3 py-2">
                  <button className="font-mono text-teal-700 tnum hover:underline" onClick={() => navigate('device', { serial: r.device.serial })}>{r.device.serial}</button>
                  {r.device.customer && <div className="text-[10px] text-muted-foreground">{r.device.customer.name}</div>}
                </td>
                <td className="px-3 py-2 text-xs">{r.device.product.name}</td>
                <td className="px-3 py-2 text-xs">{r.user.fullName}</td>
                <td className="px-3 py-2"><DateCell date={r.releasedAt} withTime /></td>
                <td className="px-3 py-2"><StatusBadge map={DEVICE_STATUS} value={r.device.status} /></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data?.history ?? []).length === 0 && <div className="text-sm text-muted-foreground text-center py-8">آزادسازی ثبت نشده است</div>}
      </div>
    </Section>
  )
}
