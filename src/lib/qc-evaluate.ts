import { toEnDigits } from './excel'

export function evaluateQc(actual: string, min: number | null, max: number | null, explicit?: boolean): boolean {
  const normalized = toEnDigits(actual).trim().replace(/٫/g, '.')
  if (min !== null || max !== null) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) throw new Error('مقدار آزمون عددی باید فقط یک عدد معتبر باشد.')
    const value = Number(normalized)
    if (!Number.isFinite(value)) throw new Error('مقدار آزمون نامعتبر است.')
    const result = (min === null || value >= min) && (max === null || value <= max)
    if (explicit !== undefined && explicit !== result) throw new Error('نتیجه انتخاب‌شده با حدود عددی آزمون مغایرت دارد.')
    return result
  }
  if (explicit !== undefined) return explicit
  if (['pass', 'ok', 'تایید', 'تأیید', 'صحیح'].includes(normalized.toLowerCase())) return true
  if (['fail', 'nok', 'خطا', 'ناموفق'].includes(normalized.toLowerCase())) return false
  throw new Error('نتیجه آزمون باید صریحاً تعیین شود.')
}

export function finalTemplateScope(productId: string, productRevisionId: string) {
  return { stage: 'FINAL', required: true, active: true, OR: [
    { productRevisionId },
    { productId, productRevisionId: null },
    { productId: null, productRevisionId: null, componentId: null },
  ] }
}
