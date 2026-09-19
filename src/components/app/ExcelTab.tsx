'use client'

// ═════════════════════════════════════════════════════════════
// ExcelTab — ورود/خروج دادهٔ اکسل (جادوگر: بازرسی ← انتخاب ← ورود)
// توجه: برچسب‌ها اینجا تعریف شده‌اند تا exceljs وارد باندل کلاینت نشود
// ═════════════════════════════════════════════════════════════
import * as React from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiGet, apiUpload } from './api'
import { useApp } from './store'
import { PageHeader, Section, KpiCard, StatusBadge } from './ui-bits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import {
  FileSpreadsheet, UploadCloud, Download, FileDown, CheckCircle2, AlertTriangle,
  Loader2, RotateCcw, Layers, Package, Boxes, Cpu, Truck, Users2, ScrollText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'

type SheetKind = 'SUPPLIERS' | 'COMPONENTS' | 'BOM' | 'DEVICES' | 'UNKNOWN'

const KIND_LABELS: Record<SheetKind, string> = {
  SUPPLIERS: 'تأمین‌کنندگان',
  COMPONENTS: 'موجودی انبار',
  BOM: 'BOM محصول',
  DEVICES: 'سوابق تولید',
  UNKNOWN: 'نامشخص',
}

const KIND_ICONS: Record<SheetKind, React.ReactNode> = {
  SUPPLIERS: <Truck className="w-4 h-4" aria-hidden="true" />,
  COMPONENTS: <Boxes className="w-4 h-4" aria-hidden="true" />,
  BOM: <Layers className="w-4 h-4" aria-hidden="true" />,
  DEVICES: <Cpu className="w-4 h-4" aria-hidden="true" />,
  UNKNOWN: <AlertTriangle className="w-4 h-4" aria-hidden="true" />,
}

interface SheetInfo {
  name: string
  kind: SheetKind
  dataRows: number
  hasAfterSales: boolean
  preview: string[][]
  warnings: string[]
}

interface InspectResult {
  fileName: string
  sheets: SheetInfo[]
}

interface SheetReport {
  sheet: string
  kind: SheetKind
  created: number
  updated: number
  skipped: number
  warnings: string[]
  errors: string[]
}

interface ImportResult {
  fileName: string
  totals: { created: number; updated: number; skipped: number }
  reports: SheetReport[]
}

interface Choice {
  sheet: string
  selected: boolean
  productCode: string
  productName: string
  importAfterSales: boolean
  createStubs: boolean
  createDeviceStubs: boolean
}

// حدس محصول مقصد از نام شیت (اکسان1/خلوص سنج پرتابل → OXAN-1 و…)
function guessProduct(sheetName: string): string {
  const s = sheetName.replace(/\u200c/g, '')
  if (/دیوار|پرو|pro/i.test(s)) return 'OXAN-Pro'
  if (/پرتابل|اکسان\s*1|اکسان1|oxan.?1/i.test(s)) return 'OXAN-1'
  if (/کاف|cuff/i.test(s)) return 'SMART-CUFF'
  if (/hc1|hc-?1/i.test(s)) return 'HC1'
  return ''
}

