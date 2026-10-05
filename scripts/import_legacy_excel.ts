import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { importDeviceRecords } from '../src/lib/excel-device-records'
import { db } from '../src/lib/db'

async function main() {
  const path = process.argv[2]
  if (!path) throw new Error('مسیر فایل Excel لازم است.')
  try {
    const reports = await importDeviceRecords(readFileSync(path), basename(path))
    if (!reports.length) throw new Error('هیچ شیت سازگار یافت نشد.')
    process.stdout.write(JSON.stringify(reports, null, 2) + '\n')
  } finally {
    await db.$disconnect()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
