import { NextRequest, NextResponse } from 'next/server'
import { requirePerm, withApi, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { buildExport, EXPORT_LABELS, type ExportType } from '@/lib/excel-export'

// ─── GET /api/excel/export?type=… — خروج داده به فایل Excel ───
export const GET = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'excel.export')
  const type = (req.nextUrl.searchParams.get('type') ?? '') as ExportType
  if (!(type in EXPORT_LABELS)) throw faError('نوع خروجی نامعتبر است.')

  const { buffer, count } = await buildExport(type)
  await audit(req, user, 'EXCEL_EXPORT', {
    entityType: 'Export',
    entityCode: type,
    newValues: { type, rows: count },
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const fileName = `${type}-${stamp}.xlsx`
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Content-Length': String(buffer.length),
    },
  })
})
