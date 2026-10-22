export type ImportKind = 'products' | 'bom' | 'customers'
export const IMPORT_FIELDS: Record<ImportKind, [string, string][]> = {
  products: [ ['code', 'کد محصول *'], ['name', 'نام محصول *'], ['unit', 'واحد محصول *'], ['revision', 'نسخه محصول (پیش‌فرض A)'], ['category', 'گروه محصول'], ['warrantyMonths', 'گارانتی (ماه؛ پیش‌فرض ۱۲)'] ],
  bom: [ ['productCode', 'کد محصول *'], ['productName', 'نام محصول ناشناخته'], ['revision', 'نسخه محصول (پیش‌فرض A)'], ['componentCode', 'کد قطعه *'], ['componentName', 'نام قطعه ناشناخته'], ['unit', 'واحد قطعه *'], ['qty', 'مصرف برای یک واحد *'], ['criticality', 'اهمیت NORMAL / CRITICAL'] ],
  customers: [ ['code', 'کد مشتری *'], ['name', 'نام مشتری *'], ['type', 'نوع HOSPITAL / CLINIC / DISTRIBUTOR / OTHER'], ['contactPerson', 'شخص رابط'], ['phone', 'تلفن (متنی)'], ['email', 'ایمیل'], ['city', 'شهر'], ['address', 'نشانی'] ],
}
export type ImportRow = { row: number; values: Record<string, string>; action: 'create' | 'update' | 'skip' | 'error'; errors: string[]; warnings: string[] }
