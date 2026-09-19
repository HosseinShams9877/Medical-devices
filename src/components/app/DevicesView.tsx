'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api'
import { useApp } from './store'
import { PageHeader, DataTable, Section, DateCell, StatusBadge, SearchBox, KpiCard, Field, InfoGrid, Timeline, RelDate } from './ui-bits'
import { DEVICE_STATUS, QC_STAGE, WARRANTY_STATUS, SEVERITY, REPAIR_RESULT, TICKET_STATUS, NCR_STATUS, COMPLAINT_STATUS } from '@/lib/labels'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Cpu, ArrowRight, Link2, ShieldCheck, Wrench, ClipboardCheck, FileText, PackageCheck, Factory, TriangleAlert, Check, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'

export default function DevicesView() {
  const { params, navigate } = useApp()
  const serial = params.serial
  if (serial) return <Dossier serial={serial} />
  return <Registry />
}

// ═══ فهرست دستگاه‌ها ═══
function Registry() {
  const { navigate } = useApp()
  const [status, setStatus] = React.useState('all')
  const [q, setQ] = React.useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['devices', status, q],
    queryFn: () => apiGet<{ devices: DeviceRow[] }>(`/api/devices${status !== 'all' ? `?status=${status}` : ''}${q ? `${status !== 'all' ? '&' : '?'}q=${encodeURIComponent(q)}` : ''}`),
  })

  const devices = data?.devices ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="دستگاه‌ها و ردیابی (Device Registry)"
        desc="هر دستگاه یک پرونده دیجیتال کامل دارد: از شماره سریال تا قطعات، لات، اپراتور، Firmware، QC، آزادسازی، تحویل و تاریخچه خدمات"
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
        <KpiCard label="کل دستگاه‌ها" value={devices.length} tone="info" icon={<Cpu className="w-5 h-5" />} />
        <KpiCard label="آزاد‌شده یا تحویل‌شده" value={devices.filter((d) => ['RELEASED', 'DELIVERED'].includes(d.status)).length} tone="success" icon={<PackageCheck className="w-5 h-5" />} />
        <KpiCard label="در حال تولید" value={devices.filter((d) => d.status === 'IN_PRODUCTION').length} tone="info" icon={<Factory className="w-5 h-5" />} />
        <KpiCard label="مردود QC یا در اصلاح" value={devices.filter((d) => ['QC_FAIL', 'REWORK'].includes(d.status)).length} tone="danger" icon={<TriangleAlert className="w-5 h-5" />} />
      </div>

      <Section>
        <div className="flex flex-wrap gap-2 mb-3">
          <SearchBox value={q} onChange={setQ} placeholder="شماره سریال یا نسخه Firmware…" className="w-64" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه وضعیت‌ها</SelectItem>
              {Object.entries(DEVICE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DataTable
          columns={[
            { key: 'serial', header: 'شماره سریال', render: (d: DeviceRow) => <span className="font-mono font-semibold text-teal-700 tnum">{d.serial}</span> },
            { key: 'product', header: 'محصول', render: (d: DeviceRow) => (
              <div>
                <div className="text-[13px]">{d.product.name}</div>
                <div className="text-[11px] text-muted-foreground tnum">{d.product.code} · نسخه {d.productRevision.revision} · BOM r{faInt(d.bomRevision)}</div>
              </div>
            ) },
            { key: 'status', header: 'وضعیت', render: (d: DeviceRow) => <StatusBadge map={DEVICE_STATUS} value={d.status} /> },
            { key: 'order', header: 'سفارش', hideOnMobile: true, render: (d: DeviceRow) => <span className="text-xs tnum text-muted-foreground">{d.order?.code ?? '—'}</span> },
            { key: 'fw', header: 'Firmware', hideOnMobile: true, render: (d: DeviceRow) => <span className="text-xs tnum">{d.firmwareVersion ?? '—'}</span> },
            { key: 'customer', header: 'مشتری', hideOnMobile: true, render: (d: DeviceRow) => <span className="text-xs">{d.customer?.name ?? '—'}</span> },
            { key: 'counts', header: 'پرونده', render: (d: DeviceRow) => (
              <span className="text-[11px] text-muted-foreground tnum">{faInt(d._count.tests)} تست · {faInt(d._count.repairs)} تعمیر · {faInt(d._count.partUsages)} قطعه</span>
            ) },
            { key: 'created', header: 'تاریخ تولید', render: (d: DeviceRow) => <DateCell date={d.producedAt ?? d.createdAt} /> },
          ]}
          rows={devices}
          loading={isLoading}
          onRowClick={(d) => navigate('device', { serial: d.serial })}
          empty="دستگاهی یافت نشد"
        />
      </Section>
    </div>
  )
}

