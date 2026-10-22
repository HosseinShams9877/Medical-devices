import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePerm, withApi, ok, faError } from '@/lib/api'
import { readImportWorkbook, readMappedRows, optionsSchema, planImport, applyImport, kindPermissions } from '@/lib/catalog-import'
import { audit } from '@/lib/audit'

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'excel.import')
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string' || !file.name.toLowerCase().endsWith('.xlsx') || file.size === 0 || file.size > 5 * 1024 * 1024) throw faError('فایل xlsx غیرخالی تا ۵ مگابایت انتخاب کنید.')
  const workbook = await readImportWorkbook(Buffer.from(await file.arrayBuffer()))
  const action = form!.get('action')
  if (action === 'inspect') return ok({ sheets: workbook.worksheets.map(s => ({ name: s.name, rowCount: s.rowCount, preview: Array.from({ length: Math.min(s.rowCount, 8) }, (_, i) => Array.from({ length: s.columnCount }, (_, j) => s.getRow(i + 1).getCell(j + 1).text)) })) })
  if (action !== 'preview' && action !== 'commit') throw faError('اقدام ورود معتبر نیست.')
  let raw: unknown
  try { raw = JSON.parse(String(form!.get('options'))) } catch { throw faError('تنظیمات ورود معتبر نیست.') }
  const options = optionsSchema.parse(raw)
  for (const perm of kindPermissions(options.kind)) await requirePerm(req, perm)
  if (options.kind === 'bom' && options.createUnknown) { await requirePerm(req, 'product.manage'); await requirePerm(req, 'component.manage') }
  const rows = readMappedRows(workbook, options)
  if (action === 'preview') return ok(await planImport(db, rows, options))
  const result = await db.$transaction(async tx => {
    const plan = await planImport(tx, rows, options)
    if (plan.digest !== form!.get('digest')) throw faError('فایل، تنظیمات یا اطلاعات سیستم تغییر کرده است؛ پیش‌نمایش را دوباره بگیرید.', 409)
    if (!plan.canCommit) throw faError('فایل خطا دارد؛ هیچ اطلاعاتی ثبت نشد.', 422)
    const details = await applyImport(tx, plan.rows, options, user.id)
    return { rows: plan.rows, totals: plan.totals, details, success: true }
  }, { timeout: 30000 })
  await audit(req, user, 'CATALOG_EXCEL_IMPORT', { entityType: options.kind.toUpperCase(), newValues: { fileName: file.name, totals: result.totals, details: result.details } })
  return ok(result)
})