export default function ExcelTab() {
  const { can } = useApp()
  const [file, setFile] = React.useState<File | null>(null)
  const [inspect, setInspect] = React.useState<InspectResult | null>(null)
  const [choices, setChoices] = React.useState<Record<string, Choice>>({})
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const { data: productsData } = useQuery({
    queryKey: ['excel-products'],
    queryFn: () => apiGet<{ products: { code: string; name: string }[] }>('/api/products'),
  })
  const products = productsData?.products ?? []

  const inspectMut = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData()
      fd.append('file', f)
      return apiUpload<InspectResult>('/api/excel/inspect', fd)
    },
    onSuccess: (data) => {
      setInspect(data)
      setResult(null)
      const init: Record<string, Choice> = {}
      for (const s of data.sheets) {
        if (s.kind === 'UNKNOWN') continue
        const guess = guessProduct(s.name)
        init[s.name] = {
          sheet: s.name,
          selected: true,
          productCode: guess,
          productName: guess,
          importAfterSales: s.hasAfterSales,
          createStubs: true,
          createDeviceStubs: true,
        }
      }
      setChoices(init)
    },
    onError: () => setInspect(null),
  })

  const importMut = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('no file')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('choices', JSON.stringify(Object.values(choices).filter((c) => c.selected)))
      return apiUpload<ImportResult>('/api/excel/import', fd)
    },
    onSuccess: (data) => {
      setResult(data)
      toast({ title: 'ورود داده انجام شد', description: `${faInt(data.totals.created)} رکورد جدید و ${faInt(data.totals.updated)} به‌روزرسانی.` })
    },
  })

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) {
      toast({ title: 'فایل نامعتبر', description: 'فقط فایل‌های Excel (xlsx) پذیرفته می‌شوند.', variant: 'destructive' })
      return
    }
    setFile(f)
    setInspect(null)
    setResult(null)
    inspectMut.mutate(f)
  }

  function reset() {
    setFile(null)
    setInspect(null)
    setResult(null)
    setChoices({})
    if (inputRef.current) inputRef.current.value = ''
  }

  function setChoice(sheet: string, patch: Partial<Choice>) {
    setChoices((prev) => ({ ...prev, [sheet]: { ...prev[sheet], ...patch } }))
  }

  const selectedSheets = Object.values(choices).filter((c) => c.selected)

  return (
    <div className="space-y-4">
      <PageHeader
        title="ورود / خروج اکسل"
        desc="انتقال مستقیم داده‌ها بین فایل‌های Excel و سامانه — با تشخیص هوشمند ساختار و گزارش شفاف"
      />

      {can('excel.import') && (
        <Section title="ورود داده از فایل اکسل" icon={<UploadCloud className="w-4 h-4" aria-hidden="true" />}>
          {/* ناحیهٔ انتخاب فایل */}
          {!inspect && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]) }}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-all cursor-pointer',
                dragOver ? 'border-teal-500 bg-teal-50/50 scale-[1.01]' : 'border-border hover:border-teal-400/60 hover:bg-muted/40',
              )}
            >
              {inspectMut.isPending ? (
                <>
                  <Loader2 className="w-10 h-10 text-teal-600 animate-spin" aria-hidden="true" />
                  <p className="text-sm font-medium">در حال تحلیل ساختار فایل…</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-teal-500/20">
                    <FileSpreadsheet className="w-7 h-7 text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-semibold">فایل Excel را اینجا ر‌ها کنید یا کلیک کنید</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      انبار، تأمین‌کنندگان، BOM و سوابق تولید — ساختار فایل خودکار تشخیص داده می‌شود
                    </p>
                  </div>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
          )}

          {/* انتخاب شیت‌ها و گزینه‌ها */}
          {inspect && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  <span className="font-medium">{inspect.fileName}</span>
                  <span className="text-muted-foreground">— {faInt(inspect.sheets.length)} شیت شناسایی شد</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> فایل دیگر
                  </Button>
                  <Button
                    size="sm"
                    disabled={importMut.isPending || !selectedSheets.length}
                    onClick={() => importMut.mutate()}
                    className="gap-1.5"
                  >
                    {importMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />}
                    شروع ورود ({faInt(selectedSheets.length)} شیت)
                  </Button>
                </div>
              </div>

              <div className="grid gap-3">
                {inspect.sheets.map((s) => {
                  const c = choices[s.name]
                  const disabled = s.kind === 'UNKNOWN'
                  return (
                    <div
                      key={s.name}
                      className={cn(
                        'rounded-xl border p-4 transition-all',
                        disabled ? 'opacity-50 border-dashed' : c?.selected ? 'border-teal-400/60 bg-teal-50/30' : 'border-border',
                      )}
                    >
                      <div className="flex items-start gap-3 flex-wrap">
                        <Checkbox
                          checked={!!c?.selected && !disabled}
                          disabled={disabled}
                          onCheckedChange={(v) => setChoice(s.name, { selected: !!v })}
                          className="mt-1"
                          aria-label={`انتخاب شیت ${s.name}`}
                        />
                        <div className="flex-1 min-w-[220px] space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{s.name}</span>
                            <StatusBadge
                              value={s.kind}
                              map={{
                                SUPPLIERS: { label: KIND_LABELS.SUPPLIERS, tone: 'info' },
                                COMPONENTS: { label: KIND_LABELS.COMPONENTS, tone: 'success' },
                                BOM: { label: KIND_LABELS.BOM, tone: 'warning' },
                                DEVICES: { label: KIND_LABELS.DEVICES, tone: 'danger' },
                                UNKNOWN: { label: KIND_LABELS.UNKNOWN, tone: 'neutral' },
                              }}
                            />
                            <span className="text-xs text-muted-foreground">{faInt(s.dataRows)} سطر داده</span>
                            {s.hasAfterSales && (
                              <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">شامل بلوک خدمات پس از فروش</span>
                            )}
                          </div>
                          {s.warnings.map((w, i) => (
                            <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" /> {w}
                            </p>
                          ))}
                          {s.preview.length > 0 && (
                            <div className="rounded-lg bg-muted/50 border overflow-x-auto">
                              <table className="w-full text-[11px]">
                                <tbody>
                                  {s.preview.map((row, i) => (
                                    <tr key={i} className="border-b last:border-0">
                                      {row.map((cell, j) => (
                                        <td key={j} className="px-2 py-1 whitespace-nowrap max-w-40 truncate" dir="auto">{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* گزینه‌های وابسته به نوع */}
                          {c?.selected && (s.kind === 'BOM' || s.kind === 'DEVICES') && (
                            <div className="grid sm:grid-cols-2 gap-3 pt-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs">
                                  {s.kind === 'BOM' ? 'محصول مقصد (کد)' : 'محصول مقصد *'}
                                </Label>
                                <Select value={c.productCode || '__new__'} onValueChange={(v) => {
                                  if (v === '__new__') {
                                    setChoice(s.name, { productCode: sheetDefaultCode(s.name), productName: '' })
                                  } else {
                                    const p = products.find((x) => x.code === v)
                                    setChoice(s.name, { productCode: v, productName: p?.name ?? v })
                                  }
                                }}>
                                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {products.map((p) => (
                                      <SelectItem key={p.code} value={p.code}>{p.code} — {p.name}</SelectItem>
                                    ))}
                                    <SelectItem value="__new__">＋ محصول جدید…</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">نام محصول (در صورت ساخت جدید)</Label>
                                <Input
                                  value={c.productName}
                                  onChange={(e) => setChoice(s.name, { productName: e.target.value })}
                                  placeholder="مثلاً خلوص‌سنج اکسیژن پرتابل"
                                  className="h-9"
                                />
                              </div>
                              {s.kind === 'BOM' && (
                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Checkbox checked={c.createStubs} onCheckedChange={(v) => setChoice(s.name, { createStubs: !!v })} />
                                  ساخت خودکار قطعه برای اقلام ناشناخته
                                </label>
                              )}
                              {s.kind === 'DEVICES' && (
                                <>
                                  {s.hasAfterSales && (
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Checkbox checked={c.importAfterSales} onCheckedChange={(v) => setChoice(s.name, { importAfterSales: !!v })} />
                                      ورود اطلاعات فروش/تحویل از این شیت
                                    </label>
                                  )}
                                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Checkbox checked={c.createDeviceStubs} onCheckedChange={(v) => setChoice(s.name, { createDeviceStubs: !!v })} />
                                    ساخت دستگاه برای سریال‌های فروشِ ناشناخته
                                  </label>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-teal-600">{KIND_ICONS[s.kind]}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* گزارش نتیجه */}
          {result && (
            <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
                <span className="font-semibold">ورود دادهٔ «{result.fileName}» با موفقیت انجام شد</span>
                <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 mr-auto">
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> ورود فایل جدید
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3 max-w-md">
                <KpiCard label="رکورد جدید" value={result.totals.created} tone="success" />
                <KpiCard label="به‌روزرسانی" value={result.totals.updated} tone="info" />
                <KpiCard label="رد‌شده" value={result.totals.skipped} tone="neutral" />
              </div>
              <div className="space-y-2">
                {result.reports.map((rep) => (
                  <details key={rep.sheet} className="rounded-lg border bg-card">
                    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm flex-wrap">
                      <span className="font-medium">{rep.sheet}</span>
                      <span className="text-xs text-muted-foreground">({KIND_LABELS[rep.kind]})</span>
                      <span className="text-xs">— {faInt(rep.created)} جدید / {faInt(rep.updated)} به‌روزرسانی / {faInt(rep.skipped)} رد</span>
                      {(rep.warnings.length > 0 || rep.errors.length > 0) && (
                        <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 mr-auto">
                          {faInt(rep.warnings.length + rep.errors.length)} اطلاع‌رسانی
                        </span>
                      )}
                    </summary>
                    <div className="px-4 pb-3 space-y-2 text-xs">
                      {rep.errors.map((e, i) => (
                        <p key={`e${i}`} className="text-red-600">✗ {e}</p>
                      ))}
                      {rep.warnings.map((w, i) => (
                        <p key={`w${i}`} className="text-amber-600">⚠ {w}</p>
                      ))}
                      {!rep.errors.length && !rep.warnings.length && (
                        <p className="text-emerald-600">بدون هشدار — همهٔ سطر‌ها با موفقیت پردازش شدند.</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {can('excel.export') && (
        <Section title="خروج داده به Excel" icon={<Download className="w-4 h-4" aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground -mt-1 mb-3">
            فایل‌های خروجی با سرستون فارسی، راست‌به‌چپ و تاریخ جلالی تولید می‌شوند.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {EXPORT_ITEMS.map((item) => (
              <button
                key={item.type}
                onClick={() => downloadExport(item.type)}
                className="group rounded-xl border p-4 text-right transition-all hover:border-teal-400/60 hover:shadow-md hover:shadow-teal-500/10 card-lift"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500/15 to-emerald-400/15 flex items-center justify-center text-teal-600">
                    {item.icon}
                  </span>
                  <span className="font-semibold text-sm">{item.label}</span>
                  <Download className="w-4 h-4 mr-auto text-muted-foreground group-hover:text-teal-600 transition-colors" aria-hidden="true" />
                </div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </button>
            ))}
          </div>
        </Section>
      )}

      {can('excel.import') && (
        <Section title="قالب‌های استاندارد ورود داده" icon={<FileDown className="w-4 h-4" aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground -mt-1 mb-3">
            اگر می‌خواهید داده را خودتان در فایل تمیز آماده کنید، از این قالب‌ها استفاده کنید — فایل‌های موجود شما با ساختار متفاوت هم از طریق «تشخیص هوشمند» پذیرفته می‌شوند.
          </p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_ITEMS.map((t) => (
              <Button key={t.type} variant="outline" size="sm" onClick={() => downloadTemplate(t.type)} className="gap-1.5">
                <FileDown className="w-3.5 h-3.5" aria-hidden="true" /> {t.label}
              </Button>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function sheetDefaultCode(sheetName: string): string {
  return sheetName.trim().slice(0, 24)
}

function downloadExport(type: string) {
  window.open(`/api/excel/export?type=${type}`, '_blank')
}

function downloadTemplate(type: string) {
  window.open(`/api/excel/template?type=${type}`, '_blank')
}

const EXPORT_ITEMS: { type: string; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'components', label: 'قطعات و موجودی', desc: 'کد، گروه، نام، موجودی، رزرو، لات‌ها', icon: <Boxes className="w-4.5 h-4.5" aria-hidden="true" /> },
  { type: 'suppliers', label: 'تأمین‌کنندگان', desc: 'کد، نام، وب‌سایت، کد ایزو', icon: <Truck className="w-4.5 h-4.5" aria-hidden="true" /> },
  { type: 'devices', label: 'دستگاه‌ها', desc: 'سریال، محصول، تاریخ تولید، وضعیت، مشتری', icon: <Cpu className="w-4.5 h-4.5" aria-hidden="true" /> },
  { type: 'customers', label: 'مشتریان', desc: 'کد، نام، شهر، نوع، تعداد دستگاه', icon: <Users2 className="w-4.5 h-4.5" aria-hidden="true" /> },
  { type: 'bom', label: 'BOM محصولات', desc: 'هر محصول یک شیت با اقلام و تعداد', icon: <Layers className="w-4.5 h-4.5" aria-hidden="true" /> },
  { type: 'movements', label: 'دفتر گردش کالا', desc: '۵۰۰۰ رویداد آخر با موجودی قبل/بعد', icon: <Package className="w-4.5 h-4.5" aria-hidden="true" /> },
  { type: 'audit', label: 'گزارش ممیزی (Audit Trail)', desc: '۵۰۰۰ رویداد آخر با کاربر، اقدام و مقادیر', icon: <ScrollText className="w-4.5 h-4.5" aria-hidden="true" /> },
  { type: 'backup', label: 'پشتیبان کامل داده', desc: 'همهٔ داده‌ها در یک فایل چندشیتی', icon: <FileSpreadsheet className="w-4.5 h-4.5" aria-hidden="true" /> },
]

const TEMPLATE_ITEMS: { type: string; label: string }[] = [
  { type: 'components', label: 'قالب قطعات و موجودی' },
  { type: 'suppliers', label: 'قالب تأمین‌کنندگان' },
  { type: 'bom', label: 'قالب BOM محصول' },
  { type: 'devices', label: 'قالب سوابق تولید' },
]