interface DeviceRow {
  id: string; serial: string; status: string; firmwareVersion: string | null
  product: { code: string; name: string }; productRevision: { revision: string }
  bomRevision?: number
  order: { code: string; status: string } | null; customer: { code: string; name: string } | null
  producedAt: string | null; createdAt: string
  _count: { tests: number; repairs: number; partUsages: number; ncrs: number }
}

// ═══ پرونده دیجیتال دستگاه (Dossier) ═══
interface DossierData {
  device: {
    id: string; serial: string; status: string; currentStepIndex: number
    firmwareVersion: string | null; softwareVersion: string | null
    programmedAt: string | null; programMethod: string | null; programVerified: boolean | null
    producedAt: string | null; createdAt: string
    deliveredAt: string | null; deliveryNote: string | null; notes: string | null
    product: { code: string; name: string; warrantyMonths: number; hasFirmware: boolean }
    productRevision: { revision: string }
    bom: { revision: number; status: string; effectiveDate: string; items: { component: { code: string; name: string; manufacturer: string | null; supplier: { name: string } | null } }[] } | null
    order: { id: string; code: string; status: string; qty: number; productionLine: string | null; owner: string | null; createdBy: string | null; plannedStart: string | null; plannedEnd: string | null; actualStart: string | null; actualEnd: string | null; steps: { id: string; stepIndex: number; name: string; status: string }[] } | null
    customer: { id: string; code: string; name: string; contactPerson: string | null; phone: string | null } | null
    warranty: { status: string; reason?: string; end?: string | null; months?: number; source: string }
    stepRecords: { id: string; step: string; stepIndex: number; operator: string; startedAt: string; finishedAt: string | null; result: string; notes: string | null }[]
    tests: { id: string; templateCode: string; name: string; stage: string; parameterName: string; unit: string | null; criteria: string | null; actualValue: string | null; passed: boolean; operator: string; verifier: string | null; verifiedAt: string | null; notes: string | null; retestOfId: string | null; equipment: { code: string; name: string; calibrationStatus: string } | null; equipmentCalibrated: boolean; createdAt: string }[]
    releases: { id: string; releasedBy: string; releasedAt: string; notes: string | null; checks: string | null }[]
    reworks: { id: string; action: string; performedBy: string; performedAt: string; notes: string | null }[]
    ncrs: { id: string; code: string; title: string; status: string; severity: string }[]
    repairs: { id: string; code: string; ticketCode: string | null; technician: string; diagnosis: string | null; failureMode: string | null; rootCause: string | null; action: string; result: string; performedAt: string; notes: string | null; parts: { component: string; lotNumber: string | null; qty: number; oldPart: string | null; newPart: string | null }[] }[]
    complaints: { id: string; code: string; description: string; severity: string; status: string; safetyImpact: string; receivedAt: string }[]
    tickets: { id: string; code: string; problem: string; status: string; priority: string; receivedAt: string; customer: string; technician: string | null; closedAt: string | null }[]
    partUsages: { component: { code: string; name: string; manufacturer: string | null }; lotNumber: string | null; lotStatus: string | null; qty: number; source: string; usedBy: string; usedAt: string }[]
    lotSiblings: { lotNumber: string; devices: string[] }[]
    documents: { id: string; name: string; docType: string; revision: number; status: string; uploadedAt: string }[]
  }
}

