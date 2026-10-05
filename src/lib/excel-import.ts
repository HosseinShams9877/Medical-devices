import { createHash, randomUUID } from 'node:crypto'
// ─────────────────────────────────────────────────────────────
// Excel Import — نوشتن داده‌های استخراج‌شده در DB با گزارش شفاف
// اصول: هیچ سطری بی‌گزارش رد نمی‌شود؛ رکورد تکراری به‌روزرسانی می‌شود
// ─────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { SessionUser } from '@/lib/auth'
import { recordMovement, consumeLotsFIFO } from '@/lib/stock'
import {
  type SheetKind,
  type NameIndexEntry,
  buildNameIndex,
  matchByName,
  nameKeys,
  nameTokens,
  parseJalaliDate,
  parseNum,
  normText,
  normKey,
  toEnDigits,
} from './excel'

export interface SheetImportOptions {
  sheet: string
  headerRowIndex: number
  kind: SheetKind
  headers: string[]
  productCode?: string
  productName?: string
  importAfterSales?: boolean
  createStubs?: boolean
  createDeviceStubs?: boolean
}

export interface SheetReport {
  sheet: string
  kind: SheetKind
  created: number
  updated: number
  skipped: number
  warnings: string[]
  errors: string[]
}

const MAX_ERR = 30

function rpt(kind: SheetKind, sheet: string): SheetReport {
  return { sheet, kind, created: 0, updated: 0, skipped: 0, warnings: [], errors: [] }
}

