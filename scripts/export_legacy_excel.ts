import { writeFileSync } from 'node:fs'
import { buildExport } from '../src/lib/excel-export'
import { db } from '../src/lib/db'

async function main() {
  const path = process.argv[2]
  if (!path) throw new Error('مسیر خروجی لازم است.')
  try {
    const { buffer, count } = await buildExport('source_records')
    writeFileSync(path, buffer)
    process.stdout.write(`Exported ${count} source records to ${path}\n`)
  } finally {
    await db.$disconnect()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
