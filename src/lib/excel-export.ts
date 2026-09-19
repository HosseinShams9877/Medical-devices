// ─────────────────────────────────────────────────────────────
// Excel Export — تولید فایل‌های xlsx استایل‌دار RTL
// انواع: قطعات، تأمین‌کنندگان، دستگاه‌ها، مشتریان، BOM، دفتر گردش، گزارش ممیزی، پشتیبان کامل
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { formatJalali } from './jalali'
import { toEnDigits } from './excel'
import { AUDIT_ACTIONS, ENTITY_TYPES } from './labels'
import { ROLE_LABELS } from './rbac'

export type ExportType =
  | 'components'
  | 'suppliers'
  | 'devices'
  | 'customers'
  | 'bom'
  | 'movements'
  | 'audit'
  | 'backup'

export const EXPORT_LABELS: Record<ExportType, string> = {
  components: 'قطعات و موجودی انبار',
  suppliers: 'تأمین‌کنندگان',
  devices: 'دستگاه‌ها',
  customers: 'مشتریان',
  bom: 'BOM محصولات',
  movements: 'دفتر گردش کالا',
  audit: 'گزارش ممیزی (Audit Trail)',
  backup: 'پشتیبان کامل (همهٔ داده‌ها)',
}

const HEADER_FILL = 'FF0F766E' // Teal-700
const ALT_FILL = 'FFF0FDFA' // Teal-50

function newSheet(wb: ExcelJS.Workbook, name: string, headers: string[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  })
  const headerRow = ws.addRow(headers)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
    }
  })
  return ws
}

function styleDataRows(ws: ExcelJS.Worksheet) {
  ws.eachRow((row, n) => {
    if (n === 1) return
    if (n % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_FILL } }
      })
    }
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' },
      }
      cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: false }
    })
  })
}

function autoWidth(ws: ExcelJS.Worksheet, headers: string[], samples: string[][]) {
  const widths = headers.map((h, i) => {
    const maxSample = Math.max(6, ...samples.map((s) => (s[i] ?? '').length))
    return Math.min(42, Math.max(String(h).length + 4, maxSample + 2))
  })
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
}

// ─── ۱) قطعات و موجودی ───
async function sheetComponents(wb: ExcelJS.Workbook) {
  const comps = await db.component.findMany({
    where: { active: true },
    include: { supplier: { select: { name: true } }, _count: { select: { lots: true } } },
    orderBy: { code: 'asc' },
  })
  const headers = ['کد کالا', 'گروه کالا', 'نام کالا', 'موجودی', 'رزرو شده', 'موجودی آزاد', 'حداقل موجودی', 'تعداد لات', 'تأمین‌کننده']
  const ws = newSheet(wb, 'قطعات و موجودی', headers)
  const samples: string[][] = []
  for (const c of comps) {
    const row = [c.code, c.category ?? '', c.name, c.stockQty, c.reservedQty, c.stockQty - c.reservedQty, c.minStock, c._count.lots, c.supplier?.name ?? '']
    ws.addRow(row)
    if (samples.length < 30) samples.push(row.map(String))
  }
  styleDataRows(ws)
  autoWidth(ws, headers, samples)
  return { count: comps.length }
}

// ─── ۲) تأمین‌کنندگان ───
async function sheetSuppliers(wb: ExcelJS.Workbook) {
  const sups = await db.supplier.findMany({ orderBy: { code: 'asc' } })
  const headers = ['کد', 'نام تأمین‌کننده', 'وب‌سایت', 'کد ایزو', 'تعداد قطعات', 'فعال']
  const ws = newSheet(wb, 'تأمین‌کنندگان', headers)
  const samples: string[][] = []
  for (const s of sups) {
    const cnt = await db.component.count({ where: { supplierId: s.id } })
    const row = [s.code, s.name, s.website ?? '', s.isoCode ?? '', cnt, s.active ? 'بله' : 'خیر']
    ws.addRow(row)
    if (samples.length < 30) samples.push(row.map(String))
  }
  styleDataRows(ws)
  autoWidth(ws, headers, samples)
  return { count: sups.length }
}

