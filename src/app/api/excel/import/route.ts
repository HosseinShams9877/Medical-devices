import { NextRequest } from 'next/server'
import { requirePerm, withApi, ok, faError } from '@/lib/api'
import { extractRows, inspectWorkbook, type SheetKind } from '@/lib/excel'
import { importSuppliers, importComponents, importBom, importDevices, type SheetImportOptions, type SheetReport } from '@/lib/excel-import'

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
    choices = JSON.parse(choicesRaw)
    if (!Array.isArray(choices)) throw new Error('bad')
  } catch {
    throw faError('گزینه‌های ورود داده معتبر نیستند.')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const inspected = await inspectWorkbook(buffer, file.name).catch(() => null)
  if (!inspected) throw faError('فایل Excel قابل خواندن نیست.')

  const reports: SheetReport[] = []
  for (const info of inspected.sheets) {
    const choice = choices.find((c) => c.sheet === info.name)
    if (!choice || !choice.selected || info.kind === 'UNKNOWN') continue
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
