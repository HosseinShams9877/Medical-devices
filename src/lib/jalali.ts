// ─────────────────────────────────────────────────────────────
// تاریخ شمسی (جلالی) و اعداد فارسی — الگوریتم استاندارد jalaali
// ─────────────────────────────────────────────────────────────

function div(a: number, b: number): number {
  return Math.floor(a / b)
}

export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy = gy <= 1600 ? 0 : 979
  gy -= gy <= 1600 ? 621 : 1600
  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) - 80 +
    gd +
    g_d_m[gm - 1]
  jy += 33 * div(days, 12053)
  days %= 12053
  jy += 4 * div(days, 1461)
  days %= 1461
  if (days > 365) {
    jy += div(days - 1, 365)
    days = (days - 1) % 365
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return [jy, jm, jd]
}

export function toGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy = jy <= 979 ? 621 : 1600
  jy -= jy <= 979 ? 0 : 979
  let days =
    365 * jy +
    div(jy, 33) * 8 +
    div((jy % 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  gy += 400 * div(days, 146097)
  days %= 146097
  if (days > 36524) {
    gy += 100 * div(--days, 36524)
    days %= 36524
    if (days >= 365) days++
  }
  gy += 4 * div(days, 1461)
  days %= 1461
  if (days > 365) {
    gy += div(days - 1, 365)
    days = (days - 1) % 365
  }
  let gd = days + 1
  const sal_a = [
    0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ]
  let gm = 0
  for (gm = 1; gm <= 12; gm++) {
    if (gd <= sal_a[gm]) break
    gd -= sal_a[gm]
  }
  return [gy, gm, gd]
}

const faNum = (n: number | string): string =>
  String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])

export const fa = faNum
export const faInt = (n: number): string => faNum(new Intl.NumberFormat('en-US').format(Math.round(n)).replace(/,/g, '،'))

export function formatJalali(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return '—'
  const [jy, jm, jd] = toJalali(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
  const base = `${faNum(jy)}/${faNum(String(jm).padStart(2, '0'))}/${faNum(String(jd).padStart(2, '0'))}`
  if (!withTime) return base
  const h = String(dt.getHours()).padStart(2, '0')
  const m = String(dt.getMinutes()).padStart(2, '0')
  return `${base} — ${faNum(h)}:${faNum(m)}`
}

export function relTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  const diff = Date.now() - dt.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'لحظه‌ای پیش'
  if (mins < 60) return `${faNum(mins)} دقیقه پیش`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${faNum(hours)} ساعت پیش`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${faNum(days)} روز پیش`
  return formatJalali(dt)
}