// کد یکتای خودکار برای اقلام بدون کد
async function nextAutoCode(prefix: string): Promise<string> {
  const existing = await db.component.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } })
  let max = 0
  for (const c of existing) {
    const n = Number(c.code.replace(prefix, ''))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

// ═══════════════ ۱) تأمین‌کنندگان ═══════════════
export async function importSuppliers(
  rows: string[][],
  mapping: Record<string, number>,
  sheet: string,
  user: SessionUser,
  req: NextRequest | null,
  fileName: string,
): Promise<SheetReport> {
  const r = rpt('SUPPLIERS', sheet)
  const seen = new Set<string>()
  for (const row of rows) {
    const name = normText(row[mapping.name])
    if (!name) {
      r.skipped++
      continue
    }
    const key = nameKeys(name)[0] ?? name
    if (seen.has(key)) {
      r.skipped++
      continue
    }
    seen.add(key)
    const website = normText(row[mapping.website]) || null
    const rawCode = normText(row[mapping.code]) || null
    const isoCode = normText(row[mapping.isoCode]) || null
    try {
      // یافتن موجود: اول با کد، بعد با نام
      let existing = rawCode ? await db.supplier.findFirst({ where: { OR: [{ code: rawCode }, ...(isoCode ? [{ isoCode }] : [])] } }) : null
      if (!existing) {
        const all = await db.supplier.findMany()
        existing = all.find((s) => nameKeys(s.name)[0] === key) ?? null
      }
      if (existing) {
        await db.supplier.update({
          where: { id: existing.id },
          data: {
            website: website ?? existing.website,
            isoCode: isoCode ?? existing.isoCode,
            ...(rawCode && existing.code !== rawCode && !(await db.supplier.findFirst({ where: { code: rawCode } })) ? { code: rawCode } : {}),
          },
        })
        r.updated++
      } else {
        let code = rawCode
        if (code && (await db.supplier.findFirst({ where: { code } }))) code = null
        if (!code) {
          const count = await db.supplier.count()
          code = `SUP-${String(count + 1).padStart(3, '0')}`
        }
        await db.supplier.create({ data: { code, name, website, isoCode } })
        r.created++
      }
    } catch (e) {
      if (r.errors.length < MAX_ERR) r.errors.push(`«${name}»: ${e instanceof Error ? e.message.slice(0, 120) : 'خطا'}`)
      r.skipped++
    }
  }
  await audit(req, user, 'EXCEL_IMPORT', {
    entityType: 'Supplier',
    entityCode: fileName,
    newValues: { sheet, created: r.created, updated: r.updated, skipped: r.skipped },
  })
  return r
}

// ═══════════════ ۲) قطعات و موجودی انبار ═══════════════
export async function importComponents(
  rows: string[][], mapping: Record<string, number>, sheet: string,
  user: SessionUser, req: NextRequest | null, fileName: string,
): Promise<SheetReport> {
  const r = rpt('COMPONENTS', sheet)
  const seen = new Set<string>()
  for (const row of rows) {
    const name = normText(row[mapping.name])
    if (!name) { r.skipped++; continue }
    const key = normKey(name)
    if (seen.has(key)) { r.skipped++; r.warnings.push(`«${name}»: ردیف تکراری؛ برای جلوگیری از دو بار اعمال شدن رد شد.`); continue }
    seen.add(key)
    const rawQty = normText(row[mapping.qty >= 0 ? mapping.qty : mapping.qtyInit])
    const qty = rawQty === '' ? null : parseNum(rawQty)
    if (rawQty !== '' && (qty === null || qty < 0 || !Number.isFinite(qty))) {
      r.errors.push(`«${name}»: موجودی نامعتبر است؛ هیچ تغییری اعمال نشد.`); r.skipped++; continue
    }
    const code = mapping.code >= 0 ? normText(row[mapping.code]) : ''
    const category = mapping.category >= 0 ? normText(row[mapping.category]) || null : null
    try {
      const result = await db.$transaction(async (tx) => {
        const all = await tx.component.findMany()
        const exact = all.filter((c) => normKey(c.name) === key)
        if (exact.length > 1) throw new Error('نام کالا در سامانه یکتا نیست؛ تطبیق دستی لازم است.')
        let comp = code ? all.find((c) => c.code === code) : undefined
        if (comp && normKey(comp.name) !== key) throw new Error('کد کالا به نام دیگری تعلق دارد؛ تطبیق دستی لازم است.')
        comp ??= exact[0]
        const isNew = !comp
        if (!comp) comp = await tx.component.create({ data: { code: code || `AC-${randomUUID()}`, name, category, stockQty: 0 } })
        else if (category) await tx.component.update({ where: { id: comp.id }, data: { category } })
        if (qty !== null && qty < comp.reservedQty) throw new Error('موجودی هدف کمتر از رزرو سفارش‌هاست.')
        if (qty !== null && qty > comp.stockQty) {
          const lotNumber = `EXCEL-${createHash('sha256').update(JSON.stringify([fileName, sheet, row])).digest('hex').slice(0, 32)}`
          const prior = await tx.componentLot.findUnique({ where: { componentId_lotNumber: { componentId: comp.id, lotNumber } } })
          if (!prior) {
            const delta = qty - comp.stockQty
            const lot = await tx.componentLot.create({ data: { componentId: comp.id, lotNumber, quantity: delta, remaining: delta, status: 'PENDING' } })
            const inspection = await tx.incomingInspection.create({ data: { code: `IQC-${randomUUID()}`, componentId: comp.id, lotId: lot.id, qty: delta } })
            await tx.componentLot.update({ where: { id: lot.id }, data: { inspectionId: inspection.id } })
          }
          return { isNew, pending: true }
        }
        if (qty !== null && qty < comp.stockQty) {
          await consumeLotsFIFO(comp.id, comp.stockQty - qty, tx)
          await tx.component.update({ where: { id: comp.id }, data: { stockQty: qty } })
          await recordMovement({ componentId: comp.id, type: 'ADJUST', qty: qty - comp.stockQty, beforeQty: comp.stockQty, afterQty: qty, reason: `شمارش اکسل ${fileName} — ${sheet}`, userId: user.id }, tx)
        }
        return { isNew, pending: false }
      })
      if (result.isNew) r.created++; else r.updated++
      if (result.pending) r.warnings.push(`«${name}»: افزایش موجودی به رسید منتظر QC منتقل شد؛ موجودی قابل‌مصرف هنوز افزایش نیافته است.`)
    } catch (error) { r.skipped++; r.errors.push(`«${name}»: ${(error as Error).message}`) }
  }
  await audit(req, user, 'EXCEL_IMPORT', { entityType: 'Component', entityCode: fileName, newValues: { sheet, created: r.created, updated: r.updated, skipped: r.skipped } })
  return r
}

// ═══════════════ ۳) BOM محصول ═══════════════
export async function importBom(
  rows: string[][],
  mapping: Record<string, number>,
  opts: SheetImportOptions,
  user: SessionUser,
  req: NextRequest | null,
  fileName: string,
): Promise<SheetReport> {
  const r = rpt('BOM', opts.sheet)
  const productCode = (opts.productCode || opts.sheet).trim()
  const productName = (opts.productName || productCode).trim()

  // اقلام معتبر
  const items: { name: string; code: string; qty: number; rowIdx: number }[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = normText(row[mapping.name])
    const qty = parseNum(row[mapping.qty])
    if (!name) {
      r.skipped++
      continue
    }
    if (qty === null || qty <= 0) {
      if (r.warnings.length < MAX_ERR) r.warnings.push(`سطر ${i + 1}: «${name}» تعداد معتبر ندارد و رد شد.`)
      r.skipped++
      continue
    }
    items.push({ name, code: mapping.code >= 0 ? normText(row[mapping.code]) : '', qty, rowIdx: i })
  }
  if (!items.length || r.skipped > 0) {
    if (r.skipped > 0) r.errors.push('BOM دارای ردیف ناقص است؛ برای جلوگیری از فعال‌شدن BOM ناقص، هیچ نسخه‌ای ایجاد نشد.')
    return r
  }

  try {
    // محصول + نسخه + BOM (تراکنشی)
    const result = await db.$transaction(async (tx) => {
      let product = await tx.product.findFirst({ where: { code: productCode } })
      if (!product) {
        product = await tx.product.create({
          data: { code: productCode, name: productName, hasFirmware: true, category: 'تجهیزات پزشکی' },
        })
        r.created++ // محصول
      }
      let revision = await tx.productRevision.findFirst({ where: { productId: product.id, isActive: true } })
      if (!revision) {
        revision = await tx.productRevision.findFirst({ where: { productId: product.id }, orderBy: { revision: 'desc' } })
      }
      if (!revision) {
        revision = await tx.productRevision.create({
          data: { productId: product.id, revision: 'A', isActive: true, notes: 'ایجاد در ورود اکسل' },
        })
      }
      const lastBom = await tx.bom.findFirst({ where: { productRevisionId: revision.id }, orderBy: { revision: 'desc' } })
      const bomRev = (lastBom?.revision ?? 0) + 1
      const bom = await tx.bom.create({
        data: {
          productRevisionId: revision.id,
          revision: bomRev,
          status: 'ACTIVE',
          notes: `ورود از اکسل «${fileName}» — شیت «${opts.sheet}»`,
          createdById: user.id,
        },
      })
      if (lastBom) {
        await tx.bom.update({ where: { id: lastBom.id }, data: { status: 'RETIRED' } })
      }

      const components = await tx.component.findMany()
      const byCode = new Map(components.map((c) => [c.code, c]))
      const index = buildNameIndex(components.map((c) => c.name))
      const usedCodes = new Set(components.map((c) => c.code))
      let autoSeq = 0

      let createdItems = 0
      const seenInBom = new Set<string>()
      for (const it of items) {
        let comp = it.code ? byCode.get(it.code) : undefined
        if (comp && normKey(comp.name) !== normKey(it.name)) throw new Error(`کد ${it.code} با نام ${it.name} سازگار نیست.`)
        if (!comp) {
          const exact = components.filter((c) => normKey(c.name) === normKey(it.name))
          if (exact.length > 1) throw new Error(`نام ${it.name} مبهم است.`)
          comp = exact[0]
        }
        if (!comp && opts.createStubs) {
          let code = it.code
          if (!code || usedCodes.has(code)) {
            autoSeq++
            code = `AC-${String(1000 + autoSeq).padStart(4, '0')}`
            while (usedCodes.has(code)) code = `AC-${String(++autoSeq + 1000).padStart(4, '0')}`
          }
          comp = await tx.component.create({ data: { code, name: it.name, stockQty: 0 } })
          components.push(comp)
          byCode.set(comp.code, comp)
          index.push(buildNameIndex([it.name])[0])
          usedCodes.add(comp.code)
          r.warnings.push(`قطعهٔ جدید «${it.name}» با کد «${comp.code}» ساخته شد (در انبار فعلی نبود).`)
        }
        if (!comp) throw new Error(`قطعه «${it.name}» یافت نشد؛ BOM قبلی حفظ شد.`)
        if (seenInBom.has(comp.id)) {
          if (r.warnings.length < MAX_ERR) r.warnings.push(`«${it.name}» در BOM تکراری بود؛ تعداد جمع شد.`)
          const existing = await tx.bomItem.findFirst({ where: { bomId: bom.id, componentId: comp.id } })
          if (existing) {
            await tx.bomItem.update({ where: { id: existing.id }, data: { qty: existing.qty + it.qty } })
          }
          continue
        }
        await tx.bomItem.create({
          data: {
            bomId: bom.id,
            componentId: comp.id,
            qty: it.qty,
            sortOrder: it.rowIdx,
          },
        })
        seenInBom.add(comp.id)
        createdItems++
      }
      if (lastBom) {
        const previous = await tx.bomItem.findMany({ where: { bomId: lastBom.id } })
        const next = await tx.bomItem.findMany({ where: { bomId: bom.id } })
        if (previous.length === next.length && previous.every((p) => next.some((n) => n.componentId === p.componentId && n.qty === p.qty))) {
          await tx.bom.delete({ where: { id: bom.id } })
          await tx.bom.update({ where: { id: lastBom.id }, data: { status: lastBom.status } })
          return { bomId: lastBom.id, productCode: product.code, createdItems: 0 }
        }
      }
      return { bomId: bom.id, productCode: product.code, createdItems }
    })
    r.created += result.createdItems
    await audit(req, user, 'EXCEL_IMPORT', {
      entityType: 'Bom',
      entityCode: `${result.productCode}#${result.bomId}`,
      newValues: { sheet: opts.sheet, items: result.createdItems },
    })
  } catch (e) {
    r.created = 0
    if (r.errors.length < MAX_ERR) r.errors.push(`خطای کلی BOM: ${e instanceof Error ? e.message.slice(0, 160) : 'خطا'}`)
  }
  return r
}

// ═══════════════ ۴) دستگاه‌ها (تولید + خدمات پس از فروش) ═══════════════
const SERIAL_RE = /^[A-Z0-9][A-Z0-9\-\/]{3,24}$/
function validSerial(s: string): string | null {
  const t = toEnDigits(s).toUpperCase().replace(/\s+/g, '')
  return SERIAL_RE.test(t) ? t : null
}

function parseCustomer(raw: string): { name: string; city: string | null; type: string } {
  const v = raw.trim()
  let city: string | null = null
  let name = v
  if (v.includes('/')) {
    const parts = v.split('/').map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2 && parts[0].length <= 20) {
      city = parts[0]
      name = parts.slice(1).join(' — ')
    } else if (parts.length === 1) {
      name = parts[0]
    }
  }
  let type = 'OTHER'
  if (/بیمارستان|درمانگاه|مرکز درمانی|کلینیک/.test(name + (city ?? ''))) type = 'HOSPITAL'
  else if (/فروشگاه|مهندس|شرکت|نمایندگی|توزیع/.test(name + (city ?? ''))) type = 'DISTRIBUTOR'
  else if (/آزمایشگاه/.test(name + (city ?? ''))) type = 'CLINIC'
  return { name, city, type }
}

