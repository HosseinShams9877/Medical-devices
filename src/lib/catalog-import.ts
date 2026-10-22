import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { createHash } from 'crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { faError } from './api'
import { saveBom } from './catalog'
import { IMPORT_FIELDS, type ImportKind, type ImportRow } from './import-fields'

export const optionsSchema = z.object({
  kind: z.enum(['products', 'bom', 'customers']), sheet: z.string().min(1), headerRow: z.number().int().min(1).max(100),
  mapping: z.record(z.string(), z.number().int().min(-1).max(99)),
  replace: z.boolean().default(false), createUnknown: z.boolean().default(false),
  excludedRows: z.array(z.number().int().min(1)).max(2000).default([]),
})
type Options = z.infer<typeof optionsSchema>
const digits = (s: string) => s.replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
const number = (s: string) => Number(digits(s).replace(/٫/g, '.'))
const codeOK = (s: string) => s.length >= 2 && s.length <= 40 && !/[|\s\x00-\x1f]/.test(s)
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

export async function readImportWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  try {
    // ExcelJS 4 assumes unprefixed spreadsheet XML element names. OOXML also
    // permits x: prefixes; normalize them without changing cell data.
    const zip = await JSZip.loadAsync(buffer)
    let bytes = 0, changed = false
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !name.endsWith('.xml')) continue
      const xml = await entry.async('string'); bytes += Buffer.byteLength(xml)
      if (bytes > 30 * 1024 * 1024) throw new Error('Expanded workbook too large')
      if (xml.includes('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) {
        zip.file(name, xml.replace(/(<\/?)[x]:/g, '$1').replace('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'))
        changed = true
      }
    }
    const normalized = changed ? await zip.generateAsync({ type: 'nodebuffer' }) : buffer
    await workbook.xlsx.load(normalized as unknown as Parameters<typeof workbook.xlsx.load>[0])
  }
  catch { throw faError('فایل اکسل خراب یا فرمت آن نامعتبر است؛ فایل xlsx انتخاب کنید.') }
  if (workbook.worksheets.length > 20 || workbook.worksheets.some(s => s.rowCount > 2100 || s.columnCount > 100)) throw faError('فایل بیش از حد مجاز است: ۲۰ شیت، ۲۰۰۰ ردیف داده و ۱۰۰ ستون.')
  return workbook
}

export function readMappedRows(workbook: ExcelJS.Workbook, options: Options): ImportRow[] {
  const sheet = workbook.getWorksheet(options.sheet)
  if (!sheet) throw faError('شیت انتخابی یافت نشد.')
  const required = options.kind === 'products' ? ['code', 'name', 'unit'] : options.kind === 'bom' ? ['productCode', 'componentCode', 'unit', 'qty'] : ['code', 'name']
  for (const key of required) if (options.mapping[key] === undefined || options.mapping[key] < 0) throw faError(`ستون الزامی ${key} تطبیق داده نشده است.`)
  const selected = Object.values(options.mapping).filter(v => v >= 0)
  if (new Set(selected).size !== selected.length) throw faError('یک ستون به چند فیلد متصل شده است.')
  const rows: ImportRow[] = []
  for (let n = options.headerRow + 1; n <= sheet.rowCount; n++) {
    if (options.excludedRows.includes(n)) continue
    const row = sheet.getRow(n)
    if (!row.hasValues) continue
    const values: Record<string, string> = {}
    const errors: string[] = [], warnings: string[] = []
    for (const [key] of IMPORT_FIELDS[options.kind]) {
      const index = options.mapping[key]
      if (index === undefined || index < 0) { values[key] = ''; continue }
      const cell = row.getCell(index + 1)
      if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error) errors.push(`سلول ${key} باید مقدار ثابت و معتبر داشته باشد.`)
      let value = cell.text.trim()
      if (key === 'phone') {
        if (typeof cell.value === 'number') {
          if (/^0+$/.test(cell.numFmt)) value = String(cell.value).padStart(cell.numFmt.length, '0')
          else if (/^9\d{9}$/.test(value)) { value = '0' + value; warnings.push('صفر ابتدای شماره همراه عددی بازسازی شد؛ پیش از ثبت بررسی کنید.') }
          else if (value) errors.push('تلفن عددی مبهم است؛ سلول را Text و شماره کامل را با صفر ابتدا وارد کنید.')
        }
        value = digits(value).replace(/[\s()\-]/g, '')
        if (value && !/^\+?\d{7,15}$/.test(value)) errors.push('شماره تماس معتبر نیست.')
      }
      values[key] = value
    }
    rows.push({ row: n, values, action: 'create', errors, warnings })
  }
  if (!rows.length) throw faError('ردیف داده‌ای برای ثبت انتخاب نشده است.')
  if (rows.length > 2000) throw faError('حداکثر ۲۰۰۰ ردیف مجاز است.')
  return rows
}

