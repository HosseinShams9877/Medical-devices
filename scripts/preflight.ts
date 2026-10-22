import { uploadDirectory, backupDirectory } from '../src/lib/storage'
import { db } from '../src/lib/db'
import { verifyPassword } from '../src/lib/password'
import { access, mkdir, open, stat, unlink } from 'node:fs/promises'
import { constants, existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

async function main() {
  const errors: string[] = []
  const url = process.env.DATABASE_URL
  if (!url?.startsWith('file:') || url.includes(':memory:') || url.includes('?')) errors.push('DATABASE_URL must point to a persistent SQLite file without query parameters.')
  try {
    const origin = new URL(process.env.APP_ORIGIN || '')
    if (origin.protocol !== 'https:' || origin.origin !== process.env.APP_ORIGIN || origin.username || origin.password) throw new Error()
  } catch { errors.push('APP_ORIGIN must be an exact HTTPS origin, e.g. https://mes.example.com (no path or trailing slash).') }
  if (process.env.SESSION_COOKIE_SECURE !== 'true') errors.push('Set SESSION_COOKIE_SECURE=true in production.')
  if (!existsSync('.next/BUILD_ID')) errors.push('Run npm run build first.')
  const databaseFile = url?.startsWith('file:') ? path.resolve('prisma', url.slice(5)) : ''
  if (!databaseFile || !existsSync(databaseFile)) errors.push('The configured database file does not exist. Refusing to create an empty production database.')
  if (errors.length) throw new Error(errors.join('\n'))

  await access(databaseFile, constants.R_OK | constants.W_OK)
  for (const directory of [path.dirname(databaseFile), uploadDirectory(), backupDirectory()]) {
    await mkdir(directory, { recursive: true })
    const probe = path.join(directory, `.preflight-${randomUUID()}`)
    try { const handle = await open(probe, 'wx', 0o600); await handle.close() }
    finally { await unlink(probe).catch(() => {}) }
  }
  const users = await db.user.findMany({ where: { status: 'ACTIVE' }, select: { username: true, role: true, passwordHash: true } })
  if (!users.some(u => u.role === 'ADMIN')) errors.push('An active administrator is required.')
  for (const user of users) if (verifyPassword('demo1234', user.passwordHash)) errors.push(`Default demo password is active: ${user.username}`)
  const integrity = await db.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check')
  if (integrity.some(row => row.integrity_check !== 'ok')) errors.push('SQLite integrity check failed.')
  const foreignKeys = await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check')
  if (foreignKeys.length) errors.push(`SQLite contains ${foreignKeys.length} broken foreign-key references.`)
  const components = await db.component.findMany({ select: { stockQty: true, reservedQty: true } })
  if (components.some(c => !Number.isFinite(c.stockQty) || !Number.isFinite(c.reservedQty) || c.stockQty < 0 || c.reservedQty < 0)) errors.push('Inventory contains invalid or negative quantities.')
  const docs = await db.document.findMany({ where: { fileName: { not: null } }, select: { fileName: true, sizeBytes: true } })
  let missing = 0
  for (const doc of docs) {
    if (!doc.fileName || path.basename(doc.fileName) !== doc.fileName) { missing++; continue }
    const file = path.join(uploadDirectory(), doc.fileName)
    try {
      const info = await stat(file)
      if (!info.isFile() || (doc.sizeBytes !== null && info.size !== doc.sizeBytes)) missing++
      await access(file, constants.R_OK)
    } catch { missing++ }
  }
  if (missing) errors.push(`${missing} document attachment(s) are missing, unreadable, or have a different size. Restore upload/ before starting.`)
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('Production preflight passed: configuration, accounts, database integrity/references, inventory and attachment storage. Use one application instance with persistent db/upload/backups directories.')
}
main().catch(e => { console.error(e.message); process.exitCode = 1 }).finally(() => db.$disconnect())
