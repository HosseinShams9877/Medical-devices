import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { db } from '../src/lib/db'
import { inspectWorkbook, extractRows } from '../src/lib/excel'
import { importSuppliers } from '../src/lib/excel-import'
import { buildExport } from '../src/lib/excel-export'
import type { SessionUser } from '../src/lib/auth'

async function main() {
  if (!process.argv[2]) throw new Error('مسیر اکسل لازم است.')
  const buffer = readFileSync(process.argv[2])
  const fileName = basename(process.argv[2])
  const inspected = await inspectWorkbook(buffer, fileName)
  const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } })
  if (!admin) throw new Error('مدیر فعال وجود ندارد.')
  const user: SessionUser = { id: admin.id, username: admin.username, fullName: admin.fullName, role: 'ADMIN', permissions: [], roleLabel: 'مدیر سیستم' }
  for (const sheet of inspected.sheets) {
    if (sheet.kind !== 'SUPPLIERS') continue
    const rows = await extractRows(buffer, sheet.name, sheet.headerRowIndex)
    const result = await importSuppliers(rows, sheet.mapping, sheet.name, user, null, fileName)
    console.log(JSON.stringify(result, null, 2))
    if (result.errors.length) throw new Error('ورود با خطا همراه بود.')
  }
  if (process.argv[3]) {
    const output = await buildExport('suppliers')
    writeFileSync(process.argv[3], output.buffer)
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
