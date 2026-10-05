import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requirePerm, withApi, ok, faError } from '@/lib/api'
import { extractRows, inspectWorkbook, type SheetKind } from '@/lib/excel'
import { importSuppliers, importComponents, importBom, importDevices, type SheetImportOptions, type SheetReport } from '@/lib/excel-import'
import { importDeviceRecords, LEGACY_PRODUCTS } from '@/lib/excel-device-records'
import { audit } from '@/lib/audit'
import { importMaterialRecords, MATERIAL_SHEETS } from '@/lib/excel-material-records'

const MAX_SIZE = 15 * 1024 * 1024

interface SheetChoice {
  sheet: string
  selected: boolean
  productCode?: string
  productName?: string
  importAfterSales?: boolean
  createStubs?: boolean
  createDeviceStubs?: boolean
}

// ─── POST /api/excel/import — ورود داده‌های انتخابی از فایل ───
export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'excel.import')
  const form = await req.formData().catch(() => null)
  if (!form) throw faError('درخواست نامعتبر است.')
  const file = form.get('file') as File | null
  const choicesRaw = String(form.get('choices') ?? '[]')
  if (!file || typeof file === 'string') throw faError('فایلی انتخاب نشده است.')
  if (file.size === 0 || file.size > MAX_SIZE) throw faError('حجم فایل نامعتبر است (حداکثر ۱۵ مگابایت).')
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) throw faError('فقط فایل‌های Excel (xlsx) پذیرفته می‌شوند.')

  let choices: SheetChoice[] = []
  try {
    choices = z.array(z.object({ sheet: z.string().min(1), selected: z.boolean(), productCode: z.string().max(100).optional(), productName: z.string().max(200).optional(), importAfterSales: z.boolean().optional(), createStubs: z.boolean().optional(), createDeviceStubs: z.boolean().optional() })).max(100).parse(JSON.parse(choicesRaw))
    if (!Array.isArray(choices)) throw new Error('bad')
  } catch {
    throw faError('گزینه‌های ورود داده معتبر نیستند.')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const inspected = await inspectWorkbook(buffer, file.name).catch(() => null)
  if (!inspected) throw faError('فایل Excel قابل خواندن نیست.')

  const reports: SheetReport[] = []
  const materialNames = inspected.sheets.filter((s) => choices.some((c) => c.selected && c.sheet === s.name) && MATERIAL_SHEETS.has(s.name.trim()) && ['COMPONENTS', 'BOM'].includes(s.kind)).map((s) => s.name)
  if (materialNames.length) {
    const materialReports = await importMaterialRecords(buffer, file.name, materialNames)
    for (const r of materialReports) reports.push({ sheet: r.sheet, kind: r.kind as SheetKind, created: r.created, updated: 0, skipped: r.duplicates, errors: [], warnings: [`${r.linked} ردیف به کالا متصل و ${r.review} ردیف نیازمند بررسی است. سوابق منبع ثبت شد؛ موجودی عملیاتی و نسخه فعال BOM تغییر نکرد.`] })
    await audit(req, user, 'EXCEL_IMPORT', { entityType: 'Component', entityCode: file.name, newValues: { materialReports } })
  }
  const legacyNames = inspected.sheets.filter((info) => {
    const choice = choices.find((c) => c.sheet === info.name)
    return choice?.selected && info.kind === 'DEVICES' && LEGACY_PRODUCTS[info.name.trim()]
  }).map((info) => info.name)
  if (legacyNames.length) {
    const archived = await importDeviceRecords(buffer, file.name, legacyNames, choices.filter((c) => c.importAfterSales !== false).map((c) => c.sheet))
    for (const x of archived) reports.push({
      sheet: x.sheet, kind: 'DEVICES', created: x.production + x.afterSales,
      updated: 0, skipped: x.duplicates,
      warnings: [
        `تولید: ${x.production}، خدمات: ${x.afterSales}، تکراری: ${x.duplicates}، سریال بدون پروندهٔ دستگاه: ${x.unmatched}.`,
        ...(x.invalidSerials.length ? [`سریال نامعتبر یا متنی (بایگانی شده): ${x.invalidSerials.join('؛ ')}`] : []),
      ], errors: [],
    })
    await audit(req, user, 'EXCEL_IMPORT', { entityType: 'Device', entityCode: file.name, newValues: { sourceRecords: archived } })
  }
  for (const info of inspected.sheets) {
    const choice = choices.find((c) => c.sheet === info.name)
    if (!choice || !choice.selected || info.kind === 'UNKNOWN') continue
    if (legacyNames.includes(info.name)) continue
    if (materialNames.includes(info.name)) continue
    const rows = await extractRows(buffer, info.name, info.headerRowIndex)
    const mapping = { ...info.mapping, afterSalesCol: info.afterSalesCol ?? -1 }
    const opts: SheetImportOptions = {
      sheet: info.name,
      headerRowIndex: info.headerRowIndex,
      kind: info.kind,
      headers: info.headers,
      productCode: choice.productCode,
      productName: choice.productName,
      importAfterSales: choice.importAfterSales ?? false,
      createStubs: choice.createStubs ?? true,
      createDeviceStubs: choice.createDeviceStubs ?? true,
    }
    let report: SheetReport
    if (info.kind === 'SUPPLIERS') {
      report = await importSuppliers(rows, mapping, info.name, user, req, file.name)
    } else if (info.kind === 'COMPONENTS') {
      report = await importComponents(rows, mapping, info.name, user, req, file.name)
    } else if (info.kind === 'BOM') {
      report = await importBom(rows, mapping, opts, user, req, file.name)
    } else {
      report = await importDevices(rows, mapping, info.headers, opts, user, req, file.name)
    }
    reports.push(report)
  }

  if (!reports.length) throw faError('هیچ شیت معتبری برای ورود انتخاب نشده است.')
  const totals = reports.reduce(
    (a, x) => ({ created: a.created + x.created, updated: a.updated + x.updated, skipped: a.skipped + x.skipped }),
    { created: 0, updated: 0, skipped: 0 },
  )
  return ok({ fileName: file.name, totals, reports })
})