// ─── ۳) دستگاه‌ها ───
const DEVICE_STATUS_LABELS: Record<string, string> = {
  IN_PRODUCTION: 'در حال تولید',
  QC_PASS: 'تأیید QC',
  QC_FAIL: 'رد QC',
  REWORK: 'بازکار (Rework)',
  RELEASED: 'آزاد‌شده',
  DELIVERED: 'تحویل‌شده',
  SCRAPPED: 'اسقاط',
}
async function sheetDevices(wb: ExcelJS.Workbook) {
  const devs = await db.device.findMany({
    include: { product: { select: { code: true, name: true } }, customer: { select: { name: true, city: true } } },
    orderBy: { serial: 'asc' },
  })
  const headers = ['شماره سریال', 'محصول', 'تاریخ تولید', 'وضعیت', 'ورژن فرمور', 'مشتری', 'شهر', 'تاریخ تحویل', 'یادداشت']
  const ws = newSheet(wb, 'دستگاه‌ها', headers)
  const samples: string[][] = []
  for (const d of devs) {
    const row = [
      d.serial,
      d.product.name,
      d.producedAt ? formatJalali(d.producedAt) : '',
      DEVICE_STATUS_LABELS[d.status] ?? d.status,
      d.firmwareVersion ?? '',
      d.customer?.name ?? '',
      d.customer?.city ?? '',
      d.deliveredAt ? formatJalali(d.deliveredAt) : '',
      d.notes ?? '',
    ]
    ws.addRow(row)
    if (samples.length < 30) samples.push(row.map(String))
  }
  styleDataRows(ws)
  autoWidth(ws, headers, samples)
  return { count: devs.length }
}

// ─── ۴) مشتریان ───
async function sheetCustomers(wb: ExcelJS.Workbook) {
  const custs = await db.customer.findMany({ include: { _count: { select: { devices: true, tickets: true, complaints: true } } }, orderBy: { code: 'asc' } })
  const TYPE_LABELS: Record<string, string> = { HOSPITAL: 'بیمارستان', CLINIC: 'کلینیک/آزمایشگاه', DISTRIBUTOR: 'توزیع‌کننده', OTHER: 'سایر' }
  const headers = ['کد', 'نام', 'شهر', 'نوع', 'تعداد دستگاه', 'تیکت‌ها', 'شکایات']
  const ws = newSheet(wb, 'مشتریان', headers)
  const samples: string[][] = []
  for (const c of custs) {
    const row = [c.code, c.name, c.city ?? '', TYPE_LABELS[c.type] ?? c.type, c._count.devices, c._count.tickets, c._count.complaints]
    ws.addRow(row)
    if (samples.length < 30) samples.push(row.map(String))
  }
  styleDataRows(ws)
  autoWidth(ws, headers, samples)
  return { count: custs.length }
}

