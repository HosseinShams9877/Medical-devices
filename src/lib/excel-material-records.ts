import { Prisma } from '@prisma/client'
import ExcelJS from 'exceljs'
import { createHash } from 'node:crypto'
import { db } from './db'
import { normText, normKey, detectSheetKind, inspectWorkbook } from './excel'

export const MATERIAL_SHEETS = new Set(['28بهمن', '8فروردین', '29اردیبهشت1405', 'HC1', 'OXAN-1', 'SMART-CUFF', 'OXAN-Pro'])
export async function importMaterialRecords(buffer: Buffer, sourceName: string, selected?: string[]) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sourceHash = createHash('sha256').update(buffer).digest('hex')
  const components = await db.component.findMany({ select: { id: true, code: true, name: true } })
  const inspected = await inspectWorkbook(buffer, sourceName)
  const reports: { sheet: string; kind: 'COMPONENTS' | 'BOM'; created: number; duplicates: number; linked: number; review: number }[] = []
  for (const ws of workbook.worksheets) {
    if (!MATERIAL_SHEETS.has(ws.name.trim()) || (selected && !selected.includes(ws.name))) continue
    const headerRow = (inspected.sheets.find((s) => s.name === ws.name)?.headerRowIndex ?? 0) + 1
    const headers = Array.from({ length: ws.columnCount }, (_, i) => normText(ws.getRow(headerRow).getCell(i + 1).value))
    const { kind, mapping } = detectSheetKind(headers)
    if (kind !== 'COMPONENTS' && kind !== 'BOM') continue
    let created = 0, duplicates = 0, linked = 0, review = 0
    for (let rowNumber = headerRow + 1; rowNumber <= ws.rowCount; rowNumber++) {
      const values = Array.from({ length: headers.length }, (_, i) => normText(ws.getRow(rowNumber).getCell(i + 1).value))
      if (!values.some(Boolean)) continue
      const itemName = values[mapping.name] || null
      // نام دقیق شرط تطبیق است؛ کد تکراری هرگز به‌تنهایی هویت کالا نیست.
      const matches = itemName ? components.filter((c) => normKey(c.name) === normKey(itemName)) : []
      const component = matches.length === 1 ? matches[0] : null
      if (component) linked++; else review++
      const key = { sourceHash_sheetName_rowNumber: { sourceHash, sheetName: ws.name, rowNumber } }
      const prior = await db.excelMaterialRecord.findUnique({ where: key, select: { id: true } })
      if (prior) { duplicates++; continue }
      try { await db.excelMaterialRecord.create({ data: {
        sourceHash, sourceName, sheetName: ws.name, rowNumber, block: kind, itemName,
        componentId: component?.id ?? null, componentCode: component?.code ?? null,
        headersJson: JSON.stringify(headers), valuesJson: JSON.stringify(values),
      } }) } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { duplicates++; continue }; throw error }
      created++
    }
    reports.push({ sheet: ws.name, kind, created, duplicates, linked, review })
  }
  return reports
}
