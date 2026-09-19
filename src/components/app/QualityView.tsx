'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './api'
import { useApp } from './store'
import { PageHeader, DataTable, Section, DateCell, StatusBadge, SearchBox, WorkflowActions, Field, InfoGrid, KpiCard, RelDate, WorkflowStepper, type TransitionBtn } from './ui-bits'
import { QC_STAGE, SEVERITY, NCR_TYPE, NCR_STATUS } from '@/lib/labels'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'
import { Plus, FlaskConical, Wrench as WrenchIcon, ClipboardX, Gauge, CheckCircle2, XCircle, Check, RotateCcw, ClipboardCheck, Activity, Archive } from 'lucide-react'

interface TestRow {
  id: string; templateCode: string; name: string; stage: string; parameterName: string; unit: string | null
  criteria: string | null; actualValue: string | null; passed: boolean; notes: string | null
  retestOfId: string | null; createdAt: string; verifiedById: string | null; equipmentId: string | null
  device: { serial: string; status: string } | null; order: { code: string; status: string } | null
  operator: { fullName: string }; verifier: { fullName: string } | null
  equipment: { code: string; name: string; status: string } | null
}

interface TemplateRow {
  id: string; code: string; name: string; stage: string; parameterName: string; unit: string | null
  criteria: string | null; minValue: number | null; maxValue: number | null; required: boolean; active: boolean
  productRevisionId: string | null; componentId: string | null
  equipment: { code: string; name: string; status: string } | null
}

interface EquipmentRow { id: string; code: string; name: string; equipmentType: string | null; calibratedAt: string | null; calibrationDueAt: string | null; status: string; notes: string | null; daysToDue: number | null }

interface NcrRow {
  id: string; code: string; type: string; source: string; title: string; description: string
  severity: string; rootCause: string | null; correctiveAction: string | null; preventiveAction: string | null
  status: string; detectedById: string; detectedAt: string
  device: { id: string; serial: string; status: string } | null; order: { id: string; code: string; status: string } | null
  component: { code: string; name: string } | null
  reworks: { id: string; action: string; performedBy: { fullName: string }; performedAt: string }[]
  transitions: TransitionBtn[]
}

