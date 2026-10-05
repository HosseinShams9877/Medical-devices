import { LEGACY_PRODUCTS } from '@/lib/excel-device-records'
import { MATERIAL_SHEETS } from '@/lib/excel-material-records'
import { NextRequest } from 'next/server'
import { requirePerm, withApi, ok, faError } from '@/lib/api'
import { inspectWorkbook } from '@/lib/excel'

const MAX_SIZE = 15 * 1024 * 1024 // ۱۵ مگابایت

// ─── POST /api/excel/inspect — تشخیص ساختار فایل قبل از ورود ───
export const POST = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'excel.import')
  const form = await req.formData().catch(() => null)
  if (!form) throw faError('درخواست نامعتبر است.')
  const file = form.get('file') as File | null
  if (!file || typeof file === 'string') throw faError('فایلی انتخاب نشده است.')
  if (file.size === 0) throw faError('فایل خالی است.')
  if (file.size > MAX_SIZE) throw faError('حجم فایل بیش از حد مجاز (۱۵ مگابایت) است.')
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) throw faError('فقط فایل‌های Excel (xlsx) پذیرفته می‌شوند.')

  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    const result = await inspectWorkbook(buffer, file.name)
    if (!result.sheets.length) throw new Error('no sheet')
    return ok({ ...result, sheets: result.sheets.map((s) => ({ ...s, sourceOnly: (s.kind === 'DEVICES' && !!LEGACY_PRODUCTS[s.name.trim()]) || (['COMPONENTS', 'BOM'].includes(s.kind) && MATERIAL_SHEETS.has(s.name.trim())) })) })
  } catch {
    throw faError('فایل Excel قابل خواندن نیست. فایل خراب یا رمزگذاری‌شده است.')
  }
})
