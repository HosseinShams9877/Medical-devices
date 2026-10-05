import { NextRequest, NextResponse } from 'next/server'
import { requirePerm, withApi, faError } from '@/lib/api'
import { buildTemplate, TEMPLATE_LABELS, type TemplateType } from '@/lib/excel-export'

// ─── GET /api/excel/template?type=… — دانلود قالب خالی ورود داده ───
export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'excel.import')
  const type = (req.nextUrl.searchParams.get('type') ?? '') as TemplateType
  if (!(type in TEMPLATE_LABELS)) throw faError('نوع قالب نامعتبر است.')

  const buffer = await buildTemplate(type)
  const fileName = `template-${type}.xlsx`
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Content-Length': String(buffer.length),
    },
  })
})
