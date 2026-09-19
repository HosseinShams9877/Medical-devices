'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './api'
import { useApp } from './store'
import { PageHeader, Section, StatusBadge, DateCell, Field, InfoGrid, WorkflowActions, DataTable, RelDate, StepsBar, WorkflowStepper, StatChips, type TransitionBtn } from './ui-bits'
import { ORDER_STATUS, ORDER_ORIGIN, PRIORITY, DEVICE_STATUS, QC_STAGE, CRITICALITY, STEP_RESULT, NCR_STATUS } from '@/lib/labels'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { ArrowRight, CircleDot, Cpu, PackageCheck, TriangleAlert, Check, XCircle, ClipboardList, FlaskConical, ShieldAlert, ListChecks, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt, formatJalali } from '@/lib/jalali'

interface OrderDetailData {
  order: {
    id: string; code: string; status: string; priority: string; qty: number
    product: { id: string; code: string; name: string; hasFirmware: boolean }
    productRevision: { revision: string; notes: string | null }
    bom: { id: string; revision: number; status: string; effectiveDate: string; notes: string | null; items: { id: string; qty: number; criticality: string; component: { id: string; code: string; name: string; manufacturer: string | null; supplier: { name: string } | null; unit: string } }[] } | null
    owner: { id: string; fullName: string } | null
    createdBy: { fullName: string } | null
    originType: string; originRef: string | null; originTitle: string | null
    originIssuedBy: string | null; originDate: string | null
    customer: { id: string; code: string; name: string } | null
    productionLine: string | null; notes: string | null
    plannedStart: string | null; plannedEnd: string | null; actualStart: string | null; actualEnd: string | null
    materialOverrideById: string | null; materialOverrideNote: string | null; materialOverrideAt: string | null
    createdAt: string
    steps: { id: string; stepIndex: number; name: string; tools: string | null; acceptance: string | null; required: boolean; isPackaging: boolean; needsQc: boolean; status: string; operatorId: string | null; startedAt: string | null; finishedAt: string | null; notes: string | null; records: { id: string; operator: { fullName: string }; device: { serial: string } | null; result: string; startedAt: string; finishedAt: string; notes: string | null }[] }[]
    materials: { id: string; requiredQty: number; reservedQty: number; shortageQty: number; critical: boolean; note: string | null; component: { id: string; code: string; name: string; unit: string; stockQty: number; reservedQty: number } }[]
    devices: { id: string; serial: string; status: string; currentStepIndex: number; firmwareVersion: string | null; programVerified: boolean | null; _count: { tests: number; reworks: number } }[]
    tests: { id: string; templateCode: string; name: string; stage: string; passed: boolean; actualValue: string | null; deviceId: string | null; createdAt: string; verifiedById: string | null }[]
    ncrs: { id: string; code: string; title: string; status: string; severity: string }[]
  }
  transitions: TransitionBtn[]
  operators: { id: string; fullName: string; role: string }[]
}