// ─── ۵) BOM (یک شیت به‌ازای هر محصول) ───
async function sheetBom(wb: ExcelJS.Workbook) {
  const boms = await db.bom.findMany({
    where: { status: 'ACTIVE' },
    include: {
      productRevision: { include: { product: true } },
      items: { include: { component: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { id: 'asc' },
  })
  let count = 0
  for (const bom of boms) {
    const p = bom.productRevision.product
    const headers = ['ردیف', 'کد کالا', 'نام کالا', 'تعداد در هر دستگاه', 'گروه کالا', 'موجودی فعلی']
    const ws = newSheet(wb, `${p.code} — BOM نسخه ${toEnDigits(String(bom.revision))}`.slice(0, 31), headers)
    const samples: string[][] = []
    let i = 1
    for (const it of bom.items) {
      const row = [i++, it.component.code, it.component.name, it.qty, it.component.category ?? '', it.component.stockQty]
      ws.addRow(row)
      if (samples.length < 30) samples.push(row.map(String))
    }
    styleDataRows(ws)
    autoWidth(ws, headers, samples)
    count += bom.items.length
  }
  return { count }
}

// ─── ۶) دفتر گردش کالا ───
const MOVEMENT_LABELS: Record<string, string> = {
  MANUAL_IN: 'ورود دستی',
  MANUAL_OUT: 'خروج دستی',
  ADJUST: 'اصلاح موجودی',
  BOM_CONSUME: 'مصرف BOM',
  PRODUCTION: 'مصرف تولید',
  IQC_REJECT: 'رد کنترل ورودی',
}
async function sheetMovements(wb: ExcelJS.Workbook) {
  const movs = await db.stockMovement.findMany({
    include: { component: { select: { code: true, name: true } }, user: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  })
  const headers = ['کد رویداد', 'تاریخ', 'کد کالا', 'نام کالا', 'نوع', 'تعداد', 'موجودی قبل', 'موجودی بعد', 'دلیل', 'کاربر']
  const ws = newSheet(wb, 'دفتر گردش کالا', headers)
  const samples: string[][] = []
  for (const m of movs) {
    const row = [
      m.code,
      formatJalali(m.createdAt, true),
      m.component.code,
      m.component.name,
      MOVEMENT_LABELS[m.type] ?? m.type,
      m.qty,
      m.beforeQty,
      m.afterQty,
      m.reason ?? '',
      m.user.fullName,
    ]
    ws.addRow(row)
    if (samples.length < 30) samples.push(row.map(String))
  }
  styleDataRows(ws)
  autoWidth(ws, headers, samples)
  return { count: movs.length }
}

// ─── ۷) گزارش ممیزی (Audit Trail) ───
async function sheetAudit(wb: ExcelJS.Workbook) {
  const logs = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 })
  const headers = ['زمان', 'کاربر', 'نقش', 'اقدام', 'نوع رکورد', 'کد رکورد', 'مقدار قبلی', 'مقدار جدید', 'IP']
  const ws = newSheet(wb, 'گزارش ممیزی', headers)
  const samples: string[][] = []
  for (const l of logs) {
    const row = [
      formatJalali(l.createdAt, true),
      l.username ?? 'سیستم',
      l.role ? ROLE_LABELS[l.role as keyof typeof ROLE_LABELS] ?? l.role : '',
      AUDIT_ACTIONS[l.action] ?? l.action,
      l.entityType ? ENTITY_TYPES[l.entityType] ?? l.entityType : '',
      l.entityCode ?? '',
      l.oldValues ?? '',
      l.newValues ?? '',
      l.ip ?? '',
    ]
    ws.addRow(row)
    if (samples.length < 30) samples.push(row.map(String))
  }
  styleDataRows(ws)
  autoWidth(ws, headers, samples)
  return { count: logs.length }
}

// ─── تولید فایل خروجی ───
export async function buildExport(type: ExportType): Promise<{ buffer: Buffer; count: number }> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'سامانه مدیریت تولید و خدمات پس از فروش تجهیزات پزشکی'
  wb.created = new Date()

  let count = 0
  if (type === 'components' || type === 'backup') count += (await sheetComponents(wb)).count
  if (type === 'suppliers' || type === 'backup') count += (await sheetSuppliers(wb)).count
  if (type === 'devices' || type === 'backup') count += (await sheetDevices(wb)).count
  if (type === 'customers' || type === 'backup') count += (await sheetCustomers(wb)).count
  if (type === 'bom' || type === 'backup') count += (await sheetBom(wb)).count
  if (type === 'movements' || type === 'backup') count += (await sheetMovements(wb)).count
  if (type === 'audit' || type === 'backup') count += (await sheetAudit(wb)).count

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return { buffer: Buffer.from(arrayBuffer), count }
}

// ─── قالب‌های خالی برای ورود داده ───
export type TemplateType = 'components' | 'suppliers' | 'bom' | 'devices'

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  components: 'قالب قطعات و موجودی',
  suppliers: 'قالب تأمین‌کنندگان',
  bom: 'قالب BOM محصول',
  devices: 'قالب سوابق تولید',
}