export default function QualityView() {
  const { params } = useApp()
  const [tab, setTab] = React.useState((params.tab as string) || 'tests')
  React.useEffect(() => { if (params.tab) setTab(params.tab as string) }, [params.tab])

  return (
    <div className="space-y-4">
      <PageHeader
        title="کنترل کیفیت"
        desc="سه سطح کنترل (ورودی، حین تولید و نهایی) — با شکست تست اجباری، دستگاه قفل می‌شود، NCR صادر می‌شود و آزادسازی ممکن نمی‌شود"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="tests" className="gap-1.5"><FlaskConical className="w-3.5 h-3.5" aria-hidden="true" /> نتایج تست</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" /> قالب تست</TabsTrigger>
          <TabsTrigger value="equipment" className="gap-1.5"><Gauge className="w-3.5 h-3.5" aria-hidden="true" /> تجهیزات تست</TabsTrigger>
          <TabsTrigger value="ncrs" className="gap-1.5"><ClipboardX className="w-3.5 h-3.5" aria-hidden="true" /> عدم انطباق و اصلاح</TabsTrigger>
        </TabsList>
        <TabsContent value="tests" className="mt-3"><TestsTab /></TabsContent>
        <TabsContent value="templates" className="mt-3"><TemplatesTab /></TabsContent>
        <TabsContent value="equipment" className="mt-3"><EquipmentTab /></TabsContent>
        <TabsContent value="ncrs" className="mt-3"><NcrsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ═══ نتایج تست ═══
function TestsTab() {
  const { can } = useApp()
  const [stage, setStage] = React.useState('all')
  const [result, setResult] = React.useState('all')
  const [q, setQ] = React.useState('')
  const [recordOpen, setRecordOpen] = React.useState(false)
  const [retestFor, setRetestFor] = React.useState<TestRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['tests', stage, result, q],
    queryFn: () => apiGet<{ tests: TestRow[] }>(`/api/qc/tests${stage !== 'all' || result !== 'all' || q ? '?' + [
      stage !== 'all' ? `stage=${stage}` : '', result !== 'all' ? `passed=${result}` : '', q ? `q=${encodeURIComponent(q)}` : '',
    ].filter(Boolean).join('&') : ''}`),
  })

  const tests = data?.tests ?? []
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 stagger">
        <KpiCard label="کل نتایج (نمایش)" value={tests.length} tone="info" icon={<Activity className="w-5 h-5" />} />
        <KpiCard label="قبول (PASS)" value={tests.filter((t) => t.passed).length} tone="success" icon={<CheckCircle2 className="w-5 h-5" />} />
        <KpiCard label="مردود (FAIL)" value={tests.filter((t) => !t.passed).length} tone="danger" icon={<XCircle className="w-5 h-5" />} />
        <KpiCard label="تست مجدد ثبت‌شده" value={tests.filter((t) => t.retestOfId).length} tone="warning" icon={<RotateCcw className="w-5 h-5" />} />
      </div>
      <Section icon={<FlaskConical className="w-4 h-4" />}>
        <div className="flex flex-wrap gap-2 mb-3">
          <SearchBox value={q} onChange={setQ} placeholder="کد تست، نام یا سریال دستگاه…" className="w-64" />
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه سطوح</SelectItem>
              {Object.entries(QC_STAGE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه نتایج</SelectItem>
              <SelectItem value="pass">فقط PASS</SelectItem>
              <SelectItem value="fail">فقط FAIL</SelectItem>
            </SelectContent>
          </Select>
          {can('qc.test.create') && <Button className="mr-auto bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25" onClick={() => setRecordOpen(true)}><Plus className="w-4 h-4 ml-1" /> ثبت نتیجه تست</Button>}
        </div>
        <DataTable
          columns={[
            { key: 'name', header: 'تست', render: (t: TestRow) => (
              <div>
                <div className="text-[13px] font-medium">{t.name}{t.retestOfId ? ' ↻' : ''}</div>
                <div className="text-[10px] text-muted-foreground tnum">{t.templateCode}</div>
              </div>
            ) },
            { key: 'stage', header: 'سطح', render: (t: TestRow) => <StatusBadge map={QC_STAGE} value={t.stage} /> },
            { key: 'device', header: 'دستگاه', render: (t: TestRow) => <span className="font-mono text-xs tnum">{t.device?.serial ?? '—'}</span> },
            { key: 'order', header: 'سفارش', hideOnMobile: true, render: (t: TestRow) => <span className="text-xs tnum text-muted-foreground">{t.order?.code ?? '—'}</span> },
            { key: 'param', header: 'پارامتر', hideOnMobile: true, render: (t: TestRow) => <span className="text-xs">{t.parameterName} <span className="text-muted-foreground">({t.criteria ?? '—'})</span></span> },
            { key: 'actual', header: 'مقدار', render: (t: TestRow) => <span className="tnum text-[13px]">{t.actualValue ?? '—'} {t.unit ?? ''}</span> },
            { key: 'result', header: 'نتیجه', render: (t: TestRow) => t.passed ? <span className={cn('text-xs font-bold inline-flex items-center gap-1', t.retestOfId ? 'text-teal-600' : 'text-emerald-700')}><Check className="w-3.5 h-3.5" aria-hidden="true" />{t.retestOfId ? 'PASS (تست مجدد)' : 'PASS'}</span> : <span className="text-xs font-bold text-rose-700 inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" aria-hidden="true" />FAIL</span> },
            { key: 'eq', header: 'تجهیزات', hideOnMobile: true, render: (t: TestRow) => (
              <span className={cn('text-[11px]', t.equipment?.status === 'OVERDUE' ? 'text-rose-600' : 'text-muted-foreground')}>{t.equipment?.code ?? '—'}</span>
            ) },
            { key: 'verify', header: 'تأیید', render: (t: TestRow) => t.verifiedById ? <span className="text-[11px] text-emerald-700">تأیید‌شده</span> : <span className="text-[11px] text-amber-700">در انتظار</span> },
            { key: 'date', header: 'زمان', render: (t: TestRow) => <RelDate date={t.createdAt} /> },
            { key: 'actions', header: 'اقدام', render: (t: TestRow) => (
              <div className="flex gap-1">
                {can('qc.test.verify') && !t.verifiedById && !t.retestOfId && <VerifyBtn test={t} />}
                {can('qc.test.create') && !t.passed && !t.retestOfId && t.device && (
                  <Button size="sm" variant="outline" onClick={() => setRetestFor(t)}><RotateCcw className="w-3.5 h-3.5 ml-1" /> تست مجدد</Button>
                )}
              </div>
            ) },
          ]}
          rows={tests}
          loading={isLoading}
          empty="نتیجه تستی ثبت نشده است"
        />
      </Section>

      <RecordTestDialog open={recordOpen} onOpenChange={setRecordOpen} />
      <RetestDialog test={retestFor} onClose={() => setRetestFor(null)} />
    </>
  )
}

function VerifyBtn({ test }: { test: TestRow }) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => apiPost(`/api/qc/tests/${test.id}`, { action: 'verify' }),
    onSuccess: () => { toast({ title: 'نتیجه تست تأیید شد' }); qc.invalidateQueries({ queryKey: ['tests'] }) },
  })
  return <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>تأیید QC</Button>
}

