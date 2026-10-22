'use client'
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiUpload } from './api'
import { IMPORT_FIELDS, type ImportKind, type ImportRow } from '@/lib/import-fields'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Plan = { rows: ImportRow[]; digest: string; canCommit: boolean; totals: { created: number; updated: number; skipped: number; errors: number }; success?: boolean }
type Sheet = { name: string; rowCount: number; preview: string[][] }
export default function CatalogImportDialog({ kind, open, onOpenChange }: { kind: ImportKind; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const [file, setFile] = React.useState<File | null>(null)
  const [sheets, setSheets] = React.useState<Sheet[]>([])
  const [sheet, setSheet] = React.useState('')
  const [headerRow, setHeaderRow] = React.useState(1)
  const [mapping, setMapping] = React.useState<Record<string, number>>({})
  const [replace, setReplace] = React.useState(false)
  const [createUnknown, setCreateUnknown] = React.useState(false)
  const [excludedRows, setExcludedRows] = React.useState<number[]>([])
  const [plan, setPlan] = React.useState<Plan | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const selected = sheets.find(s => s.name === sheet)
  const headers = selected?.preview[headerRow - 1] ?? []
  const clear = () => { setPlan(null); setError('') }
  function chooseSheet(s: Sheet, row = 1) {
    setSheet(s.name); setHeaderRow(row); setExcludedRows([])
    const headers = s.preview[row - 1] ?? []
    setMapping(Object.fromEntries(IMPORT_FIELDS[kind].map(([key, label]) => [key, headers.findIndex(h => h.trim() === key || h.trim() === label.replace(' *', ''))])))
    clear()
  }
  async function inspect(f: File | null) {
    setFile(f); setSheets([]); setExcludedRows([]); clear()
    if (!f) return
    setBusy(true)
    try {
      const data = new FormData(); data.set('file', f); data.set('action', 'inspect')
      const result = await apiUpload<{ sheets: Sheet[] }>('/api/catalog-import', data)
      setSheets(result.sheets); if (result.sheets[0]) chooseSheet(result.sheets[0])
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function run(action: 'preview' | 'commit') {
    if (!file) return
    setBusy(true); setError('')
    try {
      const data = new FormData(); data.set('file', file); data.set('action', action)
      data.set('options', JSON.stringify({ kind, sheet, headerRow, mapping, replace, createUnknown, excludedRows }))
      if (plan) data.set('digest', plan.digest)
      const result = await apiUpload<Plan>('/api/catalog-import', data); setPlan(result)
      if (action === 'commit') {
        for (const key of ['products', 'product', 'inventory', 'components-min', 'customers', 'order-material-preview']) await qc.invalidateQueries({ queryKey: [key] })
      }
    } catch (e) { setError((e as Error).message); if (action === 'commit') setPlan(null) } finally { setBusy(false) }
  }
  function report() {
    if (!plan) return
    const blob = new Blob(['\ufeff' + JSON.stringify(plan, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `import-${kind}-report.json`; a.click(); URL.revokeObjectURL(url)
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>ورود اکسل — {kind === 'products' ? 'محصولات' : kind === 'bom' ? 'BOM' : 'مشتریان'}</DialogTitle></DialogHeader>
    <p className="text-sm">فایل xlsx تا ۵ مگابایت و ۲۰۰۰ ردیف. ابتدا ستون‌ها را تطبیق دهید و پیش‌نمایش بگیرید. فایل دارای خطا به‌صورت کامل رد می‌شود؛ ردیف مشکل‌دار را اصلاح یا صریحاً کنار بگذارید.</p>
    <a className="text-teal-700 underline" href={`/templates/${kind}.xlsx`} download>دانلود قالب نمونه و راهنمای ستون‌ها</a>
    <Input aria-label="فایل اکسل" type="file" accept=".xlsx" disabled={busy} onChange={e => inspect(e.target.files?.[0] ?? null)} />
    {!!sheets.length && <>
      <div className="flex gap-3"><label>شیت <select className="border rounded p-2" value={sheet} disabled={busy} onChange={e => chooseSheet(sheets.find(s => s.name === e.target.value)!)}>{sheets.map(s => <option key={s.name}>{s.name}</option>)}</select></label>
        <label>ردیف عنوان <Input className="w-24" type="number" min={1} max={8} value={headerRow} disabled={busy} onChange={e => chooseSheet(selected!, Number(e.target.value))} /></label></div>
      <div className="grid sm:grid-cols-2 gap-2">{IMPORT_FIELDS[kind].map(([key, label]) => <label key={key} className="flex items-center justify-between gap-2 text-sm">{label}<select aria-label={label} className="border rounded p-2 max-w-64" disabled={busy || plan?.success} value={mapping[key] ?? -1} onChange={e => { setMapping(m => ({ ...m, [key]: Number(e.target.value) })); clear() }}><option value={-1}>انتخاب نشده</option>{headers.map((h, i) => <option key={i} value={i}>{i + 1}: {h || 'بدون عنوان'}</option>)}</select></label>)}</div>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={replace} disabled={busy || plan?.success} onChange={e => { setReplace(e.target.checked); clear() }} />به‌روزرسانی صریح رکورد موجود؛ در BOM کل اقلام انتخابی به نسخه جدید تبدیل می‌شود.</label>
      {kind === 'bom' && <label className="flex gap-2 text-sm"><input type="checkbox" checked={createUnknown} disabled={busy || plan?.success} onChange={e => { setCreateUnknown(e.target.checked); clear() }} />ساخت صریح محصولات و قطعات ناشناخته با نام و واحد فایل؛ موجودی قطعات صفر است.</label>}
      {kind === 'customers' && <p className="text-xs">تلفن را با قالب Text وارد کنید؛ صفر ابتدا حفظ می‌شود. شماره عددی مبهم رد می‌شود. انتخاب مشتری هیچ تغییری در گارانتی یا وضعیت خدمت ایجاد نمی‌کند.</p>}
      <Button disabled={busy || !!plan?.success} onClick={() => run('preview')}>{busy ? 'در حال پردازش…' : 'اعتبارسنجی و پیش‌نمایش'}</Button>
    </>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {plan && <>
      <p role="status">{plan.success ? 'ثبت نهایی انجام شد' : 'پیش‌نمایش؛ هنوز چیزی ثبت نشده'} — جدید: {plan.totals.created} | به‌روزرسانی: {plan.totals.updated} | بدون تغییر: {plan.totals.skipped} | خطادار: {plan.totals.errors}</p>
      <div className="overflow-auto max-h-80"><table className="w-full text-xs"><thead><tr><th>انتخاب</th><th>ردیف اکسل</th><th>داده</th><th>عملیات</th><th>خطا / هشدار</th></tr></thead><tbody>{plan.rows.map(r => <tr key={r.row} className="border-b"><td><input type="checkbox" aria-label={`انتخاب ردیف ${r.row}`} checked={!excludedRows.includes(r.row)} disabled={busy || plan.success} onChange={() => { setExcludedRows(x => [...x, r.row]); clear() }} /></td><td>{r.row}</td><td className="p-2">{Object.entries(r.values).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' | ')}</td><td>{({ create: 'ایجاد', update: 'نسخه جدید / ویرایش', skip: 'بدون تغییر', error: 'خطا' })[r.action]}</td><td className="p-2 text-rose-700">{r.errors.join('؛ ')}<span className="text-amber-700">{r.warnings.join('؛ ')}</span></td></tr>)}</tbody></table></div>
      <div className="flex gap-2"><Button disabled={busy || !plan.canCommit || plan.success || plan.totals.created + plan.totals.updated === 0} onClick={() => run('commit')}>تأیید و ثبت نهایی</Button><Button variant="outline" onClick={report}>دانلود گزارش</Button></div>
    </>}
    {!!excludedRows.length && <Button variant="outline" disabled={busy} onClick={() => { setExcludedRows([]); clear() }}>بازگرداندن {excludedRows.length} ردیف کنارگذاشته‌شده</Button>}
  </DialogContent></Dialog>
}
