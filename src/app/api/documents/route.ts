import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePerm, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = path.join(process.cwd(), 'upload')
const MAX_SIZE = 10 * 1024 * 1024 // ۱۰ مگابایت
const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
  'text/csv': '.csv',
}

export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'documents.view')
  const sp = req.nextUrl.searchParams
  const entityType = sp.get('entityType') || undefined
  const docType = sp.get('docType') || undefined
  const q = sp.get('q') || undefined
  const documents = await db.document.findMany({
    where: {
      ...(entityType ? { entityType } : {}),
      ...(docType ? { docType } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { entityCode: { contains: q } }] } : {}),
    },
    include: { uploader: { select: { fullName: true, role: true } } },
    orderBy: { uploadedAt: 'desc' },
  })
  return ok({ documents })
})

// ─── POST /api/documents — بارگذاری فایل (کنترل نوع و حجم) ───
export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'documents.upload')
  const form = await req.formData().catch(() => null)
  if (!form) throw faError('درخواست نامعتبر است.')

  const file = form.get('file') as File | null
  const name = String(form.get('name') ?? '')
  const docType = String(form.get('docType') ?? 'OTHER')
  const entityType = (form.get('entityType') as string) || null
  const entityId = (form.get('entityId') as string) || null
  const entityCode = (form.get('entityCode') as string) || null
  const notes = (form.get('notes') as string) || null
  const supersedesId = (form.get('supersedesId') as string) || null

  if (!file || typeof file === 'string') throw faError('فایلی انتخاب نشده است.')
  if (file.size === 0) throw faError('فایل خالی است.')
  if (file.size > MAX_SIZE) throw faError('حجم فایل بیش از حد مجاز (۱۰ مگابایت) است.')
  if (!ALLOWED_MIME[file.type]) throw faError('نوع فایل مجاز نیست. فرمت‌های مجاز: PDF، تصاویر (PNG/JPG/WebP)، Word، Excel، CSV، TXT.')
  if (!name || name.length < 3) throw faError('نام سند الزامی است.')

  const device = await db.device.findFirst({ where: { id: entityId ?? 'x' } })
  if (entityType === 'DEVICE' && !device) throw faError('دستگاه مرتبط یافت نشد.')

  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })
  const fileName = `${randomUUID()}${ALLOWED_MIME[file.type]}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(UPLOAD_DIR, fileName), buffer)

  let revision = 1
  let oldDoc = null
  if (supersedesId) {
    oldDoc = await db.document.findUnique({ where: { id: supersedesId } })
    if (!oldDoc) throw faError('سند قبلی یافت نشد.')
    if (oldDoc.status === 'SUPERSEDED') throw faError('این سند قبلاً بازنشسته شده است.')
    revision = oldDoc.revision + 1
  }

  const doc = await db.document.create({
    data: {
      name, docType, entityType, entityId, entityCode, notes,
      fileName, origName: file.name, mimeType: file.type, sizeBytes: file.size,
      revision, status: 'ACTIVE', supersedesId,
      uploadedById: user.id,
    },
  })
  // سند قبلی بازنشسته می‌شود (بدون Overwrite)
  if (oldDoc) {
    await db.document.update({ where: { id: oldDoc.id }, data: { status: 'SUPERSEDED' } })
  }

  await audit(req, user, 'DOCUMENT_UPLOAD', {
    entityType: 'DOCUMENT', entityId: doc.id, entityCode: doc.name,
    newValues: { docType, size: file.size, revision, supersedes: oldDoc?.name, linkedEntity: entityCode },
  })
  return ok({ document: doc })
})
