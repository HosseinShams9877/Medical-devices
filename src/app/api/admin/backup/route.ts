import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePerm, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { copyFile, mkdir, readdir, stat, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const DB_FILE = path.join(process.cwd(), 'db', 'custom.db')
const BACKUP_DIR = path.join(process.cwd(), 'backups')
const MAX_BACKUPS = 30

// ─── GET /api/admin/backup — فهرست پشتیبان‌ها / دانلود ───
export const GET = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'system.backup')
  const name = req.nextUrl.searchParams.get('name')

  // دانلود (فقط نام امن، جلوگیری از Path Traversal)
  if (name && req.nextUrl.searchParams.get('download') === '1') {
    const safe = path.basename(name)
    if (!/^[\w.-]+\.db$/.test(safe)) throw faError('نام فایل نامعتبر است.')
    const filePath = path.join(BACKUP_DIR, safe)
    if (!existsSync(filePath)) throw faError('فایل پشتیبان یافت نشد.')
    const { readFile } = await import('fs/promises')
    const buf = await readFile(filePath)
    await audit(req, user, 'BACKUP_DOWNLOAD', { entityType: 'SYSTEM', newValues: { file: safe } })
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${safe}"` },
    })
  }

  if (!existsSync(BACKUP_DIR)) return ok({ backups: [] })
  const files = await readdir(BACKUP_DIR)
  const backups: { name: string; size: number; createdAt: Date }[] = []
  for (const f of files) {
    if (!f.endsWith('.db')) continue
    const s = await stat(path.join(BACKUP_DIR, f))
    backups.push({ name: f, size: s.size, createdAt: s.mtime })
  }
  backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return ok({ backups })
})

// ─── POST /api/admin/backup — ایجاد پشتیبان ───
export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'system.backup')
  if (!existsSync(DB_FILE)) throw faError('فایل دیتابیس یافت نشد.')
  if (!existsSync(BACKUP_DIR)) await mkdir(BACKUP_DIR, { recursive: true })

  const stamp = new Date()
  const faStamp = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}-${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}${String(stamp.getSeconds()).padStart(2, '0')}`
  const fileName = `backup-${faStamp}.db`
  await copyFile(DB_FILE, path.join(BACKUP_DIR, fileName))

  // سیاست نگهداری: حداکثر ۳۰ نسخه
  const files = (await readdir(BACKUP_DIR)).filter((f) => f.endsWith('.db')).sort()
  while (files.length > MAX_BACKUPS) {
    const oldest = files.shift()
    if (oldest) await unlink(path.join(BACKUP_DIR, oldest))
  }

  const size = (await stat(path.join(BACKUP_DIR, fileName))).size
  await audit(req, user, 'BACKUP_CREATE', { entityType: 'SYSTEM', newValues: { file: fileName, size } })
  return ok({ success: true, fileName })
})