export async function planImport(tx: Prisma.TransactionClient, rows: ImportRow[], options: Options) {
  const products = await tx.product.findMany({ include: { revisions: { include: { boms: { include: { items: true } } } } }, orderBy: { id: 'asc' } })
  const components = await tx.component.findMany({ orderBy: { id: 'asc' } })
  const customers = await tx.customer.findMany({ orderBy: { id: 'asc' } })
  const seen = new Map<string, ImportRow>(), phones = new Map<string, ImportRow>()
  const unknownProducts = new Map<string, string>(), unknownParts = new Map<string, string>()
  const grouped = new Map<string, ImportRow[]>()
  for (const row of rows) {
    const v = row.values
    const key = options.kind === 'bom' ? `${v.productCode}|${v.revision || 'A'}|${v.componentCode}` : v.code
    const duplicate = seen.get(key)
    if (duplicate) { row.errors.push(`رکورد تکراری در فایل؛ ردیف ${duplicate.row}`); duplicate.errors.push(`رکورد تکراری در فایل؛ ردیف ${row.row}`) }
    else seen.set(key, row)
    if (options.kind === 'products' || options.kind === 'customers') {
      if (!codeOK(v.code)) row.errors.push('کد باید ۲ تا ۴۰ نویسه و بدون فاصله باشد.')
      if (v.name.length < 2 || v.name.length > 200) row.errors.push('نام باید ۲ تا ۲۰۰ نویسه باشد.')
    }
    if (options.kind === 'products') {
      if (!v.unit || v.unit.length > 30) row.errors.push('واحد محصول الزامی و حداکثر ۳۰ نویسه است.')
      const revision = v.revision || 'A'
      if (revision.length > 5) row.errors.push('نسخه محصول حداکثر ۵ نویسه است.')
      if (v.warrantyMonths && (!Number.isInteger(number(v.warrantyMonths)) || number(v.warrantyMonths) < 0 || number(v.warrantyMonths) > 120)) row.errors.push('گارانتی باید عدد صحیح صفر تا ۱۲۰ باشد.')
      const old = products.find(p => p.code === v.code)
      if (old) {
        row.action = options.replace ? 'update' : 'skip'
        if (options.replace && old.unit !== v.unit) row.errors.push('تغییر واحد محصول موجود از اکسل مجاز نیست.')
        if (options.replace && !old.revisions.some(r => r.revision === revision)) row.errors.push('نسخه محصول موجود ناشناخته است؛ ابتدا در محصولات تعریف کنید.')
      }
      if (v.category.length > 100) row.errors.push('گروه محصول بیش از ۱۰۰ نویسه است.')
    }
    if (options.kind === 'customers') {
      if (v.type && !['HOSPITAL', 'CLINIC', 'DISTRIBUTOR', 'OTHER'].includes(v.type)) row.errors.push('نوع مشتری معتبر نیست.')
      if (v.email && !z.string().email().safeParse(v.email).success) row.errors.push('ایمیل معتبر نیست.')
      for (const [key, max] of [['contactPerson', 100], ['city', 60], ['address', 300], ['phone', 30]] as const) if (v[key].length > max) row.errors.push(`${key} بیش از ${max} نویسه است.`)
      const old = customers.find(c => c.code === v.code)
      if (old) row.action = options.replace ? 'update' : 'skip'
      if (v.phone) {
        const other = customers.find(c => c.code !== v.code && digits(c.phone ?? '').replace(/[\s()\-]/g, '') === v.phone)
        if (other) row.errors.push(`تلفن با مشتری موجود ${other.code} تکراری است؛ کد یا تلفن را اصلاح کنید.`)
        const dupe = phones.get(v.phone)
        if (dupe && dupe.values.code !== v.code) { row.errors.push(`تلفن تکراری در ردیف ${dupe.row}`); dupe.errors.push(`تلفن تکراری در ردیف ${row.row}`) }
        else phones.set(v.phone, row)
      }
    }
    if (options.kind === 'bom') {
      if (!codeOK(v.productCode) || !codeOK(v.componentCode)) row.errors.push('کد محصول یا قطعه معتبر نیست.')
      if (!v.qty || !Number.isFinite(number(v.qty)) || number(v.qty) <= 0 || number(v.qty) > 1000) row.errors.push('مقدار مصرف باید بزرگ‌تر از صفر و حداکثر ۱۰۰۰ باشد.')
      if (!v.unit || v.unit.length > 30) row.errors.push('واحد قطعه الزامی و حداکثر ۳۰ نویسه است.')
      if ((v.revision || 'A').length > 5) row.errors.push('نسخه محصول حداکثر ۵ نویسه است.')
      if (v.criticality && !['NORMAL', 'CRITICAL'].includes(v.criticality)) row.errors.push('اهمیت باید NORMAL یا CRITICAL باشد.')
      const product = products.find(p => p.code === v.productCode)
      const component = components.find(c => c.code === v.componentCode)
      if (product) {
        if (!product.active) row.errors.push('محصول غیرفعال است.')
        if (!product.revisions.some(r => r.revision === (v.revision || 'A'))) row.errors.push('نسخه محصول ناشناخته است؛ ابتدا آن را تعریف کنید.')
      } else {
        row.warnings.push(`محصول ناشناخته: ${v.productCode}`)
        if (!options.createUnknown) row.errors.push('محصول ناشناخته؛ تعریف دستی یا انتخاب صریح ساخت موارد ناشناخته لازم است.')
        if (options.createUnknown && (v.productName.length < 2 || v.productName.length > 200)) row.errors.push('نام محصول ناشناخته معتبر نیست.')
        if (unknownProducts.has(v.productCode) && unknownProducts.get(v.productCode) !== v.productName) row.errors.push('نام محصول ناشناخته در ردیف‌های فایل ناسازگار است.')
        unknownProducts.set(v.productCode, v.productName)
      }
      if (component) {
        if (!component.active) row.errors.push('قطعه غیرفعال است.')
        if (component.unit.trim() !== v.unit) row.errors.push(`واحد با انبار ناسازگار است؛ واحد ثبت‌شده: ${component.unit}`)
      } else {
        row.warnings.push(`قطعه ناشناخته: ${v.componentCode}`)
        if (!options.createUnknown) row.errors.push('قطعه ناشناخته؛ تعریف دستی یا انتخاب صریح ساخت موارد ناشناخته لازم است.')
        if (options.createUnknown && (v.componentName.length < 2 || v.componentName.length > 200)) row.errors.push('نام قطعه ناشناخته معتبر نیست.')
        const signature = `${v.componentName}|${v.unit}|${v.criticality || 'NORMAL'}`
        if (unknownParts.has(v.componentCode) && unknownParts.get(v.componentCode) !== signature) row.errors.push('تعریف قطعه ناشناخته در فایل ناسازگار است.')
        unknownParts.set(v.componentCode, signature)
      }
      const groupKey = `${v.productCode}|${v.revision || 'A'}`
      grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), row])
    }
  }
  for (const group of grouped.values()) {
    const v = group[0].values
    const old = products.find(p => p.code === v.productCode)?.revisions.find(r => r.revision === (v.revision || 'A'))?.boms.filter(b => b.status === 'ACTIVE').sort((a, b) => b.revision - a.revision)[0]
    if (!old) continue
    const same = old.items.length === group.length && group.every(r => old.items.some(i => components.find(c => c.id === i.componentId)?.code === r.values.componentCode && i.qty === number(r.values.qty) && i.criticality === (r.values.criticality || 'NORMAL')))
    for (const row of group) {
      row.action = same ? 'skip' : 'update'
      if (!same && !options.replace) row.errors.push('BOM موجود متفاوت است؛ برای جایگزینی با نسخه جدید، گزینه به‌روزرسانی صریح را انتخاب کنید.')
      if (!same && options.replace) row.warnings.push('کل BOM این نسخه با اقلام انتخابی، در یک نسخه جدید جایگزین می‌شود؛ نسخه قبلی حفظ می‌شود.')
    }
  }
  for (const row of rows) if (row.errors.length) row.action = 'error'
  const totals = { created: rows.filter(r => r.action === 'create').length, updated: rows.filter(r => r.action === 'update').length, skipped: rows.filter(r => r.action === 'skip').length, errors: rows.filter(r => r.errors.length).length }
  const digest = hash({ rows, options, products, components, customers })
  return { rows, totals, digest, canCommit: totals.errors === 0 }
}