export async function buildTemplate(type: TemplateType): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const guide = wb.addWorksheet('راهنما', { views: [{ rightToLeft: true }] })
  guide.getColumn(1).width = 100

  let headers: string[] = []
  let examples: string[][] = []
  let sheetName = ''
  let guideLines: string[] = []

  if (type === 'components') {
    sheetName = 'موجودی انبار'
    headers = ['کد کالا', 'گروه کالا', 'نام کالا', 'موجودی فعلی']
    examples = [
      ['230145100', 'الکترونیک', '10kΩ (1206)', '137'],
      ['', 'پنوماتیک', 'زانو پنوماتیک', '24'],
    ]
    guideLines = [
      'قالب ورود قطعات و موجودی انبار',
      '• «کد کالا» اختیاری است؛ اگر خالی باشد کد خودکار (AC-) ساخته می‌شود.',
      '• «گروه کالا» دسته‌بندی قطعه است (الکترونیک، پنوماتیک، مصرفی و…).',
      '• «موجودی فعلی» عدد است؛ برای قطعهٔ حذف‌شده صفر وارد کنید.',
      '• اگر قطعه از قبل با همین کد یا نام موجود باشد، موجودی آن به‌روزرسانی و در دفتر گردش ثبت می‌شود.',
    ]
  } else if (type === 'suppliers') {
    sheetName = 'تأمین‌کنندگان'
    headers = ['تامین کننده', 'ادرس سایت', 'کد مختص', 'کد ایزو']
    examples = [
      ['جوان الکترونیک', 'https://javanelec.com/', '001', 'SUP-ELE-001'],
      ['سان سون', '', '012', ''],
    ]
    guideLines = [
      'قالب ورود تأمین‌کنندگان',
      '• فقط ستون «تامین کننده» الزامی است.',
      '• تأمین‌کنندهٔ تکراری (با همان کد یا نام) به‌روزرسانی می‌شود نه تکرار.',
    ]
  } else if (type === 'bom') {
    sheetName = 'BOM محصول'
    headers = ['کدکالا', 'نام کالا', 'تعداد']
    examples = [
      ['330120002', 'ESP32-S3-WROOM', '1'],
      ['', 'کلید فشاری (6*6*4.3)', '3'],
    ]
    guideLines = [
      'قالب ورود BOM محصول',
      '• هر شیت = BOM یک محصول؛ نام شیت یا کد محصول را در مرحلهٔ بعد انتخاب کنید.',
      '• اگر «کدکالا» داده شود مستقیم به قطعهٔ انبار وصل می‌شود؛ وگرنه تطبیق هوشمند نام انجام می‌شود.',
      '• اقلام ناشناخته (در صورت فعال‌بودن گزینه) به‌صورت قطعهٔ جدید ساخته می‌شوند.',
      '• نسخهٔ قبلی BOM خودکار بازنشسته می‌شود (کنترل نسخه).',
    ]
  } else {
    sheetName = 'سوابق تولید'
    headers = ['تاریخ', 'شماره سریال', 'ورژن', 'شماره سیمکارت', 'پیکربندی سنسور', 'توضیحات', 'تاریخ فروش', 'سریال فروش', 'مرکز/بیمارستان', 'تاریخ تحویل']
    examples = [
      ['1403/04/28', 'OX1037802', '3.0.2', '', 'o2-100', 'به همراه منحنی', '1403/05/02', 'OX1037802', 'اصفهان/مهندس دهقانی', '1403/05/10'],
      ['1404/06/30', 'OXP031401', '4.1.0.11V', '9022590375', 'O2-100', '', '', '', '', ''],
    ]
    guideLines = [
      'قالب ورود سوابق تولید دستگاه',
      '• تاریخ‌ها شمسی و به شکل ۱۴۰۳/۰۴/۲۸ هستند.',
      '• «شماره سریال» الزامی است؛ سریال تکراری به‌روزرسانی می‌شود.',
      '• ستون‌های ۷ تا ۱۰ (فروش) اختیاری‌اند؛ اگر پر شوند تحویل/فروش ثبت می‌شود.',
      '• کد محصول مقصد را در مرحلهٔ بعد انتخاب کنید.',
    ]
  }

  const ws = newSheet(wb, sheetName, headers)
  for (const ex of examples) ws.addRow(ex)
  styleDataRows(ws)
  autoWidth(ws, headers, examples)

  guide.addRow(['راهنما']).font = { bold: true, size: 13 }
  for (const l of guideLines) {
    const c = guide.addRow([l]).getCell(1)
    c.alignment = { horizontal: 'right', wrapText: true }
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
