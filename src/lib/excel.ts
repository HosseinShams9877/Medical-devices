// ─────────────────────────────────────────────────────────────
// Excel Core — تشخیص هوشمند ساختار فایل، نرمال‌سازی فارسی،
// تطبیق نام اقلام، تبدیل تاریخ جلالی (بدون وابستگی به DB)
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'

// ─── انواع عمومی ───
export type SheetKind = 'SUPPLIERS' | 'COMPONENTS' | 'BOM' | 'DEVICES' | 'UNKNOWN'

export const SHEET_KIND_LABELS: Record<SheetKind, string> = {
  SUPPLIERS: 'تأمین‌کنندگان',
  COMPONENTS: 'موجودی انبار (قطعات)',
  BOM: 'BOM محصول',
  DEVICES: 'سوابق تولید دستگاه',
  UNKNOWN: 'نامشخص',
}

export interface Cell { v: string }

export interface SheetInfo {
  name: string
  kind: SheetKind
  headerRowIndex: number // 0-based
  headers: string[]
  dataRows: number
  hasAfterSales: boolean
  afterSalesCol: number | null // شروع بلوک خدمات پس از فروش (index)
  mapping: Record<string, number> // فیلد → ستون (0-based؛ -1 = موجود نیست)
  preview: string[][] // ۳ سطر نمونه
  warnings: string[]
}

export interface InspectResult {
  fileName: string
  sheets: SheetInfo[]
}

// ─── نرمال‌سازی متن فارسی/لاتین ───
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

export function toEnDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => {
    const fi = FA_DIGITS.indexOf(d)
    return String(fi >= 0 ? fi : AR_DIGITS.indexOf(d))
  })
}

export function normText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.replace(/\u200c|\u200f|\u200e/g, '').trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    // متن غنی (Rich Text)
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((t) => t?.text ?? '').join('').replace(/\u200c|\u200f|\u200e/g, '').trim()
    }
    // فرمول — مقدار نتیجه
    if (o.result !== undefined && o.result !== null) return normText(o.result)
    if (typeof o.text === 'string') return o.text.replace(/\u200c|\u200f|\u200e/g, '').trim()
    if (typeof o.hyperlink === 'string') return typeof o.text === 'string' ? o.text : o.hyperlink
    if (o.error) return ''
  }
  return ''
}