function Dossier({ serial }: { serial: string }) {
  const { navigate } = useApp()
  const { data, isLoading } = useQuery({ queryKey: ['dossier', serial], queryFn: () => apiGet<DossierData>(`/api/devices/${encodeURIComponent(serial)}`) })

  if (isLoading) return <div className="text-sm text-muted-foreground py-10 text-center">در حال بارگذاری پرونده دستگاه…</div>
  if (!data) return <div className="text-sm text-muted-foreground py-10 text-center">پرونده‌ای برای «{serial}» یافت نشد.</div>
  const d = data.device

  return (
    <div className="space-y-4">
      <button className="text-sm text-teal-700 hover:underline flex items-center gap-1" onClick={() => navigate('devices')}>
        <ArrowRight className="w-4 h-4" /> بازگشت به فهرست دستگاه‌ها
      </button>

      <PageHeader
        title={`پرونده دیجیتال دستگاه ${d.serial}`}
        desc={`${d.product.name} — نسخه ${d.productRevision.revision} · ${d.order ? `سفارش ${d.order.code}` : 'بدون سفارش'}${d.customer ? ` · مشتری: ${d.customer.name}` : ''}`}
        actions={<StatusBadge map={DEVICE_STATUS} value={d.status} />}
      />

      {/* نمای ردیابی (زنجیره) */}
      <Card className="bg-gradient-to-l from-teal-50/80 to-transparent border-teal-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-900 mb-3"><Link2 className="w-4 h-4" /> زنجیره ردیابی کامل</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {[
              { label: `محصول ${d.product.code}`, ok: true },
              { label: `نسخه ${d.productRevision.revision}`, ok: true },
              { label: `سفارش ${d.order?.code ?? '—'}`, ok: !!d.order },
              { label: `BOM r${d.bom?.revision ?? '—'}`, ok: !!d.bom },
              { label: `${faInt(d.stepRecords.length)} رکورد اپراتور`, ok: d.stepRecords.length > 0 },
              { label: d.firmwareVersion ? `FW ${d.firmwareVersion}` : 'FW —', ok: !!d.firmwareVersion },
              { label: `${faInt(d.tests.length)} تست`, ok: d.tests.length > 0 },
              { label: `${faInt(d.releases.length)} آزادسازی`, ok: d.releases.length > 0 },
              { label: d.customer?.name ?? 'تحویل: —', ok: !!d.deliveredAt },
              { label: `گارانتی: ${WARRANTY_STATUS[d.warranty.status]?.label ?? d.warranty.status}`, ok: d.warranty.status === 'IN_WARRANTY' },
              { label: `${faInt(d.repairs.length)} تعمیر`, ok: d.repairs.length > 0 },
            ].map((link, i, arr) => (
              <React.Fragment key={i}>
                <span className={cn('rounded-md border px-1.5 py-0.5', link.ok ? 'bg-white border-teal-200 text-teal-800' : 'bg-muted/60 text-muted-foreground')}>{link.label}</span>
                {i < arr.length - 1 && <span className="text-muted-foreground">←</span>}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Section title="مشخصات دستگاه" icon={<Cpu className="w-4 h-4" />}>
          <InfoGrid cols={2}>
            <Field label="شماره سریال" value={<span className="font-mono tnum">{d.serial}</span>} />
            <Field label="وضعیت" value={<StatusBadge map={DEVICE_STATUS} value={d.status} />} />
            <Field label="محصول" value={`${d.product.code} — ${d.product.name}`} />
            <Field label="نسخه محصول" value={`نسخه ${d.productRevision.revision}`} />
            <Field label="BOM تولید" value={d.bom ? `نسخه ${faInt(d.bom.revision)} (${d.bom.status === 'ACTIVE' ? 'فعال' : 'بازنشسته'})` : '—'} />
            <Field label="سفارش تولید" value={d.order ? <button className="text-teal-700 hover:underline tnum" onClick={() => navigate('order-detail', { id: d.order!.id })}>{d.order.code}</button> : '—'} />
            <Field label="تاریخ تولید" value={<DateCell date={d.producedAt} withTime />} />
            <Field label="Firmware" value={d.firmwareVersion ? <span className="inline-flex items-center gap-1.5 tnum">{d.firmwareVersion}{d.programVerified ? <span className="text-emerald-700 font-semibold text-xs inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden="true" />تأیید‌شده</span> : <span className="text-amber-700 text-xs">تأیید‌نشده</span>}</span> : 'ثبت نشده'} />
            <Field label="Software" value={d.softwareVersion ?? '—'} />
            <Field label="روش پروگرام" value={d.programMethod ?? '—'} />
            <Field label="تاریخ پروگرام" value={<DateCell date={d.programmedAt} withTime />} />
            <Field label="خط تولید" value={d.order?.productionLine ?? '—'} />
          </InfoGrid>
        </Section>

        <Section title="تحویل و گارانتی" icon={<ShieldCheck className="w-4 h-4" />}>
          <InfoGrid cols={2}>
            <Field label="مشتری" value={d.customer?.name ?? '—'} />
            <Field label="تاریخ تحویل" value={<DateCell date={d.deliveredAt} withTime />} />
            <Field label="سند تحویل" value={d.deliveryNote ?? '—'} />
            <Field label="مدت گارانتی محصول" value={`${faInt(d.product.warrantyMonths)} ماه`} />
          </InfoGrid>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <StatusBadge map={WARRANTY_STATUS} value={d.warranty.status} />
              <span className="text-[11px] text-muted-foreground">{d.warranty.source === 'override' ? 'تغییر دستیِ کنترل‌شده (ثبت‌شده در ردّ تغییرات)' : 'محاسبه‌شده به‌صورت خودکار از تاریخ تحویل'}</span>
            </div>
            {d.warranty.reason && <div className="text-xs text-muted-foreground mt-1.5">{d.warranty.reason}</div>}
          </div>
        </Section>

        <Section title="آزادسازی" icon={<ClipboardCheck className="w-4 h-4" />}>
          {d.releases.length === 0 && <div className="text-sm text-muted-foreground">این دستگاه هنوز آزادسازی نشده است.</div>}
          {d.releases.map((r) => (
            <div key={r.id} className="space-y-1.5 border rounded-lg p-3">
              <div className="flex justify-between"><span className="text-sm font-medium">{r.releasedBy}</span><DateCell date={r.releasedAt} withTime /></div>
              {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
              {(() => {
                try {
                  const parsed = typeof r.checks === 'string' ? JSON.parse(r.checks) : r.checks
                  if (!parsed) return null
                  const entries = Array.isArray(parsed)
                    ? (parsed as { key: string; pass: boolean }[]).map((c) => [c.key, c.pass] as const)
                    : Object.entries(parsed as Record<string, boolean>)
                  return (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entries.map(([key, pass]) => (
                        <span key={key} className={cn('text-[10px] rounded px-1 py-0.5 border', pass ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700')}>{key}</span>
                      ))}
                    </div>
                  )
                } catch { return null }
              })()}
            </div>
          ))}
        </Section>
      </div>

      <Tabs defaultValue="trace">
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="trace" className="gap-1.5"><Link2 className="w-3.5 h-3.5" aria-hidden="true" /> زنجیره ردیابی</TabsTrigger>
          <TabsTrigger value="tests" className="gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" /> تست‌ها ({faInt(d.tests.length)})</TabsTrigger>
          <TabsTrigger value="steps" className="gap-1.5"><Factory className="w-3.5 h-3.5" aria-hidden="true" /> اپراتور و مراحل ({faInt(d.stepRecords.length)})</TabsTrigger>
          <TabsTrigger value="parts" className="gap-1.5"><Wrench className="w-3.5 h-3.5" aria-hidden="true" /> قطعات و لات‌ها ({faInt(d.partUsages.length)})</TabsTrigger>
          <TabsTrigger value="service" className="gap-1.5"><PackageCheck className="w-3.5 h-3.5" aria-hidden="true" /> خدمات ({faInt(d.tickets.length)})</TabsTrigger>
          <TabsTrigger value="quality" className="gap-1.5"><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" /> کیفیت ({faInt(d.ncrs.length + d.complaints.length)})</TabsTrigger>
          <TabsTrigger value="docs" className="gap-1.5"><FileText className="w-3.5 h-3.5" aria-hidden="true" /> اسناد ({faInt(d.documents.length)})</TabsTrigger>
        </TabsList>

        {/* ردیابی دوسویه */}
        <TabsContent value="trace" className="mt-3">
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="خط زمانی رویداد‌های دستگاه" desc="از تولید تا آخرین رویداد">
              <Timeline items={[
                { title: 'ایجاد رکورد دستگاه (شماره سریال)', time: d.createdAt, tone: 'info' },
                ...(d.programmedAt ? [{ title: `پروگرام Firmware ${d.firmwareVersion}`, time: d.programmedAt, tone: 'info', body: `روش: ${d.programMethod ?? '—'}` }] : []),
                ...(d.producedAt ? [{ title: 'تکمیل تولید', time: d.producedAt, tone: 'info' }] : []),
                ...d.tests.filter((t) => !t.retestOfId && !t.passed).map((t) => ({ title: `تست ناموفق: ${t.name}`, time: t.createdAt, tone: 'danger' as const, body: `مقدار ${t.actualValue} در برابر ${t.criteria}` })),
                ...d.tests.filter((t) => t.retestOfId).map((t) => ({ title: `Retest: ${t.name} — ${t.passed ? 'PASS' : 'FAIL'}`, time: t.createdAt, tone: (t.passed ? 'success' : 'danger') as 'success' | 'danger' })),
                ...d.reworks.map((r) => ({ title: `Rework: ${r.action}`, time: r.performedAt, tone: 'warning' as const, body: r.performedBy })),
                ...d.releases.map((r) => ({ title: 'آزادسازی محصول', time: r.releasedAt, tone: 'success' as const, body: `توسط ${r.releasedBy}` })),
                ...(d.deliveredAt ? [{ title: `تحویل به ${d.customer?.name ?? 'مشتری'}`, time: d.deliveredAt, tone: 'success' as const, body: d.deliveryNote ?? undefined }] : []),
                ...d.repairs.map((r) => ({ title: `تعمیر ${r.code} — ${REPAIR_RESULT[r.result]?.label ?? r.result}`, time: r.performedAt, tone: 'info' as const, body: `${r.technician}: ${r.action}` })),
              ].sort((a, b) => new Date(a.time ?? 0).getTime() - new Date(b.time ?? 0).getTime())} />
            </Section>

            <div className="space-y-4">
              <Section title="ردیابی معکوس لات‌ها" desc="دستگاه ← لاتِ قطعه؛ از هر لات می‌توان سایر دستگاه‌های مشترک را ردیابی کرد">
                {d.lotSiblings.length === 0 && d.partUsages.filter((u) => u.lotNumber).length === 0 && <div className="text-sm text-muted-foreground">لات ثبت‌شده‌ای برای این دستگاه وجود ندارد.</div>}
                <div className="space-y-2.5">
                  {d.partUsages.filter((u) => u.lotNumber).map((u, i) => (
                    <div key={i} className="rounded-lg border p-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono text-xs tnum">{u.component.code}</span>
                        <span className="text-[13px]">{u.component.name}</span>
                        <span className="text-[11px] text-muted-foreground tnum">لات {u.lotNumber} · {faInt(u.qty)} عدد · {u.source === 'PRODUCTION' ? 'تولید' : 'سرویس'} · {u.usedBy}</span>
                      </div>
                      {(() => {
                        const sib = d.lotSiblings.find((s) => s.lotNumber === u.lotNumber)
                        return sib && sib.devices.length > 0 ? (
                          <div className="text-[11px] text-muted-foreground mt-1.5 flex flex-wrap items-center gap-1">
                            <span>همین لات در دستگاه‌های:</span>
                            {sib.devices.map((s) => <span key={s} className="font-mono tnum bg-muted rounded px-1">{s}</span>)}
                          </div>
                        ) : null
                      })()}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="قطعات BOM استفاده‌شده" desc={d.bom ? `BOM نسخه ${faInt(d.bom.revision)} — ${faInt(d.bom.items.length)} قلم` : '—'}>
                <div className="space-y-1.5">
                  {(d.bom?.items ?? []).map((item, i) => (
                    <div key={i} className="flex flex-wrap gap-2 text-xs border rounded-lg px-2.5 py-1.5">
                      <span className="font-mono tnum">{item.component.code}</span>
                      <span>{item.component.name}</span>
                      <span className="text-muted-foreground mr-auto">{item.component.manufacturer ?? ''} · {item.component.supplier?.name ?? ''}</span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tests" className="mt-3">
          <Section title="نتایج تست این دستگاه" desc="سوابق تغییرناپذیرند — تست‌های مجدد به‌صورت زنجیره‌ای ثبت می‌شوند">
            <div className="space-y-2">
              {d.tests.map((t) => (
                <div key={t.id} className={cn('rounded-lg border p-3', t.passed ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-200 bg-rose-50/30', t.retestOfId && 'border-dashed')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{t.name}</span>
                    <StatusBadge map={QC_STAGE} value={t.stage} />
                    {t.passed ? <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden="true" />PASS</span> : <span className="text-xs font-bold text-rose-700 inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" aria-hidden="true" />FAIL</span>}
                    {t.retestOfId && <span className="text-[10px] text-teal-700 border border-teal-200 rounded px-1">Retest</span>}
                    <span className="text-[11px] text-muted-foreground mr-auto"><DateCell date={t.createdAt} withTime /></span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-4">
                    <span>{t.parameterName}: <b className="tnum">{t.actualValue}</b> {t.unit} (معیار: {t.criteria})</span>
                    <span>اپراتور: {t.operator}</span>
                    {t.verifier && <span>تأیید: {t.verifier}</span>}
                    {t.equipment && <span className={t.equipment.calibrationStatus === 'OVERDUE' ? 'text-rose-600' : ''}>تجهیز: {t.equipment.name}</span>}
                  </div>
                  {t.notes && <div className="text-[11px] text-muted-foreground mt-1">{t.notes}</div>}
                </div>
              ))}
              {d.tests.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">تستی ثبت نشده است</div>}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="steps" className="mt-3">
          <Section title="رکورد‌های اپراتور (چه کسی، کِی، با چه نتیجه‌ای)">
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/70 text-xs text-muted-foreground">
                  <th className="text-right px-3 py-2">مرحله</th><th className="text-right px-3 py-2">اپراتور</th>
                  <th className="text-right px-3 py-2">شروع</th><th className="text-right px-3 py-2">پایان</th>
                  <th className="text-right px-3 py-2">نتیجه</th><th className="text-right px-3 py-2">یادداشت</th>
                </tr></thead>
                <tbody>
                  {d.stepRecords.sort((a, b) => a.stepIndex - b.stepIndex).map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2 text-[13px]">{faInt(r.stepIndex)}. {r.step}</td>
                      <td className="px-3 py-2 text-xs">{r.operator}</td>
                      <td className="px-3 py-2"><DateCell date={r.startedAt} withTime /></td>
                      <td className="px-3 py-2"><DateCell date={r.finishedAt} withTime /></td>
                      <td className="px-3 py-2">{r.result === 'DONE' ? <span className="text-emerald-700 text-xs">انجام‌شده</span> : r.result === 'FAIL' ? <span className="text-rose-700 text-xs">ناموفق</span> : <span className="text-muted-foreground text-xs">صرف‌نظر‌شده</span>}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.stepRecords.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">رکوردی ثبت نشده است</div>}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="parts" className="mt-3">
          <Section title="قطعات مصرف‌شده در این دستگاه" desc="شامل قطعات تولید (BOM) و قطعات تعویض‌شده در سرویس">
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/70 text-xs text-muted-foreground">
                  <th className="text-right px-3 py-2">قطعه</th><th className="text-right px-3 py-2">لات</th>
                  <th className="text-right px-3 py-2">تعداد</th><th className="text-right px-3 py-2">منبع</th>
                  <th className="text-right px-3 py-2">کاربر</th><th className="text-right px-3 py-2">تاریخ</th>
                </tr></thead>
                <tbody>
                  {d.partUsages.map((u, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-3 py-2"><span className="font-mono text-xs tnum">{u.component.code}</span> <span className="text-[13px]">{u.component.name}</span></td>
                      <td className="px-3 py-2 font-mono text-xs tnum">{u.lotNumber ?? '—'}</td>
                      <td className="px-3 py-2 tnum">{faInt(u.qty)}</td>
                      <td className="px-3 py-2 text-xs">{u.source === 'PRODUCTION' ? 'تولید' : 'سرویس'}</td>
                      <td className="px-3 py-2 text-xs">{u.usedBy}</td>
                      <td className="px-3 py-2"><DateCell date={u.usedAt} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.partUsages.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">قطعه‌ای ثبت نشده است</div>}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="service" className="mt-3">
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="تیکت‌های خدمات" icon={<Wrench className="w-4 h-4" />}>
              <div className="space-y-2">
                {d.tickets.map((t) => (
                  <div key={t.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs tnum text-teal-700">{t.code}</span>
                      <StatusBadge map={TICKET_STATUS} value={t.status} />
                      <span className="text-[11px] text-muted-foreground mr-auto"><RelDate date={t.receivedAt} /></span>
                    </div>
                    <div className="text-[13px] mt-1">{t.problem}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{t.customer} · تکنسین: {t.technician ?? 'ارجاع نشده'}</div>
                  </div>
                ))}
                {d.tickets.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">تیکتی ثبت نشده است</div>}
              </div>
            </Section>

            <Section title="تعمیرات و قطعات تعویض‌شده">
              <div className="space-y-2.5">
                {d.repairs.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs tnum">{r.code}</span>
                      <StatusBadge map={REPAIR_RESULT} value={r.result} />
                      <span className="text-[11px] text-muted-foreground mr-auto">{r.technician} · <DateCell date={r.performedAt} /></span>
                    </div>
                    {r.diagnosis && <div className="text-xs"><b>تشخیص:</b> {r.diagnosis}</div>}
                    {r.failureMode && <div className="text-xs"><b>حالت خرابی:</b> {r.failureMode} — <b>علت:</b> {r.rootCause ?? '—'}</div>}
                    <div className="text-xs"><b>اقدام:</b> {r.action}</div>
                    {r.parts.length > 0 && (
                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                        {r.parts.map((p, i) => <div key={i}>· {p.component} {p.lotNumber ? `(لات ${p.lotNumber})` : ''} ×{faInt(p.qty)}{p.oldPart ? ` — قبلی: ${p.oldPart}` : ''}</div>)}
                      </div>
                    )}
                  </div>
                ))}
                {d.repairs.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">تعمیری ثبت نشده است</div>}
              </div>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="quality" className="mt-3">
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="عدم انطباق‌های دستگاه">
              <div className="space-y-2">
                {d.ncrs.map((n) => (
                  <div key={n.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs tnum">{n.code}</span>
                      <StatusBadge map={NCR_STATUS} value={n.status} />
                      <StatusBadge map={SEVERITY} value={n.severity} />
                    </div>
                    <div className="text-[13px] mt-1">{n.title}</div>
                  </div>
                ))}
                {d.ncrs.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">عدم انطباقی ثبت نشده است</div>}
              </div>
            </Section>
            <Section title="شکایات مرتبط">
              <div className="space-y-2">
                {d.complaints.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs tnum">{c.code}</span>
                      <StatusBadge map={COMPLAINT_STATUS} value={c.status} />
                      <StatusBadge map={SEVERITY} value={c.severity} />
                    </div>
                    <div className="text-xs mt-1 leading-relaxed">{c.description}</div>
                  </div>
                ))}
                {d.complaints.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">شکایتی ثبت نشده است</div>}
              </div>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="docs" className="mt-3">
          <Section title="اسناد مرتبط" icon={<FileText className="w-4 h-4" />}>
            <div className="space-y-2">
              {d.documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-[13px]">{doc.name}</span>
                  <span className="text-[11px] text-muted-foreground tnum">نسخه {faInt(doc.revision)} · {doc.status === 'ACTIVE' ? 'فعال' : 'بازنشسته'}</span>
                  <a className="text-xs text-teal-700 hover:underline mr-auto" href={`/api/documents/${doc.id}?file=1`} target="_blank" rel="noreferrer">دانلود</a>
                </div>
              ))}
              {d.documents.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">سندی ثبت نشده است</div>}
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