export default function OrderDetail() {
  const { params, navigate, can } = useApp()
  const id = params.id
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => apiGet<OrderDetailData>(`/api/orders/${id}`),
    enabled: !!id,
  })

  const transition = useMutation({
    mutationFn: (t: TransitionBtn) => apiPost(`/api/orders/${id}`, { action: 'transition', to: t.to }),
    onSuccess: (r: { status?: string; serials?: string[]; shortage?: { componentCode: string; shortageQty: number; critical: boolean }[] }) => {
      const s = r as { status?: string; serials?: string[] }
      toast({ title: 'وضعیت به‌روزرسانی شد', description: s.serials?.length ? `${faInt(s.serials.length)} شمارهٔ سریال یکتا تولید شد.` : undefined })
      if (s.serials?.length) {
        toast({ title: 'شماره سریال‌ها ثبت شد', description: s.serials.slice(0, 8).join('، ') + (s.serials.length > 8 ? ' …' : '') })
      }
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  if (!id) return <div className="text-muted-foreground text-sm">شناسه سفارش مشخص نیست.</div>
  if (isLoading || !data) return <div className="text-muted-foreground text-sm py-10 text-center">در حال بارگذاری جزئیات سفارش…</div>
  const o = data.order

  // زنجیرهٔ اصلی وضعیت سفارش برای نمایشگر گرافیکی
  const FLOW: string[] = ['DRAFT', 'APPROVED', 'MATERIAL_CHECK', 'READY', 'IN_PRODUCTION', 'WAITING_QC', 'COMPLETED', 'IN_WAREHOUSE', 'SHIPPED', 'CLOSED']
  let flowIdx = FLOW.indexOf(o.status)
  let flowAlert: { label: string; tone?: 'danger' | 'muted' | 'warning' } | null = null
  if (o.status === 'REWORK') {
    flowIdx = FLOW.indexOf('WAITING_QC')
    flowAlert = { label: 'در حال اصلاح (Rework) — پس از تکمیل بازکاری، سفارش به کنترل کیفیت بازمی‌گردد', tone: 'danger' }
  } else if (o.status === 'CANCELLED') {
    flowIdx = -1
    flowAlert = { label: 'این سفارش لغو شده است', tone: 'muted' }
  }

  const doneSteps = o.steps.filter((s) => s.status === 'DONE').length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm anim-fade-in">
        <button className="text-teal-700 hover:underline flex items-center gap-1 transition-colors" onClick={() => navigate('orders')}><ArrowRight className="w-4 h-4" />بازگشت به سفارش‌ها</button>
      </div>

      <PageHeader
        title={`سفارش ${o.code}`}
        desc={`${o.product.name} — نسخه ${o.productRevision.revision} · BOM نسخه ${o.bom?.revision ?? '—'} · ${faInt(o.qty)} دستگاه`}
        actions={<div className="flex items-center gap-2"><StatusBadge map={ORDER_STATUS} value={o.status} /><StatusBadge map={ORDER_ORIGIN} value={o.originType} /><StatusBadge map={PRIORITY} value={o.priority} /></div>}
      />

      {/* نوار خلاصهٔ آماری سفارش */}
      <StatChips items={[
        { label: 'دستگاه این سفارش', value: faInt(o.devices.length), tone: 'info', icon: <Cpu className="w-3.5 h-3.5" /> },
        { label: 'مراحل تکمیل‌شده', value: `${faInt(doneSteps)}/${faInt(o.steps.length)}`, tone: doneSteps === o.steps.length && o.steps.length > 0 ? 'success' : 'neutral', icon: <ListChecks className="w-3.5 h-3.5" /> },
        { label: 'تست ثبت‌شده', value: faInt(o.tests.length), tone: o.tests.length ? 'info' : 'neutral', icon: <FlaskConical className="w-3.5 h-3.5" /> },
        { label: 'عدم انطباق', value: faInt(o.ncrs.length), tone: o.ncrs.length ? 'danger' : 'success', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
        ...(o.materials.some((m) => m.shortageQty > 0) ? [{ label: 'کسری مواد', value: faInt(o.materials.filter((m) => m.shortageQty > 0).length), tone: 'warning' as const, icon: <TriangleAlert className="w-3.5 h-3.5" /> }] : []),
      ]} />

      {/* گردش‌کار */}
      <Section title="گردش‌کار سفارش" desc="زنجیرهٔ وضعیت‌های مجاز — گذار‌ها بر اساس نقش شما و شرایط سفارش و با کنترل سخت سمت سرور انجام می‌شود" icon={<ClipboardList className="w-4 h-4" />}>
        <div className="mb-4 pb-4 border-b border-dashed border-slate-200">
          <WorkflowStepper
            steps={FLOW.map((k) => ({ key: k, label: ORDER_STATUS[k]?.label ?? k }))}
            activeIndex={flowIdx}
            alert={flowAlert}
          />
        </div>
        <WorkflowBar>
          <WorkflowActions transitions={data.transitions} onTransition={(t) => transition.mutate(t)} loading={transition.isPending} />
        </WorkflowBar>
        {o.materialOverrideNote && (
          <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            عبور تأیید‌شده از کمبود بحرانی: {o.materialOverrideNote} — <DateCell date={o.materialOverrideAt} withTime />
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-3 gap-4">
        <Section title="اطلاعات سفارش" className="lg:col-span-1" icon={<ClipboardList className="w-4 h-4" />}>
          <InfoGrid cols={2}>
            <Field label="مبدأ درخواست" value={<span className="space-x-2 rtl:space-x-reverse"><StatusBadge map={ORDER_ORIGIN} value={o.originType} />{o.originRef && <span className="font-mono text-xs tnum">{o.originRef}</span>}</span>} />
            <Field label="مشتری سفارش‌دهنده" value={o.customer?.name ?? '—'} />
            <Field label="موضوع درخواست" value={o.originTitle ?? '—'} />
            <Field label="صادرکننده / ابلاغ‌کننده" value={o.originIssuedBy ?? '—'} />
            <Field label="تاریخ صدور درخواست" value={o.originDate ? <DateCell date={o.originDate} /> : '—'} />
            <Field label="مسئول تولید" value={o.owner?.fullName ?? '—'} />
            <Field label="ایجادکننده" value={o.createdBy?.fullName ?? '—'} />
            <Field label="خط تولید" value={o.productionLine ?? '—'} />
            <Field label="تاریخ ایجاد" value={<DateCell date={o.createdAt} withTime />} />
            <Field label="شروع برنامه‌ریزی" value={<DateCell date={o.plannedStart} />} />
            <Field label="پایان برنامه‌ریزی" value={<DateCell date={o.plannedEnd} />} />
            <Field label="شروع واقعی" value={<DateCell date={o.actualStart} />} />
            <Field label="پایان واقعی" value={<DateCell date={o.actualEnd} />} />
            <Field label="توضیحات" value={o.notes} full />
          </InfoGrid>
        </Section>

        <Section title="مواد و موجودی (BOM × تعداد)" desc={o.bom ? `BOM r${o.bom.revision} — ${o.bom.status === 'ACTIVE' ? 'فعال' : 'بازنشسته'} · اعمال از ${formatJalali(o.bom.effectiveDate)}` : 'BOM ندارد'} className="lg:col-span-2">
          {!o.bom && <div className="text-sm text-muted-foreground">BOM برای این سفارش ثبت نشده است.</div>}
          {o.bom && (
            <div className="overflow-auto max-h-72">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/70 text-xs text-muted-foreground">
                  <th className="text-right px-2 py-2">قطعه</th><th className="text-right px-2 py-2">تأمین‌کننده</th>
                  <th className="text-right px-2 py-2">موردنیاز</th><th className="text-right px-2 py-2">رزرو</th>
                  <th className="text-right px-2 py-2">کسری</th><th className="text-right px-2 py-2">وضعیت</th>
                </tr></thead>
                <tbody>
                  {o.materials.map((m) => (
                    <tr key={m.id} className="border-b last:border-b-0">
                      <td className="px-2 py-2">
                        <div className="font-medium text-[13px]">{m.component.name}</div>
                        <div className="text-[10px] text-muted-foreground tnum">{m.component.code}</div>
                      </td>
                      <td className="px-2 py-2 text-xs">{o.bom?.items.find((i) => i.component.id === m.component.id)?.component.supplier?.name ?? '—'}</td>
                      <td className="px-2 py-2 tnum">{faInt(m.requiredQty)}</td>
                      <td className="px-2 py-2 tnum">{faInt(m.reservedQty)}</td>
                      <td className={cn('px-2 py-2 tnum font-semibold', m.shortageQty > 0 && 'text-rose-700')}>{faInt(m.shortageQty)}</td>
                      <td className="px-2 py-2">
                        {m.shortageQty > 0 && m.critical && <span className="text-[11px] text-rose-700 font-semibold flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" /> کسری بحرانی</span>}
                        {m.shortageQty > 0 && !m.critical && <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" /> کسری غیربحرانی</span>}
                        {m.shortageQty === 0 && <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden="true" /> تأمین‌شده</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <Tabs defaultValue="steps">
        <TabsList className="flex-wrap">
          <TabsTrigger value="steps">فرایند تولید ({faInt(o.steps.length)})</TabsTrigger>
          <TabsTrigger value="devices">دستگاه‌ها و شماره سریال ({faInt(o.devices.length)})</TabsTrigger>
          <TabsTrigger value="tests">تست‌ها ({faInt(o.tests.length)})</TabsTrigger>
          <TabsTrigger value="ncrs">عدم انطباق ({faInt(o.ncrs.length)})</TabsTrigger>
          <TabsTrigger value="bom">BOM کامل</TabsTrigger>
        </TabsList>

        <TabsContent value="steps" className="mt-3">
          <Section title="مراحل فرایند تولید" desc="ثبت عملیات توسط اپراتور — هر رکورد شامل اپراتور، زمان و نتیجه است">
            <StepsTable order={o} operators={data.operators} orderId={id} />
          </Section>
        </TabsContent>

        <TabsContent value="devices" className="mt-3">
          <Section title="دستگاه‌های این سفارش (شماره سریال یکتا)" desc={`پیشرفت کلی: ${faInt(o.devices.filter((d) => d.status !== 'IN_PRODUCTION').length)} دستگاه از ${faInt(o.devices.length)} دستگاه مرحلهٔ تولید را پشت سر گذاشته‌اند`} icon={<Cpu className="w-4 h-4" />}>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 stagger">
              {o.devices.map((d) => (
                <div key={d.id} className="rounded-xl border p-3.5 space-y-2.5 card-lift hover:border-teal-300 cursor-pointer" onClick={() => navigate('device', { serial: d.serial })}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-[13px] tnum">{d.serial}</span>
                    <StatusBadge map={DEVICE_STATUS} value={d.status} />
                  </div>
                  <StepsBar current={d.currentStepIndex} total={o.steps.length} />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> {d.firmwareVersion ? `FW ${d.firmwareVersion}` : 'FW ثبت نشده'}</span>
                    <span>{faInt(d._count.tests)} تست · {faInt(d._count.reworks)} اصلاح</span>
                  </div>
                  {o.product.hasFirmware && can('production.recordStep') && !d.firmwareVersion && ['IN_PRODUCTION'].includes(d.status) && (
                    <FirmwareDialog deviceId={d.id} orderId={id} />
                  )}
                </div>
              ))}
              {o.devices.length === 0 && <div className="text-sm text-muted-foreground col-span-full text-center py-8">شماره سریال‌ها با شروع تولید ایجاد می‌شوند.</div>}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="tests" className="mt-3">
          <Section title="نتایج تست این سفارش" desc="سوابق تست تغییرناپذیرند؛ تست مجدد به‌صورت زنجیره‌ای در کنار نتیجهٔ قبلی ثبت می‌شود" icon={<FlaskConical className="w-4 h-4" />}>
            <DataTable
              columns={[
                { key: 'name', header: 'تست', render: (t) => <span className="text-[13px]">{t.name}</span> },
                { key: 'stage', header: 'سطح', render: (t) => <StatusBadge map={QC_STAGE} value={t.stage} /> },
                { key: 'device', header: 'دستگاه', render: (t) => <span className="font-mono text-xs tnum">{o.devices.find((d) => d.id === t.deviceId)?.serial ?? '—'}</span> },
                { key: 'actual', header: 'مقدار', render: (t) => <span className="tnum">{t.actualValue ?? '—'}</span> },
                { key: 'result', header: 'نتیجه', render: (t) => t.passed ? <span className="text-emerald-700 font-bold text-xs inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden="true" /> PASS</span> : <span className="text-rose-700 font-bold text-xs inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" aria-hidden="true" /> FAIL</span> },
                { key: 'verified', header: 'تأیید QC', render: (t) => t.verifiedById ? <span className="text-emerald-700 text-xs">تأیید‌شده</span> : <span className="text-amber-700 text-xs">در انتظار</span> },
                { key: 'date', header: 'زمان', render: (t) => <RelDate date={t.createdAt} /> },
              ]}
              rows={o.tests as never[]}
              empty="تستی ثبت نشده است"
            />
          </Section>
        </TabsContent>

        <TabsContent value="ncrs" className="mt-3">
          <Section title="عدم انطباق‌های مرتبط">
            {o.ncrs.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">عدم انطباقی ثبت نشده است</div>}
            <div className="space-y-2">
              {o.ncrs.map((n) => (
                <button key={n.id} className="w-full text-right rounded-xl border p-3 hover:border-teal-300 transition-colors" onClick={() => navigate('quality', { tab: 'ncrs' })}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium tnum">{n.code} — {n.title}</span>
                    <StatusBadge map={NCR_STATUS} value={n.status} />
                  </div>
                </button>
              ))}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="bom" className="mt-3">
          <Section title={`BOM نسخه ${o.bom?.revision ?? '—'}`} desc="قطعات استفاده‌شده در این سفارش (Snapshot نسخه BOM)">
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/70 text-xs text-muted-foreground">
                  <th className="text-right px-2 py-2">#</th><th className="text-right px-2 py-2">کد قطعه</th>
                  <th className="text-right px-2 py-2">نام</th><th className="text-right px-2 py-2">سازنده</th>
                  <th className="text-right px-2 py-2">تأمین‌کننده</th><th className="text-right px-2 py-2">در هر دستگاه</th><th className="text-right px-2 py-2">اهمیت</th>
                </tr></thead>
                <tbody>
                  {(o.bom?.items ?? []).map((item, i) => (
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
        </TabsContent>
      </Tabs>
    </div>
  )
}

function WorkflowBar({ children }: { children: React.ReactNode }) {
  return <div className="min-h-9 flex items-center">{children}</div>
}

// ═══ جدول مراحل تولید ═══
function StepsTable({ order, operators, orderId }: { order: OrderDetailData['order']; operators: { id: string; fullName: string; role: string }[]; orderId: string }) {
  const qc = useQueryClient()
  const { can } = useApp()
  const [step, setStep] = React.useState<OrderDetailData['order']['steps'][number] | null>(null)
  const [deviceId, setDeviceId] = React.useState('all')
  const [result, setResult] = React.useState('DONE')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState('')

  const mutation = useMutation({
    mutationFn: () => apiPost(`/api/orders/${orderId}`, {
      action: 'record-step', stepId: step!.id,
      deviceId: deviceId === 'all' ? undefined : deviceId,
      applyAll: deviceId === 'all' || undefined,
      result, notes: notes || undefined,
    }),
    onSuccess: () => {
      toast({ title: 'عملیات ثبت شد', description: 'رکورد اپراتور با زمان و نتیجه در پرونده ثبت شد.' })
      setStep(null); setNotes(''); setError('')
      qc.invalidateQueries({ queryKey: ['order', orderId] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  const recordMutation = useMutation({
    mutationFn: (vars: { stepId: string; deviceId: string | null }) => apiPost(`/api/orders/${orderId}`, {
      action: 'record-step', stepId: vars.stepId, deviceId: vars.deviceId ?? undefined, result: 'DONE',
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order', orderId] }) },
  })

  const stepStatusMap: Record<string, { label: string; tone: string }> = {
    PENDING: { label: 'در انتظار', tone: 'text-muted-foreground' },
    IN_PROGRESS: { label: 'در حال انجام', tone: 'text-amber-700' },
    DONE: { label: 'تکمیل', tone: 'text-emerald-700' },
  }

  return (
    <>
      <div className="space-y-2">
        {order.steps.map((s) => {
          const doneRecords = s.records.filter((r) => r.result === 'DONE')
          const status = stepStatusMap[s.status] ?? stepStatusMap.PENDING
          const progress = order.devices.length > 0 ? `${faInt(doneRecords.length)}/${faInt(order.devices.length)}` : null
          return (
            <div key={s.id} className={cn('rounded-xl border p-3 space-y-2 transition-shadow hover:shadow-md', s.status === 'DONE' && 'bg-emerald-50/40 border-emerald-200', s.status === 'IN_PROGRESS' && 'bg-amber-50/40 border-amber-200')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-teal-600 to-emerald-500 text-white flex items-center justify-center text-[11px] font-bold tnum shrink-0 shadow-sm">{faInt(s.stepIndex)}</span>
                <span className="font-semibold text-[13px]">{s.name}</span>
                {s.required && <span className="text-[10px] text-rose-600 border border-rose-200 rounded px-1">اجباری</span>}
                {s.isPackaging && <span className="text-[10px] text-teal-700 border border-teal-200 rounded px-1">بسته‌بندی</span>}
                {s.needsQc && <span className="text-[10px] text-purple-700 border border-purple-200 rounded px-1">QC</span>}
                <span className={cn('text-xs font-medium mr-auto', status.tone)}>{status.label}{progress ? ` · ${progress} دستگاه` : ''}</span>
                {can('production.recordStep') && order.status === 'IN_PRODUCTION' && s.status !== 'DONE' && (
                  <Button size="sm" variant="outline" onClick={() => { setStep(s); setDeviceId('all'); setResult('DONE') }}>
                    <CircleDot className="w-3.5 h-3.5 ml-1" /> ثبت عملیات
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {s.tools && <span>ابزار: {s.tools}</span>}
                {s.acceptance && <span>معیار پذیرش: {s.acceptance}</span>}
                {s.finishedAt && <span>پایان: <DateCell date={s.finishedAt} withTime /></span>}
              </div>
              {s.records.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.records.slice(0, 8).map((r) => (
                    <span key={r.id} className="text-[10px] bg-white border rounded-md px-1.5 py-0.5" title={`${r.operator.fullName} — ${r.result}${r.notes ? ' — ' + r.notes : ''}`}>
                      {r.device?.serial ?? 'کلی'} · {r.operator.fullName} · <StatusBadge map={STEP_RESULT} value={r.result} />
                    </span>
                  ))}
                  {s.records.length > 8 && <span className="text-[10px] text-muted-foreground self-center">+{faInt(s.records.length - 8)} دیگر</span>}
                </div>
              )}
            </div>
          )
        })}
        {order.steps.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">مراحل با تأیید سفارش از قالب فرایند محصول کپی می‌شوند.</div>}
      </div>

      {/* دیالوگ ثبت عملیات */}
      <Dialog open={!!step} onOpenChange={(v) => !v && setStep(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ثبت عملیات — {step?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>دستگاه</Label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه دستگاه‌ها (ثبت گروهی)</SelectItem>
                  {order.devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.serial}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>نتیجه</Label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DONE">انجام‌شده (Done)</SelectItem>
                  <SelectItem value="FAIL">ناموفق (Fail — NCR خودکار صادر می‌شود)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>یادداشت</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="مشاهدات، انحرافات، توضیحات…" />
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">اپراتور ثبت‌کننده: کاربر جاری — زمان ثبت به‌صورت خودکار در پرونده درج می‌شود.</div>
            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep(null)}>انصراف</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? 'در حال ثبت…' : 'ثبت در پرونده'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ═══ ثبت Firmware ═══
function FirmwareDialog({ deviceId, orderId }: { deviceId: string; orderId: string }) {
  const qc = useQueryClient()
  const [fw, setFw] = React.useState('v1.0.0')
  const [sw, setSw] = React.useState('v1.0.0')
  const [method, setMethod] = React.useState('JTAG — J-Link')
  const [verified, setVerified] = React.useState(true)

  const mutation = useMutation({
    mutationFn: () => apiPost(`/api/orders/${orderId}`, {
      action: 'firmware', deviceId, firmwareVersion: fw, softwareVersion: sw, programMethod: method, programVerified: verified,
    }),
    onSuccess: () => {
      toast({ title: 'اطلاعات Firmware ثبت شد', description: `نسخه ${fw} به پرونده دستگاه اضافه شد.` })
      qc.invalidateQueries({ queryKey: ['order', orderId] })
    },
  })

  return (
    <div className="pt-1">
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="w-full"><Cpu className="w-3.5 h-3.5 ml-1" /> ثبت نسخه Firmware</Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ثبت Firmware و Software</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>نسخه Firmware</Label><Input value={fw} onChange={(e) => setFw(e.target.value)} dir="ltr" className="text-left" /></div>
            <div className="space-y-1.5"><Label>نسخه Software</Label><Input value={sw} onChange={(e) => setSw(e.target.value)} dir="ltr" className="text-left" /></div>
            <div className="space-y-1.5"><Label>روش پروگرام</Label><Input value={method} onChange={(e) => setMethod(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="accent-teal-700" />
              تأیید (Verification) موفق بود
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? 'در حال ثبت…' : 'ثبت'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
