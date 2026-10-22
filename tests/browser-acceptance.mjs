import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.MES_PLAYWRIGHT_MODULE || 'playwright')
const ExcelJS = require('exceljs')
const browser = await chromium.launch({ headless: true, ...(process.env.MES_CHROMIUM_PATH ? { executablePath: process.env.MES_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(12000)
const errors = [], checks = []
page.on('pageerror', e => errors.push(e.message))
const base = process.env.AUDIT_BASE || 'http://127.0.0.1:3200'
const dialog = () => page.getByRole('dialog').last()
async function clickAndResponse(button, path) {
  const promise = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'POST')
  const [response] = await Promise.all([promise, button.click()])
  const data = await response.json(); assert.equal(response.status(), 200, JSON.stringify(data)); return data
}
async function data(path) { const response = await page.request.get(base + path); assert.equal(response.status(), 200); return response.json() }
async function fixture(headers, values) { const w = new ExcelJS.Workbook(); const s = w.addWorksheet('data'); s.addRow(headers); s.addRow(values); return Buffer.from(await w.xlsx.writeBuffer()) }
async function importUi(buttonName, buffer, kind) {
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog().getByLabel('فایل اکسل').setInputFiles({ name: `${kind}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer })
  await dialog().getByRole('button', { name: 'اعتبارسنجی و پیش‌نمایش', exact: true }).click()
  await dialog().getByText('پیش‌نمایش؛ هنوز چیزی ثبت نشده', { exact: false }).waitFor()
  await clickAndResponse(dialog().getByRole('button', { name: 'تأیید و ثبت نهایی', exact: true }), '/api/catalog-import')
  await dialog().getByText('ثبت نهایی انجام شد', { exact: false }).waitFor()
  checks.push(`UI Excel ${kind}: mapping, preview and commit`)
  await dialog().getByRole('button', { name: 'Close', exact: true }).click()
}
try {
  await page.goto(base)
  await page.getByLabel('نام کاربری', { exact: true }).fill('audit_admin')
  await page.getByLabel('رمز عبور', { exact: true }).fill('Audit-Only-2026!')
  await page.getByRole('button', { name: 'ورود به سامانه', exact: true }).click()
  await page.getByRole('button', { name: 'موجودی و انبار', exact: true }).click()
  await page.getByRole('button', { name: 'تعریف قطعه جدید', exact: true }).click()
  await dialog().getByLabel('code', { exact: true }).fill('UI-C01'); await dialog().getByLabel('name', { exact: true }).fill('قطعه آزمون مرورگر')
  const component = (await clickAndResponse(dialog().getByRole('button', { name: 'ذخیره قطعه', exact: true }), '/api/components')).component
  assert.equal(component.stockQty, 0); checks.push('UI component definition creates zero stock')
  let row = page.getByRole('row').filter({ hasText: 'UI-C01' }).first()
  await row.getByRole('button', { name: 'ثبت رسید', exact: true }).click()
  await dialog().getByPlaceholder('LT-XXX-0000').fill('UI-LOT01'); await dialog().locator('input[type=number]').fill('3')
  const received = await clickAndResponse(dialog().getByRole('button', { name: 'ثبت رسید', exact: true }), '/api/inventory')
  assert.equal((await data('/api/inventory?q=UI-C01')).components[0].stockQty, 0)
  await page.getByRole('tab', { name: 'کنترل ورودی (IQC)', exact: true }).click()
  const inspectionRow = page.locator('div.rounded-xl.border').filter({ hasText: received.inspection.code }).last()
  await clickAndResponse(inspectionRow.getByRole('button', { name: 'تأیید لات', exact: true }), '/api/incoming')
  assert.equal((await data('/api/inventory?q=UI-C01')).components[0].stockQty, 3); checks.push('UI receive and IQC approval affect usable stock')

  await page.getByRole('button', { name: 'سفارش‌های تولید', exact: true }).click()
  await page.getByRole('button', { name: 'درخواست تولید جدید', exact: true }).click()
  await dialog().getByRole('button', { name: 'افزودن محصول جدید', exact: true }).click()
  await dialog().getByLabel('code', { exact: true }).fill('UI-P01'); await dialog().getByLabel('name', { exact: true }).fill('محصول مرورگر')
  const product = (await clickAndResponse(dialog().getByRole('button', { name: 'ذخیره محصول', exact: true }), '/api/products')).product
  await dialog().getByRole('button', { name: 'تعریف BOM', exact: true }).click()
  await dialog().getByRole('button', { name: 'افزودن قطعه', exact: true }).click()
  await dialog().getByRole('combobox').first().click(); await page.getByRole('option', { name: 'UI-C01 — قطعه آزمون مرورگر', exact: true }).click()
  await dialog().locator('input[type=number]').fill('2')
  await clickAndResponse(dialog().getByRole('button', { name: 'ایجاد و فعال‌سازی نسخه', exact: true }), `/api/products/${product.id}`)
  await page.getByRole('heading', { name: 'نسخه جدید BOM', exact: true }).waitFor({ state: 'detached' })
  await dialog().locator('input[type=number]').fill('4')
  await dialog().getByRole('cell', { name: '8 عدد', exact: true }).waitFor()
  mkdirSync('tests/screenshots', { recursive: true }); await page.screenshot({ path: 'tests/screenshots/order-material-preview.png' })
  const order = await clickAndResponse(dialog().getByRole('button', { name: 'ثبت پیش‌نویس درخواست', exact: true }), '/api/orders')
  assert.equal(order.order.productId, product.id); assert.equal(order.requirements.items[0].required, 8); assert.equal(order.requirements.items[0].shortage, 5)
  assert.equal((await data('/api/inventory?q=UI-C01')).components[0].stockQty, 3); checks.push('UI inline product + BOM + order: required 8, available 3, shortage 5, no deduction')

  await page.getByRole('button', { name: 'محصولات و BOM', exact: true }).click()
  await importUi('ورود محصولات از اکسل', await fixture(['code','name','unit'], ['UI-X-P','محصول اکسل مرورگر','دستگاه']), 'products')
  await importUi('ورود BOM از اکسل', await fixture(['productCode','componentCode','unit','qty'], ['UI-X-P','UI-C01','عدد',1]), 'bom')
  const importedProduct = (await data('/api/products')).products.find(p => p.code === 'UI-X-P')
  await page.getByRole('button', { name: 'سفارش‌های تولید', exact: true }).click(); await page.getByRole('button', { name: 'درخواست تولید جدید', exact: true }).click()
  await dialog().getByRole('combobox').nth(1).click(); await page.getByRole('option', { name: 'UI-X-P — محصول اکسل مرورگر', exact: true }).click()
  await dialog().locator('input[type=number]').fill('2'); await dialog().getByRole('cell', { name: '2 عدد', exact: true }).waitFor()
  const xo = await clickAndResponse(dialog().getByRole('button', { name: 'ثبت پیش‌نویس درخواست', exact: true }), '/api/orders'); assert.equal(xo.order.productId, importedProduct.id); checks.push('UI Excel product/BOM selected in new order')

  await page.getByRole('button', { name: 'خدمات پس از فروش', exact: true }).click(); await page.getByRole('tab', { name: 'مشتریان', exact: true }).click()
  await importUi('ورود مشتریان از اکسل', await fixture(['code','name','phone'], ['UI-CUST01','مشتری مرورگر','09120000004']), 'customers')
  await page.getByPlaceholder('کد، نام، شهر یا تلفن مشتری…').fill('UI-CUST01')
  await page.getByRole('radio', { name: 'انتخاب مشتری مرورگر', exact: true }).check()
  await page.getByRole('button', { name: 'ثبت درخواست خدمات برای مشتری منتخب', exact: true }).click()
  assert.ok(await dialog().getByRole('combobox').first().textContent().then(t => t.includes('مشتری مرورگر')))
  assert.equal(await dialog().locator('input[dir=ltr]').last().inputValue(), '09120000004')
  await dialog().locator('textarea').first().fill('درخواست بررسی دستگاه توسط مشتری واردشده از اکسل')
  await page.waitForTimeout(350)
  await page.screenshot({ path: 'tests/screenshots/imported-customer-service.png' })
  const ticket = (await clickAndResponse(dialog().getByRole('button', { name: 'ثبت تیکت', exact: true }), '/api/tickets')).ticket
  assert.equal(ticket.contactPhone, '09120000004'); assert.equal(ticket.status, 'NEW'); checks.push('UI imported customer selected, phone prefilled and service ticket created')
  assert.deepEqual(errors, []); checks.push('No browser page errors')
  writeFileSync('tests/browser-test-results.json', JSON.stringify({ success: true, checks, errors, viewport: '1440x1000', completedAt: new Date().toISOString() }, null, 2))
  console.log(`PASS: ${checks.length} browser acceptance scenarios`)
} catch (e) {
  mkdirSync('tests/screenshots', { recursive: true }); await page.screenshot({ path: 'tests/screenshots/browser-failure.png' }); writeFileSync('tests/browser-failure.html', await page.content()); throw e
} finally { await browser.close() }
