// ─────────────────────────────────────────────────────────────
// Excel Import — نوشتن داده‌های استخراج‌شده در DB با گزارش شفاف
// اصول: هیچ سطری بی‌گزارش رد نمی‌شود؛ رکورد تکراری به‌روزرسانی می‌شود
// ─────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { SessionUser } from '@/lib/auth'
import { recordMovement } from '@/lib/stock'
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
  rows: string[][],
  mapping: Record<string, number>,
  sheet: string,
  user: SessionUser,
  req: NextRequest | null,
  fileName: string,
): Promise<SheetReport> {
  const r = rpt('COMPONENTS', sheet)
  const allComponents: { id: string; code: string; name: string; stockQty: number; category: string | null }[] =
    await db.component.findMany({ select: { id: true, code: true, name: true, stockQty: true, category: true } })
  const index: NameIndexEntry[] = buildNameIndex(allComponents.map((c) => c.name))
  const usedCodes = new Set(allComponents.map((c) => c.code))
  let autoSeq = 0

  for (const row of rows) {
    const name = normText(row[mapping.name])
    if (!name) {
      r.skipped++
      continue
    }
    let code = mapping.code >= 0 ? normText(row[mapping.code]) : ''
    const category = mapping.category >= 0 ? normText(row[mapping.category]) || null : null
    // موجودی: «موجودی فعلی» اگر پر باشد؛ وگرنه «موجودی اولیه»؛ خالی = بدون تغییر
    const qtyCur = mapping.qty >= 0 ? normText(row[mapping.qty]) : ''
    const qtyInit = mapping.qtyInit >= 0 ? normText(row[mapping.qtyInit]) : ''
    const qtyRaw = qtyCur || qtyInit
    const hasStockInfo = qtyRaw !== '' || (mapping.qty >= 0 && /delete|حذف/i.test(qtyCur))
    let qty = parseNum(qtyRaw)
    if (qty === null) {
      if (/delete|حذف/i.test(qtyCur)) {
        qty = 0
        r.warnings.push(`«${name}»: مقدار «${qtyCur}» به‌عنوان صفر (حذف‌شده) در نظر گرفته شد.`)
      } else if (qtyRaw !== '') {
        r.warnings.push(`«${name}»: مقدار موجودی «${qtyRaw}» عدد نیست؛ صفر ثبت شد.`)
        qty = 0
      } else {
        qty = null // هیچ ستون موجودی پر نیست
      }
    }

    try {
      // یافتن موجود: با کد (فقط اگر نام هم‌خوانی داشته باشد) یا با تطبیق نام
      let comp = null as null | { id: string; code: string; name: string; stockQty: number; category: string | null }
      if (code) {
        const byCode = allComponents.find((c) => c.code === code) ?? null
        if (byCode) {
          // کد پیدا شد اما نام سازگار نیست → کد به قطعهٔ دیگری تعلق دارد
          const nm = matchByName(name, [buildNameIndex([byCode.name])[0]])
          if (nm) {
            comp = byCode
          } else {
            let alt = code
            let i = 2
            while (usedCodes.has(alt)) alt = `${code}-${i++}`
            r.warnings.push(`کد «${code}» به «${byCode.name}» تعلق دارد؛ برای «${name}» کد «${alt}» ساخته شد.`)
            code = alt
          }
        } else if (usedCodes.has(code)) {
          let alt = code
          let i = 2
          while (usedCodes.has(alt)) alt = `${code}-${i++}`
          r.warnings.push(`کد «${code}» تکراری است؛ برای «${name}» کد «${alt}» ساخته شد.`)
          code = alt
        }
      }
      if (!comp) {
        const m = matchByName(name, index)
        if (m) {
          comp = allComponents.find((c) => c.name === m.name) ?? null
          if (comp && m.how !== 'exact' && r.warnings.length < MAX_ERR) {
            r.warnings.push(`«${name}» با قطعهٔ موجود «${comp.name}» تطبیق داده شد (${m.how}).`)
          }
        }
      }

      if (!comp) {
        // ایجاد قطعهٔ جدید
        if (!code) {
          autoSeq++
          const prefix = 'AC-'
          let base = 0
          for (const c of usedCodes) {
            const n = Number(c.replace(prefix, ''))
            if (c.startsWith(prefix) && Number.isFinite(n)) base = Math.max(base, n)
          }
          code = `${prefix}${String(base + autoSeq).padStart(4, '0')}`
          r.warnings.push(`«${name}»: کد نداشت؛ کد خودکار «${code}» ساخته شد.`)
        }
        const created = await db.component.create({
          data: { code, name, category, stockQty: qty ?? 0 },
        })
        // لات اولیه + گردش
        const lot = await db.componentLot.create({
          data: {
            componentId: created.id,
            lotNumber: 'INITIAL',
            quantity: qty ?? 0,
            remaining: qty ?? 0,
            status: 'APPROVED',
          },
        })
        if (hasStockInfo) {
          await recordMovement({
            componentId: created.id,
            type: 'ADJUST',
            qty: qty ?? 0,
            beforeQty: 0,
            afterQty: qty ?? 0,
            reason: `ورود اولیه موجودی از اکسل «${fileName}» — شیت «${sheet}»`,
            lotId: lot.id,
            lotNumber: 'INITIAL',
            userId: user.id,
          })
        }
        usedCodes.add(code)
        index.push(buildNameIndex([name])[0])
        allComponents.push({ id: created.id, code, name: created.name, stockQty: qty ?? 0, category })
        r.created++
      } else {
        // به‌روزرسانی موجودی (فقط اگر ستون موجودی پر بوده)
        const targetQty = qty ?? comp.stockQty
        const delta = targetQty - comp.stockQty
        if (qty !== null && delta !== 0) {
          await db.component.update({ where: { id: comp.id }, data: { stockQty: targetQty, category: category ?? comp.category } })
          let lot = await db.componentLot.findFirst({ where: { componentId: comp.id, lotNumber: 'INITIAL' } })
          if (!lot) {
            lot = await db.componentLot.create({
              data: { componentId: comp.id, lotNumber: 'INITIAL', quantity: targetQty, remaining: targetQty, status: 'APPROVED' },
            })
          } else {
            await db.componentLot.update({
              where: { id: lot.id },
              data: { remaining: targetQty, quantity: Math.max(lot.quantity, targetQty) },
            })
          }
          await recordMovement({
            componentId: comp.id,
            type: 'ADJUST',
            qty: delta,
            beforeQty: comp.stockQty,
            afterQty: targetQty,
            reason: `اصلاح موجودی از اکسل «${fileName}» — شیت «${sheet}»`,
            lotId: lot.id,
            lotNumber: 'INITIAL',
            userId: user.id,
          })
          comp.stockQty = targetQty
        } else if (category) {
          await db.component.update({ where: { id: comp.id }, data: { category: category ?? comp.category } })
        }
        r.updated++
      }
    } catch (e) {
      if (r.errors.length < MAX_ERR) r.errors.push(`«${name}»: ${e instanceof Error ? e.message.slice(0, 120) : 'خطا'}`)
      r.skipped++
    }
  }
  await audit(req, user, 'EXCEL_IMPORT', {
    entityType: 'Component',
    entityCode: fileName,
    newValues: { sheet, created: r.created, updated: r.updated, skipped: r.skipped },
  })
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
  if (!items.length) return r

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
        if (comp && !matchByName(it.name, [{ name: comp.name, keys: nameKeys(comp.name), tokens: nameTokens(comp.name) }])) {
          comp = undefined // کد به قطعهٔ ناسازگار اشاره می‌کند
        }
        if (!comp) {
          const m = matchByName(it.name, index)
          if (m) comp = components.find((c) => c.name === m.name)
          if (comp && m?.how !== 'exact' && r.warnings.length < MAX_ERR + 20) {
            r.warnings.push(`«${it.name}» با قطعهٔ موجود «${comp.name}» تطبیق داده شد (${m!.how}).`)
          }
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
        if (!comp) {
          if (r.errors.length < MAX_ERR) r.errors.push(`«${it.name}»: قطعهٔ متناظر یافت نشد و ایجاد خودکار غیرفعال است.`)
          r.skipped++
          continue
        }
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
      return { bomId: bom.id, productCode: product.code, createdItems }
    })
    r.created += result.createdItems
    await audit(req, user, 'EXCEL_IMPORT', {
      entityType: 'Bom',
      entityCode: `${result.productCode}#${result.bomId}`,
      newValues: { sheet: opts.sheet, items: result.createdItems },
    })
  } catch (e) {
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
            firmwareVersion: version ?? existing.firmwareVersion,
            ...(notes ? { notes: existing.notes ? `${existing.notes} | ${notes}` : notes } : {}),
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
            status: 'QC_PASS',
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
              status: 'DELIVERED',
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
          saleDate ? `فروش: ${toEnDigits(normText(row[mapping.asDate]))}` : '',
          returned ? 'مرجوعی فروش' : '',
          ...flags,
          asNotes ? `توضیحات: ${asNotes}` : '',
        ].filter(Boolean)

        await db.device.update({
          where: { id: device.id },
          data: {
            customerId: customerId ?? device.customerId,
            deliveredAt: device.deliveredAt ?? deliveredAt ?? saleDate ?? undefined,
            ...(device.status !== 'SCRAPPED' && device.status !== 'DELIVERED' ? { status: 'DELIVERED' } : {}),
            ...(noteParts.length
              ? { notes: device.notes ? `${device.notes} | ${noteParts.join(' | ')}` : noteParts.join(' | ') }
              : {}),
          },
        })
        deliveries++
      } catch (e) {
        if (r.errors.length < MAX_ERR) r.errors.push(`فروش سریال ${serial}: ${e instanceof Error ? e.message.slice(0, 120) : 'خطا'}`)
      }
    }
    r.warnings.unshift(`خدمات پس از فروش: ${deliveries} تحویل ثبت شد (${stubs} دستگاه خودکار، ${customers} مشتری جدید).`)
  }

  await audit(req, user, 'EXCEL_IMPORT', {
    entityType: 'Device',
    entityCode: fileName,
    newValues: { sheet: opts.sheet, product: productCode, created: r.created, updated: r.updated },
  })
  return r
}
