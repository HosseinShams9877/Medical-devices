import { Prisma } from '@prisma/client'
import ExcelJS from 'exceljs'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { inspectWorkbook, detectSheetKind, normText, toEnDigits } from '@/lib/excel'

export const LEGACY_PRODUCTS: Record<string, string> = {
  'خلوص سنج پرتابل': 'OXAN-1',
  'خلوص سنج دیواری': 'OXAN-Pro',
  'اسمارت کاف': 'SMART-CUFF',
  'اکسان1': 'OXAN-1',
  'اکسان دیواری': 'OXAN-Pro',
}

export interface DeviceRecordReport {
  sheet: string
  production: number
  afterSales: number
  duplicates: number
  unmatched: number
  invalidSerials: string[]
}

/** آرشیو بدون اتلاف ستون‌ها؛ شمارهٔ سطر واقعی و نام بلوک در کلید یکتا حفظ می‌شوند. */
export async function importDeviceRecords(buffer: Buffer, sourceName: string, selected?: string[], serviceSheets?: string[]): Promise<DeviceRecordReport[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sourceHash = createHash('sha256').update(buffer).digest('hex')
  const inspected = await inspectWorkbook(buffer, sourceName)
  const reports: DeviceRecordReport[] = []
  for (const ws of workbook.worksheets) {
    if (selected && !selected.includes(ws.name)) continue
    const productCode = LEGACY_PRODUCTS[ws.name.trim()]
    if (!productCode) continue
    const headerRow = (inspected.sheets.find((s) => s.name === ws.name)?.headerRowIndex ?? 0) + 1
    const headers = Array.from({ length: ws.columnCount }, (_, i) => normText(ws.getRow(headerRow).getCell(i + 1).value))
    const { mapping, afterSalesCol } = detectSheetKind(headers)
    if (mapping.serial === undefined || mapping.serial < 0 || (afterSalesCol !== null && mapping.asSerial < 0)) throw new Error(`ساختار شیت «${ws.name}» با قالب منبع هماهنگ نیست.`)
    const report: DeviceRecordReport = { sheet: ws.name, production: 0, afterSales: 0, duplicates: 0, unmatched: 0, invalidSerials: [] }
    for (let rowNumber = headerRow + 1; rowNumber <= ws.rowCount; rowNumber++) {
      const values = Array.from({ length: headers.length }, (_, i) => normText(ws.getRow(rowNumber).getCell(i + 1).value))
      const blocks: [string, number, number, number][] = [['PRODUCTION', 0, afterSalesCol ?? headers.length, mapping.serial]]
      if (afterSalesCol !== null) blocks.push(['AFTER_SALES', afterSalesCol, headers.length, mapping.asSerial])
      for (const [block, start, end, serialColumn] of blocks) {
        if (block === 'AFTER_SALES' && serviceSheets && !serviceSheets.includes(ws.name)) continue
        if (!values.slice(start, end).some(Boolean)) continue
        const rawSerial = values[serialColumn]
        const serial = toEnDigits(rawSerial).toUpperCase().replace(/\s+/g, '')
        const valid = /^[A-Z0-9][A-Z0-9\-/]{3,24}$/.test(serial)
        if (rawSerial && !valid && report.invalidSerials.length < 30) report.invalidSerials.push(`${rowNumber}: ${rawSerial}`)
        const device = valid ? await db.device.findUnique({ where: { serial }, select: { id: true } }) : null
        if (valid && !device) report.unmatched++
        const data = {
          sourceHash, sourceName, sheetName: ws.name, rowNumber, block,
          productCode, serial: valid ? serial : null, deviceId: device?.id ?? null,
          headersJson: JSON.stringify(headers.slice(start, end)),
          valuesJson: JSON.stringify(values.slice(start, end)),
        }
        const key = { sourceHash_sheetName_rowNumber_block: { sourceHash, sheetName: ws.name, rowNumber, block } }
        const existing = await db.excelDeviceRecord.findUnique({ where: key, select: { id: true } })
        if (existing) {
          report.duplicates++
        } else {
          try { await db.excelDeviceRecord.create({ data }) }
          catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { report.duplicates++; continue }; throw error }
          if (block === 'PRODUCTION') report.production++
          else report.afterSales++
        }
      }
    }
    reports.push(report)
  }
  return reports
}