export async function importDevices(
  rows: string[][],
  mapping: Record<string, number>,
  headers: string[],
  opts: SheetImportOptions,
  user: SessionUser,
  req: NextRequest | null,
  fileName: string,
): Promise<SheetReport> {
  const r = rpt('DEVICES', opts.sheet)
  const productCode = (opts.productCode || '').trim()
  if (!productCode) {
    r.errors.push('کد محصول مقصد مشخص نشده است.')
    return r
  }

  // محصول و نسخهٔ فعال
  let product = await db.product.findFirst({ where: { code: productCode } })
  if (!product) {
    product = await db.product.create({
      data: { code: productCode, name: opts.productName || productCode, hasFirmware: true, category: 'تجهیزات پزشکی' },
    })
    r.created++
  }
  let revision = await db.productRevision.findFirst({ where: { productId: product.id, isActive: true } })
  if (!revision) {
    revision = await db.productRevision.findFirst({ where: { productId: product.id }, orderBy: { revision: 'desc' } })
  }
  if (!revision) {
    revision = await db.productRevision.create({
      data: { productId: product.id, revision: 'A', isActive: true, notes: 'ایجاد در ورود اکسل' },
    })
  }

  // ستون‌های پرچم خدمات پس از فروش (غیر از فیلد‌های نگاشت‌شده)
  const knownAs = new Set(
    [mapping.asDate, mapping.asSerial, mapping.asWarranty, mapping.asCustomer, mapping.asReturned, mapping.asDeliveredAt, mapping.asNotes, mapping.asUpdate].filter((x) => x !== undefined && x >= 0),
  )

  // ── بلوک تولید ──
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const serial = mapping.serial >= 0 ? validSerial(row[mapping.serial] ?? '') : null
    if (!serial) {
      r.skipped++
      continue
    }
    const date = mapping.date >= 0 ? parseJalaliDate(row[mapping.date]) : null
    const version = mapping.version >= 0 ? normText(row[mapping.version]) || null : null
    const sim = mapping.sim >= 0 ? normText(row[mapping.sim]) || null : null
    const sensor = mapping.sensor >= 0 ? normText(row[mapping.sensor]) || null : null
    const rowNotes = mapping.notes >= 0 ? normText(row[mapping.notes]) || null : null
    const notes = [sim ? `سیم‌کارت: ${sim}` : '', sensor ? `پیکربندی سنسور: ${sensor}` : '', rowNotes ?? '']
      .filter(Boolean)
      .join(' | ')

    try {
      const existing = await db.device.findFirst({ where: { serial } })
      if (existing) {
        await db.device.update({
          where: { id: existing.id },
          data: {
            producedAt: existing.producedAt ?? date ?? undefined,
            firmwareVersion: existing.firmwareVersion ?? version,
            ...(notes && !existing.notes?.includes(notes) ? { notes: existing.notes ? `${existing.notes} | ${notes}` : notes } : {}),
          },
        })
        r.updated++
      } else {
        await db.device.create({
          data: {
            serial,
            productId: product.id,
            productRevisionId: revision.id,
            bomId: null,
            status: 'IN_PRODUCTION',
            producedAt: date,
            firmwareVersion: version,
            notes: notes || `ورود سوابق تولید از اکسل «${fileName}» — شیت «${opts.sheet}»`,
          },
        })
        r.created++
      }
    } catch (e) {
      if (r.errors.length < MAX_ERR) r.errors.push(`سریال ${serial}: ${e instanceof Error ? e.message.slice(0, 120) : 'خطا'}`)
      r.skipped++
    }
  }

  // ── بلوک خدمات پس از فروش (فروش/تحویل) ──
  if (opts.importAfterSales && mapping.afterSalesCol !== null && mapping.afterSalesCol >= 0) {
    let deliveries = 0, stubs = 0, customers = 0
    const customerCache = new Map<string, string>()
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const asSerial = mapping.asSerial >= 0 ? validSerial(row[mapping.asSerial] ?? '') : null
      const customerRaw = mapping.asCustomer >= 0 ? normText(row[mapping.asCustomer]) : ''
      const saleDate = mapping.asDate >= 0 ? parseJalaliDate(row[mapping.asDate]) : null
      const deliveredAt = mapping.asDeliveredAt >= 0 ? parseJalaliDate(row[mapping.asDeliveredAt]) : null
      // پرچم‌ها: ستون‌های پرِ بلوک خدمات پس از فروش خارج از فیلد‌های نگاشت‌شده
      const flags: string[] = []
      for (let c = mapping.afterSalesCol; c < headers.length && c < row.length; c++) {
        if (knownAs.has(c)) continue
        const v = normText(row[c])
        if (v) flags.push(`${headers[c] || `ستون ${c + 1}`}: ${v}`)
      }
      const upd = mapping.asUpdate >= 0 ? normText(row[mapping.asUpdate]) : ''
      if (upd) flags.push(`آپدیت نرم‌افزار: ${upd}`)
      const returned = mapping.asReturned >= 0 ? normText(row[mapping.asReturned]) : ''
      const asNotes = mapping.asNotes >= 0 ? normText(row[mapping.asNotes]) : ''

      // رکورد فروش فقط با سریال خودِ بلوک فروش ثبت می‌شود (مستقل از سطر تولید)
      const serial = asSerial
      if (!serial) continue
      if (!customerRaw && !saleDate && !deliveredAt && flags.length === 0 && !asNotes) continue

      try {
        let device = await db.device.findFirst({ where: { serial } })
        if (!device && opts.createDeviceStubs) {
          device = await db.device.create({
            data: {
              serial,
              productId: product.id,
              productRevisionId: revision.id,
              status: 'IN_PRODUCTION',
              notes: `ساخت خودکار از سوابق فروش (تولید در سامانه ثبت نشده) — اکسل «${fileName}»`,
            },
          })
          stubs++
        }
        if (!device) {
          if (r.warnings.length < MAX_ERR) r.warnings.push(`سریال ${serial}: در سوابق تولید یافت نشد و ایجاد خودکار غیرفعال است.`)
          continue
        }

        // مشتری
        let customerId: string | null = null
        if (customerRaw) {
          const { name, city, type } = parseCustomer(customerRaw)
          const key = nameKeys(name)[0] ?? name
          if (customerCache.has(key)) {
            customerId = customerCache.get(key)!
          } else {
            let cust = await db.customer.findFirst({ where: { name } })
            if (!cust) {
              const count = await db.customer.count()
              cust = await db.customer.create({
                data: { code: `C-${String(count + 1).padStart(3, '0')}`, name, city, type },
              })
              customers++
            }
            customerId = cust.id
            customerCache.set(key, cust.id)
          }
        }

        const noteParts = [
          saleDate ? `تاریخ خدمات: ${toEnDigits(normText(row[mapping.asDate]))}` : '',
          returned ? 'مرجوعی فروش' : '',
          ...flags,
          asNotes ? `توضیحات: ${asNotes}` : '',
        ].filter(Boolean)

        await db.device.update({
          where: { id: device.id },
          data: {
            customerId: customerId ?? device.customerId,
            // تاریخ خدمات پس از فروش، مدرک تحویل اولیه محصول نیست.

            ...(noteParts.length && !device.notes?.includes(noteParts.join(' | '))
              ? { notes: device.notes ? `${device.notes} | ${noteParts.join(' | ')}` : noteParts.join(' | ') }
              : {}),
          },
        })
        deliveries++
      } catch (e) {
        if (r.errors.length < MAX_ERR) r.errors.push(`فروش سریال ${serial}: ${e instanceof Error ? e.message.slice(0, 120) : 'خطا'}`)
      }
    }
    r.warnings.unshift(`خدمات پس از فروش: ${deliveries} سابقه خدمات بررسی شد (${stubs} دستگاه خودکار، ${customers} مشتری جدید).`)
  }

  await audit(req, user, 'EXCEL_IMPORT', {
    entityType: 'Device',
    entityCode: fileName,
    newValues: { sheet: opts.sheet, product: productCode, created: r.created, updated: r.updated },
  })
  return r
}
