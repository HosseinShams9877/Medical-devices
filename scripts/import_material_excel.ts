import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { db } from '../src/lib/db'
import { importMaterialRecords } from '../src/lib/excel-material-records'
import { buildExport } from '../src/lib/excel-export'
async function main() {
  if (!process.argv[2]) throw new Error('مسیر فایل لازم است.')
  console.log(JSON.stringify(await importMaterialRecords(readFileSync(process.argv[2]), basename(process.argv[2])), null, 2))
  if (process.argv[3]) writeFileSync(process.argv[3], (await buildExport('material_records')).buffer)
}
main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