export async function applyImport(tx: Prisma.TransactionClient, rows: ImportRow[], options: Options, userId: string) {
  let productsCreated = 0, componentsCreated = 0, bomsCreated = 0
  if (options.kind === 'products') for (const row of rows) {
    if (row.action === 'skip') continue
    const v = row.values
    const data = { name: v.name, unit: v.unit, category: v.category || null, warrantyMonths: v.warrantyMonths ? number(v.warrantyMonths) : 12 }
    if (row.action === 'update') await tx.product.update({ where: { code: v.code }, data })
    else { await tx.product.create({ data: { code: v.code, ...data, revisions: { create: { revision: v.revision || 'A', isActive: true } } } }); productsCreated++ }
  }
  if (options.kind === 'customers') for (const row of rows) {
    if (row.action === 'skip') continue
    const v = row.values
    const data = { name: v.name, type: v.type || 'HOSPITAL', contactPerson: v.contactPerson || null, phone: v.phone || null, email: v.email || null, city: v.city || null, address: v.address || null }
    if (row.action === 'update') await tx.customer.update({ where: { code: v.code }, data })
    else await tx.customer.create({ data: { code: v.code, ...data } })
  }
  if (options.kind === 'bom') {
    const groups = new Map<string, ImportRow[]>()
    for (const row of rows.filter(r => r.action !== 'skip')) {
      const key = `${row.values.productCode}|${row.values.revision || 'A'}`
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    for (const group of groups.values()) {
      const v = group[0].values
      let product = await tx.product.findUnique({ where: { code: v.productCode } })
      if (!product) {
        product = await tx.product.create({ data: { code: v.productCode, name: v.productName, revisions: { create: { revision: v.revision || 'A', isActive: true } } } }); productsCreated++
      }
      let revision = await tx.productRevision.findUnique({ where: { productId_revision: { productId: product.id, revision: v.revision || 'A' } } })
      if (!revision) revision = await tx.productRevision.create({ data: { productId: product.id, revision: v.revision || 'A', isActive: false } })
      const items: { componentId: string; qty: number; criticality: string }[] = []
      for (const row of group) {
        const r = row.values
        let component = await tx.component.findUnique({ where: { code: r.componentCode } })
        if (!component) {
          component = await tx.component.create({ data: { code: r.componentCode, name: r.componentName, unit: r.unit, criticality: r.criticality || 'NORMAL' } }); componentsCreated++
        }
        items.push({ componentId: component.id, qty: number(r.qty), criticality: r.criticality || 'NORMAL' })
      }
      await saveBom(tx, revision.id, items, userId, 'ورود اکسل با تأیید پیش‌نمایش'); bomsCreated++
    }
  }
  return { productsCreated, componentsCreated, bomsCreated }
}

export function kindPermissions(kind: ImportKind): ('product.manage' | 'bom.revise' | 'customer.create')[] {
  return kind === 'products' ? ['product.manage'] : kind === 'bom' ? ['bom.revise'] : ['customer.create']
}