// ═══ ثبت نتیجه تست ═══
function RecordTestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data: tplData } = useQuery({ queryKey: ['qc-templates'], queryFn: () => apiGet<{ templates: TemplateRow[]; equipment: EquipmentRow[] }>('/api/qc/templates'), enabled: open })
  const { data: devData } = useQuery({ queryKey: ['qc-devices'], queryFn: () => apiGet<{ devices: { id: string; serial: string; status: string; order: { code: string; status: string } | null }[] }>('/api/devices?status=IN_PRODUCTION'), enabled: open })

  const [templateId, setTemplateId] = React.useState('')
  const [deviceId, setDeviceId] = React.useState('')
  const [actualValue, setActualValue] = React.useState('')
  const [equipmentId, setEquipmentId] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState('')

  const templates = tplData?.templates ?? []
  const devices = devData?.devices ?? []
  const tpl = templates.find((t) => t.id === templateId)

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/qc/tests', {
      templateId, deviceId: deviceId || undefined, actualValue,
      equipmentId: equipmentId || tpl?.equipment?.id || undefined, notes: notes || undefined,
    }),
    onSuccess: (_r, vars) => {
      const passed = (_r as { passed?: boolean })?.passed
      toast({
        title: 'نتیجه تست ثبت شد',
        description: passed === false ? 'نتیجه FAIL: NCR به‌صورت خودکار صادر شد و دستگاه از آزادسازی مسدود شد.' : undefined,
        variant: passed === false ? 'destructive' : undefined,
      })
      qc.invalidateQueries({ queryKey: ['tests'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['order'] })
      onOpenChange(false)
      setTemplateId(''); setDeviceId(''); setActualValue(''); setNotes(''); setError('')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  const failedDevices = devices.filter((d) => ['QC_FAIL', 'REWORK', 'QC_PASS'].includes(d.status))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FlaskConical className="w-5 h-5 text-teal-700" /> ثبت نتیجه تست</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>قالب تست *</Label>
            <Select value={templateId} onValueChange={(v) => { setTemplateId(v); const t = templates.find((x) => x.id === v); if (t?.equipment?.id) setEquipmentId(t.equipment.id) }}>
              <SelectTrigger><SelectValue placeholder="انتخاب تست…" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>
                  {`[${t.stage === 'FINAL' ? 'نهایی' : t.stage === 'IN_PROCESS' ? 'حین تولید' : 'ورودی'}] ${t.name}${t.required ? ' *' : ''}`}
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {tpl && (
            <div className="text-xs bg-muted/60 rounded-lg p-2.5 space-y-1">
              <div>پارامتر: <b>{tpl.parameterName}</b> {tpl.unit ? `(${tpl.unit})` : ''}</div>
              <div>معیار پذیرش: <b>{tpl.criteria ?? '—'}</b>{tpl.minValue !== null || tpl.maxValue !== null ? ` (${tpl.minValue ?? '−∞'} … ${tpl.maxValue ?? '+∞'})` : ''}</div>
              <div>سطح: <StatusBadge map={QC_STAGE} value={tpl.stage} /> {tpl.required ? '· اجباری' : '· اختیاری'}</div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>دستگاه (شماره سریال) *</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger><SelectValue placeholder="انتخاب دستگاه…" /></SelectTrigger>
              <SelectContent>
                {devices.filter((d) => !tpl || tpl.stage !== 'FINAL' || ['WAITING_QC', 'REWORK', 'COMPLETED'].includes(d.order?.status ?? '')).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{`${d.serial} (${d.order?.code ?? 'بدون سفارش'})`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {failedDevices.length > 0 && <div className="text-[10px] text-muted-foreground">برای دستگاه‌های QC_PASS/QC_FAIL، ثبت تست مجدد فقط از پروندهٔ دستگاه ممکن است.</div>}
          </div>
          <div className="space-y-1.5">
            <Label>مقدار اندازه‌گیری‌شده *</Label>
            <Input value={actualValue} onChange={(e) => setActualValue(e.target.value)} dir="ltr" className="text-left" placeholder="مثال: 1.3" />
            {tpl && (tpl.minValue !== null || tpl.maxValue !== null) && <div className="text-[10px] text-muted-foreground">اگر مقدار عددی وارد شود، Pass/Fail خودکار تعیین می‌شود.</div>}
          </div>
          <div className="space-y-1.5">
            <Label>تجهیزات تست</Label>
            <Select value={equipmentId || 'none'} onValueChange={(v) => setEquipmentId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(tplData?.equipment ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id} disabled={e.status === 'OVERDUE'}>{e.name}{e.status === 'OVERDUE' ? ' (کالیبراسیون منقضی)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[10px] text-muted-foreground">اگر تجهیزِ انتخاب‌شده کالیبراسیون منقضی داشته باشد، ثبت تست مسدود می‌شود.</div>
          </div>
          <div className="space-y-1.5"><Label>یادداشت</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !templateId || !deviceId || !actualValue}>{mutation.isPending ? 'در حال ثبت…' : 'ثبت نتیجه'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══ Retest ═══
function RetestDialog({ test, onClose }: { test: TestRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [actualValue, setActualValue] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState('')

  const mutation = useMutation({
    mutationFn: () => apiPost(`/api/qc/tests/${test!.id}`, { action: 'retest', actualValue, notes: notes || undefined }),
    onSuccess: (r) => {
      const passed = (r as { retest?: { passed: boolean } }).retest?.passed
      toast({ title: 'تست مجدد ثبت شد', description: passed ? 'نتیجه PASS — دستگاه برای ارزیابی مجدد QC آزاد شد.' : 'نتیجه مجدداً FAIL است.', variant: passed ? undefined : 'destructive' })
      qc.invalidateQueries({ queryKey: ['tests'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose(); setActualValue(''); setNotes('')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Dialog open={!!test} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>تست مجدد — {test?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs bg-rose-50 border border-rose-200 rounded-lg p-2.5">
            نتیجه اصلی: <b>{test?.actualValue}</b> ({test?.criteria}) — <span className="text-rose-700 font-medium">FAIL</span>
            <div className="mt-1 text-muted-foreground">رکورد اصلی دست‌نخورده باقی می‌ماند؛ تست مجدد به‌صورت زنجیره‌ای ثبت می‌شود.</div>
          </div>
          <div className="space-y-1.5"><Label>مقدار جدید *</Label><Input value={actualValue} onChange={(e) => setActualValue(e.target.value)} dir="ltr" className="text-left" /></div>
          <div className="space-y-1.5"><Label>توضیح اقدام اصلاحی انجام‌شده</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !actualValue}>{mutation.isPending ? 'در حال ثبت…' : 'ثبت تست مجدد'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══ قالب‌های تست ═══
function TemplatesTab() {
  const { can } = useApp()
  const [open, setOpen] = React.useState(false)
  const { data } = useQuery({ queryKey: ['qc-templates'], queryFn: () => apiGet<{ templates: TemplateRow[]; equipment: EquipmentRow[] }>('/api/qc/templates') })
  return (
    <>
      <Section title="قالب‌های تست" desc="تعریف پارامتر‌ها و معیار پذیرش — قبولی/مردودیِ مقادیر عددی به‌صورت خودکار تعیین می‌شود" icon={<ClipboardCheck className="w-4 h-4" />} actions={can('qc.template.manage') && <Button size="sm" className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-md shadow-teal-600/25" onClick={() => setOpen(true)}><Plus className="w-4 h-4 ml-1" /> قالب جدید</Button>}>
        <DataTable
          columns={[
            { key: 'code', header: 'کد', render: (t: TemplateRow) => <span className="font-mono text-xs tnum">{t.code}</span> },
            { key: 'name', header: 'نام تست', render: (t: TemplateRow) => <span className="text-[13px]">{t.name}{t.required ? ' *' : ''}</span> },
            { key: 'stage', header: 'سطح', render: (t: TemplateRow) => <StatusBadge map={QC_STAGE} value={t.stage} /> },
            { key: 'param', header: 'پارامتر / معیار', render: (t: TemplateRow) => <span className="text-xs">{t.parameterName} {t.unit ? `(${t.unit})` : ''} — <b>{t.criteria ?? '—'}</b></span> },
            { key: 'range', header: 'بازه عددی', hideOnMobile: true, render: (t: TemplateRow) => <span className="tnum text-xs">{t.minValue ?? '—'} … {t.maxValue ?? '—'}</span> },
            { key: 'eq', header: 'تجهیزات', hideOnMobile: true, render: (t: TemplateRow) => <span className="text-xs">{t.equipment?.code ?? '—'}</span> },
          ]}
          rows={data?.templates ?? []}
          empty="قالبی تعریف نشده است"
        />
      </Section>
      <NewTemplateDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function NewTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data: devData } = useQuery({ queryKey: ['qc-devices'], queryFn: () => apiGet<{ devices: { productRevisionId: string }[] }>('/api/devices'), enabled: open })
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => apiGet<{ products: { revisions: { id: string; revision: string; productId: string }[] }[] }>('/api/products'), enabled: open })

  const [form, setForm] = React.useState({ code: '', name: '', stage: 'FINAL', parameterName: '', unit: '', criteria: '', minValue: '', maxValue: '', required: true })
  const [error, setError] = React.useState('')
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/qc/templates', {
      ...form, minValue: form.minValue ? parseFloat(form.minValue) : null, maxValue: form.maxValue ? parseFloat(form.maxValue) : null,
    }),
    onSuccess: () => { toast({ title: 'قالب تست ایجاد شد' }); qc.invalidateQueries({ queryKey: ['qc-templates'] }); onOpenChange(false); setError('') },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>قالب تست جدید</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>کد *</Label><Input value={form.code} onChange={(e) => set('code', e.target.value)} dir="ltr" className="text-left" /></div>
          <div className="space-y-1.5"><Label>سطح *</Label>
            <Select value={form.stage} onValueChange={(v) => set('stage', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(QC_STAGE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2"><Label>نام تست *</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>پارامتر *</Label><Input value={form.parameterName} onChange={(e) => set('parameterName', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>واحد</Label><Input value={form.unit} onChange={(e) => set('unit', e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>معیار پذیرش (متنی)</Label><Input value={form.criteria} onChange={(e) => set('criteria', e.target.value)} placeholder="مثال: ≤ 2٪" /></div>
          <div className="space-y-1.5"><Label>حداقل</Label><Input value={form.minValue} onChange={(e) => set('minValue', e.target.value)} dir="ltr" className="text-left" type="number" /></div>
          <div className="space-y-1.5"><Label>حداکثر</Label><Input value={form.maxValue} onChange={(e) => set('maxValue', e.target.value)} dir="ltr" className="text-left" type="number" /></div>
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={form.required} onChange={(e) => set('required', e.target.checked)} className="accent-teal-700" />
            تست اجباری (Fail آن آزادسازی را مسدود می‌کند)
          </label>
          {error && <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.code || !form.name || !form.parameterName}>{mutation.isPending ? 'در حال ایجاد…' : 'ایجاد قالب'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══ تجهیزات تست ═══
function EquipmentTab() {
  const { can } = useApp()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['equipment'], queryFn: () => apiGet<{ equipment: EquipmentRow[] }>('/api/qc/equipment') })
  const [calFor, setCalFor] = React.useState<EquipmentRow | null>(null)
  const [calibratedAt, setCalibratedAt] = React.useState('')
  const [dueAt, setDueAt] = React.useState('')
  const [error, setError] = React.useState('')

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/qc/equipment', { action: 'calibrate', equipmentId: calFor!.id, calibratedAt, calibrationDueAt: dueAt }),
    onSuccess: () => { toast({ title: 'کالیبراسیون ثبت شد', description: 'تجهیز مجدداً فعال شد.' }); qc.invalidateQueries({ queryKey: ['equipment'] }); setCalFor(null); setError('') },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <>
      <Section title="تجهیزات تست و وضعیت کالیبراسیون" desc="با منقضی‌شدن کالیبراسیون، ثبت تست با آن تجهیز در سمت سرور مسدود می‌شود" icon={<Gauge className="w-4 h-4" />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {(data?.equipment ?? []).map((e) => (
            <div key={e.id} className={cn('rounded-xl border p-4 space-y-2 card-lift', e.status === 'OVERDUE' ? 'border-rose-200 bg-gradient-to-l from-rose-50/70 to-rose-50/20' : 'hover:border-teal-200')}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-[13px]">{e.name}</span>
                <span className={cn('text-[11px] font-semibold rounded-md px-1.5 py-0.5 border', e.status === 'ACTIVE' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-rose-700 bg-rose-50 border-rose-200')}>
                  {e.status === 'ACTIVE' ? 'فعال' : 'کالیبراسیون منقضی'}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground tnum space-y-0.5">
                <div>کد: {e.code}</div>
                <div>آخرین کالیبراسیون: <DateCell date={e.calibratedAt} /></div>
                <div>سرآمد: <DateCell date={e.calibrationDueAt} /> {e.daysToDue !== null && (
                  <span className={cn(e.daysToDue < 0 ? 'text-rose-700 font-medium' : e.daysToDue < 30 ? 'text-amber-700 font-medium' : 'text-emerald-700')}>
                    ({e.daysToDue < 0 ? `${faInt(-e.daysToDue)} روز تأخیر` : `${faInt(e.daysToDue)} روز باقی‌مانده`})
                  </span>
                )}</div>
              </div>
              {can('qc.equipment.manage') && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => setCalFor(e)}><Gauge className="w-3.5 h-3.5 ml-1" /> ثبت کالیبراسیون</Button>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Dialog open={!!calFor} onOpenChange={(v) => !v && setCalFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ثبت کالیبراسیون — {calFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>تاریخ کالیبراسیون *</Label><Input type="date" value={calibratedAt} onChange={(e) => setCalibratedAt(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>سرآمد کالیبراسیون *</Label><Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></div>
            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          </div>
          <DialogFooter><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !calibratedAt || !dueAt}>{mutation.isPending ? 'در حال ثبت…' : 'ثبت'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ═══ عدم انطباق و Rework ═══
function NcrsTab() {
  const { can } = useApp()
  const [detail, setDetail] = React.useState<NcrRow | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ['ncrs'], queryFn: () => apiGet<{ ncrs: NcrRow[] }>('/api/ncrs') })
  const ncrs = data?.ncrs ?? []

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 stagger">
        <KpiCard label="NCR باز" value={ncrs.filter((n) => ['OPEN', 'IN_REWORK', 'RETEST'].includes(n.status)).length} tone="danger" icon={<ClipboardX className="w-5 h-5" />} />
        <KpiCard label="در حال اصلاح" value={ncrs.filter((n) => n.status === 'IN_REWORK').length} tone="warning" icon={<WrenchIcon className="w-5 h-5" />} />
        <KpiCard label="رفع‌شده" value={ncrs.filter((n) => n.status === 'RESOLVED').length} tone="success" icon={<CheckCircle2 className="w-5 h-5" />} />
        <KpiCard label="بسته‌شده" value={ncrs.filter((n) => n.status === 'CLOSED').length} tone="neutral" icon={<Archive className="w-5 h-5" />} />
      </div>

      <Section title="عدم انطباق‌ها (NCR)" desc="گردش‌کار: باز ← در حال اصلاح ← تست مجدد ← رفع‌شده ← بسته‌شده (برای بستن، ثبت علت ریشه‌ای و اقدام اصلاحی الزامی است)" icon={<ClipboardX className="w-4 h-4" />}>
        <DataTable
          columns={[
            { key: 'code', header: 'کد', render: (n: NcrRow) => <span className="font-mono font-semibold text-[13px] tnum">{n.code}</span> },
            { key: 'title', header: 'عنوان', render: (n: NcrRow) => <div className="text-[13px] max-w-64 truncate">{n.title}</div> },
            { key: 'type', header: 'نوع', render: (n: NcrRow) => <span className="text-xs">{NCR_TYPE[n.type] ?? n.type}</span> },
            { key: 'severity', header: 'شدت', render: (n: NcrRow) => <StatusBadge map={SEVERITY} value={n.severity} /> },
            { key: 'device', header: 'دستگاه', render: (n: NcrRow) => <span className="font-mono text-xs tnum">{n.device?.serial ?? '—'}</span> },
            { key: 'order', header: 'سفارش', hideOnMobile: true, render: (n: NcrRow) => <span className="text-xs tnum">{n.order?.code ?? '—'}</span> },
            { key: 'status', header: 'وضعیت', render: (n: NcrRow) => <StatusBadge map={NCR_STATUS} value={n.status} /> },
            { key: 'date', header: 'شناسایی', render: (n: NcrRow) => <DateCell date={n.detectedAt} /> },
          ]}
          rows={ncrs}
          loading={isLoading}
          onRowClick={(n) => setDetail(n)}
          empty="عدم انطباقی ثبت نشده است"
        />
      </Section>

      <NcrDetailDialog ncr={detail} onClose={() => setDetail(null)} canManage={can('qc.ncr.manage')} />
    </>
  )
}

function NcrDetailDialog({ ncr, onClose, canManage }: { ncr: NcrRow | null; onClose: () => void; canManage: boolean }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({ rootCause: '', correctiveAction: '', preventiveAction: '' })
  const [reworkAction, setReworkAction] = React.useState('')

  React.useEffect(() => {
    if (ncr) setForm({ rootCause: ncr.rootCause ?? '', correctiveAction: ncr.correctiveAction ?? '', preventiveAction: ncr.preventiveAction ?? '' })
  }, [ncr])

  const update = useMutation({
    mutationFn: () => apiPost('/api/ncrs', { action: 'update', id: ncr!.id, ...form }),
    onSuccess: () => { toast({ title: 'NCR به‌روزرسانی شد' }); qc.invalidateQueries({ queryKey: ['ncrs'] }) },
  })
  const transition = useMutation({
    mutationFn: (t: TransitionBtn) => apiPost('/api/ncrs', { action: 'transition', id: ncr!.id, to: t.to }),
    onSuccess: () => { toast({ title: 'وضعیت NCR تغییر کرد' }); qc.invalidateQueries({ queryKey: ['ncrs'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose() },
  })
  const rework = useMutation({
    mutationFn: () => apiPost('/api/ncrs', { action: 'rework', id: ncr!.id, deviceId: ncr!.device?.id, reworkAction }),
    onSuccess: () => { toast({ title: 'دستور اصلاح (Rework) صادر شد', description: 'دستگاه به وضعیت «در حال اصلاح» رفت.' }); qc.invalidateQueries({ queryKey: ['ncrs'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose() },
  })

  if (!ncr) return null
  return (
    <Dialog open={!!ncr} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="tnum">{ncr.code}</span>
            <StatusBadge map={NCR_STATUS} value={ncr.status} />
            <StatusBadge map={SEVERITY} value={ncr.severity} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* نمایشگر زنجیرهٔ وضعیت NCR */}
          <div className={cn('rounded-xl border p-3.5 anim-fade-in', ncr.status === 'OPEN' ? 'border-rose-200/80 bg-gradient-to-l from-rose-50/50 to-transparent' : 'border-slate-200/70 bg-gradient-to-l from-teal-50/50 to-transparent')}>
            <WorkflowStepper
              compact
              steps={['OPEN', 'IN_REWORK', 'RETEST', 'RESOLVED', 'CLOSED'].map((k) => ({ key: k, label: NCR_STATUS[k]?.label ?? k }))}
              activeIndex={['OPEN', 'IN_REWORK', 'RETEST', 'RESOLVED', 'CLOSED'].indexOf(ncr.status)}
            />
          </div>

          <div className="text-sm leading-relaxed bg-muted/50 rounded-lg p-3">{ncr.description}</div>
          <InfoGrid cols={2}>
            <Field label="نوع" value={NCR_TYPE[ncr.type] ?? ncr.type} />
            <Field label="منبع" value={ncr.source === 'FINAL' ? 'کنترل نهایی' : ncr.source === 'IN_PROCESS' ? 'حین تولید' : ncr.source === 'INCOMING' ? 'کنترل ورودی' : 'خدمات'} />
            <Field label="دستگاه" value={<span className="font-mono tnum">{ncr.device?.serial ?? '—'}</span>} />
            <Field label="سفارش" value={<span className="tnum">{ncr.order?.code ?? '—'}</span>} />
            <Field label="قطعه مرتبط" value={ncr.component ? `${ncr.component.code} — ${ncr.component.name}` : '—'} />
            <Field label="تاریخ شناسایی" value={<DateCell date={ncr.detectedAt} withTime />} />
          </InfoGrid>

          {ncr.reworks.length > 0 && (
            <Section title="سوابق اصلاح (Rework)" icon={<WrenchIcon className="w-4 h-4" />}>
              <div className="space-y-2">
                {ncr.reworks.map((r) => (
                  <div key={r.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="font-medium text-[13px]">{r.action}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{r.performedBy.fullName} · <DateCell date={r.performedAt} withTime /></div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {canManage && (
            <Section title="بررسی و CAPA" desc="برای بستن NCR، ثبت علت ریشه‌ای و اقدام اصلاحی الزامی است">
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>علت ریشه‌ای (Root Cause)</Label><Textarea value={form.rootCause} onChange={(e) => setForm((f) => ({ ...f, rootCause: e.target.value }))} rows={2} /></div>
                <div className="space-y-1.5"><Label>اقدام اصلاحی (Corrective)</Label><Textarea value={form.correctiveAction} onChange={(e) => setForm((f) => ({ ...f, correctiveAction: e.target.value }))} rows={2} /></div>
                <div className="space-y-1.5"><Label>اقدام پیشگیرانه (Preventive)</Label><Textarea value={form.preventiveAction} onChange={(e) => setForm((f) => ({ ...f, preventiveAction: e.target.value }))} rows={2} /></div>
                <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending}>ذخیره بررسی</Button>
              </div>
            </Section>
          )}

          {canManage && ncr.device && ncr.status === 'OPEN' && (
            <Section title="صدور دستور اصلاح (Rework)">
              <div className="flex gap-2">
                <Input value={reworkAction} onChange={(e) => setReworkAction(e.target.value)} placeholder="شرح اقدام اصلاحی (مثال: بازکالیبراسیون و تعویض سوکت)" className="flex-1" />
                <Button onClick={() => rework.mutate()} disabled={rework.isPending || !reworkAction}>صدور دستور</Button>
              </div>
            </Section>
          )}

          {canManage && (
            <Section title="گذار وضعیت" icon={<CheckCircle2 className="w-4 h-4" />}>
              <WorkflowActions transitions={ncr.transitions ?? []} onTransition={(t) => transition.mutate(t)} loading={transition.isPending} />
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