// کلید تطبیق سطح ۱ — فاصله‌زدایی + یکسان‌سازی حروف
export function normKey(s?: string): string {
  return toEnDigits(
    (s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase(),
  ).replace(/\s+/g, '')
}

const CAT_PREFIX = /^(c|r|l|fu|d|q|u|j|sw|lcd|bat|ant|f|fb|ic|led|xt)\s*:/
const SMD_PKG = /\((?:0603|0805|1206|1210|2010|2512|0810)\)/g
const OHM = /(ω|Ω|Ω|ohm)$/i

/** کلید‌های تطبیق نام قطعه — از خاص به عام */
export function nameKeys(name: string): string[] {
  const k1 = normKey(name)
  const k2raw = k1.replace(CAT_PREFIX, '').replace(/\//g, '.')
  const k2 = k2raw.replace(SMD_PKG, '')
  const k3 = k2.replace(OHM, '')
  // نقطه‌ها حفظ می‌شوند تا 1.5k با 15k یکی نشود
  const k4 = k3.replace(/[^a-z0-9.\u0600-\u06FF]/g, '')
  const out: string[] = []
  for (const k of [k1, k2, k3, k4]) {
    if (k && !out.includes(k)) out.push(k)
    const nb = k.replace(SMD_PKG, '')
    if (nb && nb !== k && !out.includes(nb)) out.push(nb)
  }
  return out
}

const GENERIC_TOKENS = new Set(['sma', 'sot', 'melf', 'size', 'type', 'pin', 'mm', 'mil'])

/** توکن‌های نام برای تطبیق تقریبی */
export function nameTokens(name: string): Set<string> {
  let base = toEnDigits(name.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\//g, '.')).toLowerCase()
  // بسته‌های SMD حذف می‌شوند — «1206» نباید بین همهٔ خازن‌ها مشترک باشد
  base = base.replace(/\((?:0603|0805|1206|1210|2010|2512|0810|1010)\)/g, ' ')
  const raw = base
    .split(/[^a-z0-9\u0600-\u06FF.]+/)
    .filter(Boolean)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t && !/^(?:0603|0805|1206|1210|2010|2512|0810|1010)$/.test(t))
  const out = new Set<string>()
  for (const t of raw) {
    out.add(t)
    // حذف نقطه فقط برای توکن‌های بی‌رقم — تا «1.5k» با «15k» یکی نشود
    if (!/\d/.test(t)) {
      const nd = t.replace(/\./g, '')
      if (nd) out.add(nd)
    }
    // نماد مقاومت: 22R → 22
    const r = t.match(/^(\d+(?:\.\d+)?)r$/)
    if (r) out.add(r[1])
    // نماد اهم: 22ω → 22
    const om = t.match(/^(\d+(?:\.\d+)?)(?:ω|ohm)$/)
    if (om) out.add(om[1])
  }
  return out
}

/** توکن‌های حاوی رقم — برای قاعدهٔ «توافق عددی» */
function numericTokens(tokens: Set<string>): Set<string> {
  return new Set([...tokens].filter((t) => /\d/.test(t)))
}

/** توکن‌های «ارزش» (ظرفیت/مقاومت) — اگر هر دو نام دارند، باید مشترک باشند */
const VALUE_RE = /^\d+(?:\.\d+)?(?:uf|nf|pf|f|k|r|m)?$/
function valueTokens(tokens: Set<string>): Set<string> {
  return new Set([...tokens].filter((t) => VALUE_RE.test(t) && t.length >= 2))
}

/** تعارض طبقهٔ واحد (ولتاژ/جریان/سلف) — 10v در برابر 25v یعنی قطعهٔ متفاوت */
const UNIT_CLASSES = ['v', 'a', 'ma', 'uh', 'mh', 'w']
function classTokens(tokens: Set<string>, cls: string): Set<string> {
  const re = new RegExp(`^\\d+(?:\\.\\d+)?${cls}$`)
  return new Set([...tokens].filter((t) => re.test(t)))
}

// ─── تطبیق نام به فهرست قطعات موجود ───
export interface NameIndexEntry { name: string; keys: string[]; tokens: Set<string> }

export function buildNameIndex(names: string[]): NameIndexEntry[] {
  return names.map((n) => ({ name: n, keys: nameKeys(n), tokens: nameTokens(n) }))
}

export function matchByName(
  name: string,
  index: NameIndexEntry[],
): { name: string; how: 'exact' | 'tokens' | 'prefix' | 'contains' } | null {
  const qKeys = nameKeys(name)
  // ۱) تطبیق کلیدی دقیق
  for (const q of qKeys) {
    for (const e of index) {
      if (e.keys.includes(q)) return { name: e.name, how: 'exact' }
    }
  }
  // ۲) توکن‌های مشترک — شواهد بیشتر از پیشوند دارد، پس قبل از آن امتحان می‌شود
  const qT = nameTokens(name)
  const qNum = numericTokens(qT)
  if (qT.size > 0) {
    let best: { name: string; score: number } | null = null
    for (const e of index) {
      let shared = 0
      for (const t of qT) if (e.tokens.has(t)) shared++
      if (shared === 0) continue
      // قاعدهٔ توافق عددی: اگر هر دو نام توکن عددی دارند، حداقل یکی باید مشترک باشد
      const eNum = numericTokens(e.tokens)
      if (qNum.size > 0 && eNum.size > 0) {
        let numShared = false
        for (const t of qNum) if (eNum.has(t)) numShared = true
        if (!numShared) continue
      }
      // قاعدهٔ توافق ارزش: ظرفیت/مقاومت متفاوت (100uf در برابر 1000uf) یعنی قطعهٔ متفاوت
      const qVal = valueTokens(qT)
      const eVal = valueTokens(e.tokens)
      if (qVal.size > 0 && eVal.size > 0) {
        let valShared = false
        for (const t of qVal) if (eVal.has(t)) valShared = true
        if (!valShared) continue
      }
      // تعارض طبقهٔ واحد: هر دو ولتاژ/جریان مشخص دارند اما متفاوت‌اند
      let classConflict = false
      for (const cls of UNIT_CLASSES) {
        const qc = classTokens(qT, cls)
        const ec = classTokens(e.tokens, cls)
        if (qc.size > 0 && ec.size > 0) {
          let sharedUnit = false
          for (const t of qc) if (ec.has(t)) sharedUnit = true
          if (!sharedUnit) { classConflict = true; break }
        }
      }
      if (classConflict) continue
      if (shared === 1) {
        const t = [...qT].find((x) => e.tokens.has(x))!
        const singleOk =
          (qT.size === 1 && e.tokens.size === 1) ||
          (t.length >= 3 && /\d/.test(t) && !GENERIC_TOKENS.has(t) && e.tokens.size <= 3)
        if (!singleOk) continue
      }
      if (!best || shared > best.score) best = { name: e.name, score: shared }
    }
    if (best) return { name: best.name, how: 'tokens' }
  }
  // ۳) پیشوند (دوطرفه) و سپس شامل‌شدن (هر دو ≥ ۶)
  const q = qKeys[qKeys.length - 1] ?? ''
  if (q.length >= 4) {
    for (const e of index) {
      const c = e.keys[e.keys.length - 1] ?? ''
      if (c.length >= 4 && (c.startsWith(q) || q.startsWith(c))) return { name: e.name, how: 'prefix' }
    }
    for (const e of index) {
      const c = e.keys[e.keys.length - 1] ?? ''
      if (c.length >= 6 && q.length >= 6 && (c.includes(q) || q.includes(c))) return { name: e.name, how: 'contains' }
    }
  }
  return null
}

// ─── عدد و تاریخ ───
export function parseNum(v: unknown): number | null {
  const s = normText(v).replace(/,/g, '').replace(/٫/g, '.')
  if (!s) return null
  const n = Number(toEnDigits(s))
  return Number.isFinite(n) ? n : null
}

/** تبدیل رشتهٔ تاریخ جلالی (۱۴۰۳/۰۴/۲۸) به Date — نامعتبر → null */
export function parseJalaliDate(v: unknown): Date | null {
  const s = toEnDigits(normText(v)).replace(/[-.]/g, '/')
  if (!s) return null
  const m = s.match(/^(\d{3,4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  const jy = Number(m[1]), jm = Number(m[2]), jd = Number(m[3])
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null
  // الگوریتم تبدیل (jalaali-js — دامنهٔ عمومی)
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324,
    2394, 2456, 3178,
  ]
  function jalCal(jy: number) {
    const bl = breaks.length
    const gy = jy + 621
    let leapJ = -14
    let jp = breaks[0]
    if (jy < jp || jy >= breaks[bl - 1]) throw new Error('out of range')
    let jump = 0
    for (let i = 1; i < bl; i += 1) {
      const jm2 = breaks[i]
      jump = jm2 - jp
      if (jy < jm2) break
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
      jp = jm2
    }
    let n = jy - jp
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
    const march = 20 + leapJ - leapG
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
    let leap = mod(mod(n + 1, 33) - 1, 4)
    if (leap === -1) leap = 4
    return { leap, gy, march }
  }
  const div = (a: number, b: number) => ~~(a / b)
  const mod = (a: number, b: number) => a - ~~(a / b) * b
  function j2d(jy: number, jm: number, jd: number) {
    const r = jalCal(jy)
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
  }
  function g2d(gy: number, gm: number, gd: number) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
    return d
  }
  function d2g(jdn: number) {
    let j = 4 * jdn + 139361631
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
    const i = div(mod(j, 1461), 4) * 5 + 308
    const gd = div(mod(i, 153), 5) + 1
    const gm = mod(div(i, 153), 12) + 1
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
    return { gy, gm, gd }
  }
  try {
    const jdn = j2d(jy, jm, jd)
    const g = d2g(jdn)
    const dt = new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 8, 0, 0)) // ساعت ۱۲ ایران (UTC+3:30 → نزدیک‌ترین)
    return Number.isNaN(dt.getTime()) ? null : dt
  } catch {
    return null
  }
}

// ─── تشخیص نوع شیت بر اساس سرستون‌ها ───
function h(i: string): string {
  return normKey(i) // سرستون نرمال‌شده
}

export function detectSheetKind(headers: string[]): {
  kind: SheetKind
  mapping: Record<string, number>
  afterSalesCol: number | null
} {
  const n = headers.map(h)
  const find = (...patterns: RegExp[]): number => n.findIndex((x) => patterns.some((p) => p.test(x)))
  const mapping: Record<string, number> = {}

  // ── تأمین‌کنندگان ──
  if (n.some((x) => x.includes('تامین')) || n.some((x) => x.includes('تأمین'))) {
    const kind: SheetKind = 'SUPPLIERS'
    mapping.name = find(/تامین/, /تأمین/)
    mapping.website = find(/سایت/, /site/, /وب/)
    mapping.code = find(/^کد$/, /کدمختص/)
    mapping.isoCode = find(/ایزو/)
    return { kind, mapping, afterSalesCol: null }
  }

  // ── دستگاه‌ها (تولید) ──
  const serialCol = find(/شمارهسریال/)
  if (serialCol >= 0) {
    const kind: SheetKind = 'DEVICES'
    mapping.serial = serialCol
    const dateCols = n.map((x, i) => ({ x, i })).filter(({ x }) => /^تاریخ$/.test(x)).map(({ i }) => i)
    mapping.date = dateCols[0] ?? find(/^تاریخ/)
    mapping.sim = find(/سیمکارت/)
    mapping.version = find(/ورژن/, /نسخه/)
    // ستون بعد از ورژن (بدون سرستون QC مانند) → پیکربندی سنسور؛ بعد از آن → توضیحات
    if (mapping.version >= 0) {
      let cfg = mapping.version + 1
      while (cfg < n.length && /^(qc|test|fqc)/.test(n[cfg] ?? 'qc')) cfg++
      mapping.sensor = cfg < n.length ? cfg : -1
      mapping.notes =
        cfg + 1 < n.length && !/^(qc|test|fqc)/.test(n[cfg + 1] ?? 'qc') && n[cfg + 1] === '' ? cfg + 1 : -1
    } else {
      // ستون «ورژن» سرستون ندارد → اولین ستون بی‌سرستون پس از FQC ورژن است
      const fqcCol = find(/^fqc$/, /^fqc/)
      if (fqcCol >= 0 && fqcCol + 1 < n.length && n[fqcCol + 1] === '') {
        mapping.version = fqcCol + 1
        mapping.sensor = fqcCol + 2 < n.length && n[fqcCol + 2] === '' ? fqcCol + 2 : -1
        mapping.notes = fqcCol + 3 < n.length && n[fqcCol + 3] === '' ? fqcCol + 3 : -1
      }
    }
    // بلوک خدمات پس از فروش: دومین ستون «تاریخ»
    const afterSalesCol = dateCols.length >= 2 ? dateCols[1] : null
    if (afterSalesCol !== null) {
      const aIdx = (p: RegExp) => {
        for (let i = afterSalesCol; i < n.length; i++) if (p.test(n[i])) return i
        return -1
      }
      mapping.asDate = aIdx(/^تاریخ$/)
      mapping.asSerial = aIdx(/^سریال$/)
      mapping.asWarranty = aIdx(/گارانتی/)
      mapping.asCustomer = aIdx(/مرکز|بیمارستان/)
      mapping.asReturned = aIdx(/مرجوع/)
      mapping.asDeliveredAt = aIdx(/تاریختحویل/)
      mapping.asNotes = aIdx(/توضیحات/)
      mapping.asUpdate = aIdx(/آپدیت/)
    }
    return { kind, mapping, afterSalesCol }
  }

  // ── موجودی انبار ──
  if (n.some((x) => x.includes('نامکالا')) && n.some((x) => x.includes('موجودی'))) {
    const kind: SheetKind = 'COMPONENTS'
    mapping.code = find(/^کدکالا$/, /کدکالا/)
    mapping.category = find(/گروهکالا/, /گروه/)
    mapping.name = find(/نامکالا/)
    // موجودی فعلی ترجیح؛ وگرنه «موجودی» ساده یا «موجودی اولیه»
    mapping.qty =
      find(/موجودیفعلی/) >= 0
        ? find(/موجودیفعلی/)
        : find(/^موجودی$/) >= 0
          ? find(/^موجودی$/)
          : find(/موجودیاولیه/)
    mapping.qtyInit = find(/موجودیاولیه/)
    mapping.scrap = find(/ضایعات/)
    return { kind, mapping, afterSalesCol: null }
  }

  // ── BOM ──
  if (n.some((x) => x.includes('نامکالا')) && n.some((x) => x === 'تعداد' || x.includes('تعداد'))) {
    const kind: SheetKind = 'BOM'
    mapping.code = find(/^کدکالا$/, /کدکالا/)
    mapping.name = find(/نامکالا/)
    mapping.qty = find(/تعداد/)
    return { kind, mapping, afterSalesCol: null }
  }

  return { kind: 'UNKNOWN', mapping, afterSalesCol: null }
}

// ─── خواندن فایل و تشخیص ساختار ───
function rowValues(ws: ExcelJS.Worksheet, r: number, width: number): string[] {
  const vals: string[] = new Array(width).fill('')
  const row = ws.getRow(r)
  for (let c = 1; c <= width; c++) {
    vals[c - 1] = normText(row.getCell(c).value)
  }
  return vals
}

export async function inspectWorkbook(buffer: Buffer, fileName: string): Promise<InspectResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheets: SheetInfo[] = []

  for (const ws of wb.worksheets) {
    if (!ws.rowCount || ws.rowCount < 2) continue
    const width = Math.max(ws.columnCount, 3)
    // پیدا کردن سطر سرستون: اولین سطر غیرخالی با ≥ ۲ سلول پر
    let headerRowIndex = 0
    let headers: string[] = []
    for (let r = 1; r <= Math.min(ws.rowCount, 5); r++) {
      const vals = rowValues(ws, r, width)
      const filled = vals.filter(Boolean).length
      if (filled >= 2) {
        // سرستون باید حاوی «نام کالا / سریال / تامین / کد» باشد نه داده
        const joined = vals.join(' ')
        if (/نام کالا|نامکالا|سریال|تامین|تأمین|کد|تاریخ|تعداد/i.test(joined)) {
          headerRowIndex = r - 1
          headers = vals
          break
        }
      }
    }
    if (!headers.length) {
      headerRowIndex = 0
      headers = rowValues(ws, 1, width)
    }

    const { kind, mapping, afterSalesCol } = detectSheetKind(headers)

    // شمارش سطر‌های داده + پیش‌نمایش
    let dataRows = 0
    const preview: string[][] = []
    for (let r = headerRowIndex + 2; r <= ws.rowCount; r++) {
      const vals = rowValues(ws, r, width)
      if (vals.some(Boolean)) {
        dataRows++
        if (preview.length < 3) preview.push(vals.slice(0, 10).map((v) => v.slice(0, 40)))
      }
    }

    const warnings: string[] = []
    if (kind === 'UNKNOWN') warnings.push('ساختار این شیت شناسایی نشد — برای ورود، ساختار باید مطابق قالب‌ها باشد.')
    if (kind === 'COMPONENTS' && mapping.code < 0) warnings.push('ستون «کد کالا» یافت نشد؛ کد برای اقلام جدید به‌صورت خودکار ساخته می‌شود.')
    if (kind === 'DEVICES' && afterSalesCol !== null) warnings.push('این شیت شامل بلوک «خدمات پس از فروش» هم هست.')

    sheets.push({
      name: ws.name,
      kind,
      headerRowIndex,
      headers: headers.filter((x) => x !== undefined),
      dataRows,
      hasAfterSales: afterSalesCol !== null,
      afterSalesCol,
      mapping,
      preview,
      warnings,
    })
  }
  return { fileName, sheets }
}

/** استخراج سطر‌های یک شیت به‌صورت آرایهٔ رشته‌ها */
export async function extractRows(buffer: Buffer, sheetName: string, headerRowIndex: number): Promise<string[][]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.getWorksheet(sheetName)
  if (!ws) return []
  const width = Math.max(ws.columnCount, 3)
  const rows: string[][] = []
  for (let r = headerRowIndex + 2; r <= ws.rowCount; r++) {
    const vals = rowValues(ws, r, width)
    if (vals.some(Boolean)) rows.push(vals)
  }
  return rows
}
