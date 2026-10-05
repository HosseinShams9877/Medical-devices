import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, withApi, ok, faError } from '@/lib/api'
import { readFile } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'upload')

export const GET = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('documents.view')) throw faError('مجوز ندارید.', 403)
  const { id } = await ctx.params
  const doc = await db.document.findUnique({ where: { id }, include: { uploader: { select: { fullName: true, role: true } } } })
  if (!doc) throw faError('سند یافت نشد.', 404)

  // دانلود فایل — مسیر از دیتابیس، جلوگیری از Path Traversal
  if (req.nextUrl.searchParams.get('file') === '1') {
    if (!doc.fileName) throw faError('این سند فایل فیزیکی ندارد.')
    const safe = path.basename(doc.fileName)
    const filePath = path.join(UPLOAD_DIR, safe)
    try {
      const buf = await readFile(filePath)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': doc.mimeType ?? 'application/octet-stream',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.origName ?? safe)}`,
        },
      })
    } catch {
      throw faError('فایل روی سرور یافت نشد.')
    }
  }

  return ok({ document: doc })
})
