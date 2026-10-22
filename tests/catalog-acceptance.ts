import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import ExcelJS from 'exceljs'
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'
import { readImportWorkbook } from '../src/lib/catalog-import'
const base = process.env.AUDIT_BASE || 'http://127.0.0.1:3000'
if (!process.env.DATABASE_URL?.includes('audit-test')) throw new Error('Use isolated audit-test database only')
let cookie = '', assertions = 0
const checks: string[] = []
function check(name: string, fn: () => void) { fn(); assertions++; checks.push(name) }
async function request(path: string, body?: unknown, status = 200) {
  const res = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json(); check(`HTTP ${path} => ${status}`, () => assert.equal(res.status, status, JSON.stringify(data)))
  return { data, res }
}
async function login(username: string) { const r = await request('/api/auth/login', { username, password: 'Audit-Only-2026!' }); cookie = r.res.headers.get('set-cookie')!.split(';')[0] }
async function xlsx(headers: string[], rows: unknown[][]) {
  const w = new ExcelJS.Workbook(); const s = w.addWorksheet('data'); s.addRow(headers); for (const r of rows) s.addRow(r)
  return Buffer.from(await w.xlsx.writeBuffer())
}
async function upload(buffer: Buffer, options: any, action = 'preview', digest?: string, status = 200) {
  const form = new FormData(); form.set('file', new Blob([new Uint8Array(buffer)]), 'test.xlsx'); form.set('action', action)
  if (options) form.set('options', JSON.stringify(options)); if (digest) form.set('digest', digest)
  const res = await fetch(base + '/api/catalog-import', { method: 'POST', headers: { Cookie: cookie }, body: form }); const data = await res.json()
  check(`Excel ${action} => ${status}`, () => assert.equal(res.status, status, JSON.stringify(data))); return data
}
function opts(kind: string, headers: string[], extra = {}) { return { kind, sheet: 'data', headerRow: 1, mapping: Object.fromEntries(headers.map((h, i) => [h, i])), replace: false, createUnknown: false, excludedRows: [], ...extra } }
async function stock(id: string) { return (await db.component.findUniqueOrThrow({ where: { id } })).stockQty }
async function main() {
  for (const [username, role] of [['accept_sales', 'SALES'], ['accept_service', 'SERVICE_MGR'], ['accept_warehouse', 'WAREHOUSE']]) await db.user.upsert({ where: { username }, update: {}, create: { username, role, fullName: username, passwordHash: hashPassword('Audit-Only-2026!') } })
  cookie = ''; await request('/api/components', { code: 'NOAUTH', name: 'قطعه', unit: 'عدد' }, 401)
  await login('audit_viewer'); await request('/api/components', { code: 'DENIED', name: 'قطعه', unit: 'عدد' }, 403)
  await login('accept_warehouse')
  const c = (await request('/api/components', { code: 'ACC-C01', name: 'قطعه پذیرش', unit: 'عدد' })).data.component
  check('Component creation has zero stock', () => assert.equal(c.stockQty, 0))
  await request('/api/components', { code: 'BAD-STOCK', name: 'قطعه', unit: 'عدد', stockQty: 10 }, 422)
  await request('/api/components', { code: 'ACC-C01', name: 'تکرار', unit: 'عدد' }, 400)
  await request('/api/components', { id: c.id, code: c.code, name: 'قطعه ویرایش‌شده', unit: 'عدد', minStock: 2 })
  await request('/api/products', { code: 'DENIED-P', name: 'محصول' }, 403)
  const incoming = (await request('/api/inventory', { action: 'receive', componentId: c.id, qty: 7, lotNumber: 'ACC-LOT1' })).data.inspection
  const pendingStock = await stock(c.id); check('Pending IQC creates no usable stock', () => assert.equal(pendingStock, 0))
  await login('audit_admin'); await request('/api/incoming', { action: 'decide', inspectionId: incoming.id, decision: 'APPROVED' })
  const approvedStock = await stock(c.id); check('IQC adds approved stock', () => assert.equal(approvedStock, 7))
  await request('/api/components', { id: c.id, code: c.code, name: c.name, unit: 'متر' }, 400)
  const operationId = randomUUID(); const out = { action: 'out', componentId: c.id, qty: 1, reason: 'آزمون خروج', operationId }
  await request('/api/inventory', out); await request('/api/inventory', out, 409)
  const afterOut = await stock(c.id); check('Manual out exactly once', () => assert.equal(afterOut, 6))
  const p = (await request('/api/products', { code: 'ACC-P01', name: 'محصول پذیرش', unit: 'دستگاه' })).data.product
  const rev = await db.productRevision.findFirstOrThrow({ where: { productId: p.id } })
  await request(`/api/products/${p.id}`, { action: 'edit', name: 'محصول ویرایش‌شده' })
  await request(`/api/products/${p.id}`, { action: 'new-bom-revision', productRevisionId: rev.id, items: [{ componentId: c.id, qty: 2 }] })
  const beforeBom = await db.bom.count({ where: { productRevisionId: rev.id } })
  await request(`/api/products/${p.id}`, { action: 'new-bom-revision', productRevisionId: rev.id, items: [{ componentId: c.id, qty: 1 }, { componentId: c.id, qty: 3 }] }, 400)
  assert.equal(await db.bom.count({ where: { productRevisionId: rev.id } }), beforeBom); assertions++
  await request(`/api/products/${p.id}`, { action: 'save-process-template', productRevisionId: rev.id, steps: [{ stepIndex: 1, name: 'مونتاژ', required: true }, { stepIndex: 2, name: 'بسته‌بندی', required: true, isPackaging: true }] })
  const preview = (await request(`/api/orders/preview?revisionId=${rev.id}&qty=4`)).data
  check('BOM requirement/usable stock/shortage', () => assert.deepEqual([preview.items[0].required, preview.items[0].available, preview.items[0].shortage], [8, 6, 2]))
  const o = (await request('/api/orders', { productId: p.id, productRevisionId: rev.id, qty: 4, expectedBomId: preview.bomId })).data.order
  assert.equal(await stock(c.id), 6); assertions++
  const stepCount = await db.orderStep.count({ where: { orderId: o.id } }); check('Order contains copied process steps', () => assert.equal(stepCount, 2))
  await request(`/api/orders/${o.id}`, { action: 'transition', to: 'APPROVED' })
  await request(`/api/orders/${o.id}`, { action: 'transition', to: 'IN_PRODUCTION' }, 400)
  assert.equal(await db.device.count({ where: { orderId: o.id } }), 0); assert.equal(await stock(c.id), 6); assertions += 2
  await request(`/api/orders/${o.id}`, { action: 'transition', to: 'CANCELLED' })
  assert.equal((await db.component.findUniqueOrThrow({ where: { id: c.id } })).reservedQty, 0); assertions++
  const o2 = (await request('/api/orders', { productId: p.id, productRevisionId: rev.id, qty: 2 })).data.order
  await request(`/api/orders/${o2.id}`, { action: 'transition', to: 'APPROVED' }); await request(`/api/orders/${o2.id}`, { action: 'transition', to: 'IN_PRODUCTION' })
  assert.equal(await stock(c.id), 2); assertions++
  await request(`/api/orders/${o2.id}`, { action: 'transition', to: 'IN_PRODUCTION' }, 400)
  assert.equal(await stock(c.id), 2); assertions++
  const oldBomId = o2.bomId
  await request(`/api/products/${p.id}`, { action: 'new-bom-revision', productRevisionId: rev.id, items: [{ componentId: c.id, qty: 3 }] })
  assert.equal((await db.productionOrder.findUniqueOrThrow({ where: { id: o2.id } })).bomId, oldBomId); assertions++
  await request('/api/orders', { productId: p.id, productRevisionId: rev.id, qty: 1, expectedBomId: oldBomId }, 409)

  // Actual delivered templates are parsed and imported through HTTP.
  for (const kind of ['products', 'bom', 'customers'] as const) {
    const buffer = readFileSync(`public/templates/${kind}.xlsx`)
    const w = await readImportWorkbook(buffer); const sheet = w.worksheets[0]
    const headers = Array.from({ length: sheet.columnCount }, (_, i) => sheet.getRow(1).getCell(i + 1).text)
    const options = opts(kind, headers, { sheet: kind })
    await upload(buffer, undefined, 'inspect')
    let plan = await upload(buffer, options)
    if (kind === 'bom') { check('Unknown component requires explicit resolution', () => assert.equal(plan.canCommit, false)); options.createUnknown = true; plan = await upload(buffer, options) }
    check(`${kind} preview valid`, () => assert.equal(plan.canCommit, true))
    await upload(buffer, options, 'commit', plan.digest)
    const repeated = await upload(buffer, options)
    check(`${kind} repeat makes no changes`, () => assert.equal(repeated.totals.skipped, 1))
  }
  const imported = await db.product.findUniqueOrThrow({ where: { code: 'SAMPLE-P01' } }); const importedRev = await db.productRevision.findFirstOrThrow({ where: { productId: imported.id } })
  assert.equal((await db.component.findUniqueOrThrow({ where: { code: 'SAMPLE-C01' } })).stockQty, 0); assertions++
  const impOrder = await request('/api/orders', { productId: imported.id, productRevisionId: importedRev.id, qty: 5 })
  check('Imported BOM usable in order', () => assert.equal(impOrder.data.requirements.items[0].required, 10))

  const hp = ['name', 'code', 'unit'] // deliberately reordered mapping
  const bad = await xlsx(hp, [['معتبر', 'ACC-NEW', 'دستگاه'], ['نامعتبر', 'ACC-BAD', '']])
  const bp = await upload(bad, opts('products', hp)); check('Invalid file reports Excel row', () => assert.equal(bp.rows[1].row, 3))
  await upload(bad, opts('products', hp), 'commit', bp.digest, 422)
  assert.equal(await db.product.count({ where: { code: 'ACC-NEW' } }), 0); assertions++
  const duplicates = await xlsx(hp, [['محصول', 'ACC-DUP', 'دستگاه'], ['محصول', 'ACC-DUP', 'دستگاه']])
  const duplicatePlan = await upload(duplicates, opts('products', hp)); check('Duplicate source rows rejected', () => assert.equal(duplicatePlan.totals.errors, 2))
  const ph = ['code', 'name', 'unit']; const stale = await xlsx(ph, [['ACC-STALE', 'پیش‌نمایش', 'دستگاه']]); const so = opts('products', ph)
  const sp = await upload(stale, so); await request('/api/products', { code: 'ACC-CHANGE', name: 'تغییر همزمان' }); await upload(stale, so, 'commit', sp.digest, 409)
  assert.equal(await db.product.count({ where: { code: 'ACC-STALE' } }), 0); assertions++
  const bh = ['productCode', 'componentCode', 'unit', 'qty']; const wrongUnit = await xlsx(bh, [['SAMPLE-P01', 'SAMPLE-C01', 'متر', 2]])
  const unitPlan = await upload(wrongUnit, opts('bom', bh)); check('BOM unit mismatch rejected', () => assert.equal(unitPlan.canCommit, false))
  const qtyInvalid = await xlsx(bh, [['SAMPLE-P01', 'SAMPLE-C01', 'عدد', -1]])
  const negativePlan = await upload(qtyInvalid, opts('bom', bh)); check('Negative BOM rejected', () => assert.equal(negativePlan.canCommit, false))
  const changedBom = await xlsx(bh, [['SAMPLE-P01', 'SAMPLE-C01', 'عدد', 3]])
  let bo = opts('bom', bh); const consentPlan = await upload(changedBom, bo); check('Existing BOM change requires consent', () => assert.equal(consentPlan.canCommit, false))
  bo = opts('bom', bh, { replace: true }); const cbp = await upload(changedBom, bo); await upload(changedBom, bo, 'commit', cbp.digest)
  assert.equal(await db.bom.count({ where: { productRevisionId: importedRev.id } }), 2); assertions++
  await upload(Buffer.from('broken xlsx'), undefined, 'inspect', undefined, 400)
  await upload(await xlsx(['name'], [['ناقص']]), opts('products', ['name']), 'preview', undefined, 400)

  const customer = await db.customer.findUniqueOrThrow({ where: { code: 'SAMPLE-CUST01' } })
  check('Leading zero preserved from delivered template', () => assert.equal(customer.phone, '09120000001'))
  const contactHeaders = ['code', 'name', 'phone']; const phoneNumeric = await xlsx(contactHeaders, [['ACC-PHONE', 'تلفن عددی', 9120000002]])
  const phonePlan = await upload(phoneNumeric, opts('customers', contactHeaders)); check('Numeric mobile warning and restoration', () => { assert.equal(phonePlan.rows[0].values.phone, '09120000002'); assert.ok(phonePlan.rows[0].warnings.length) })
  const phoneDuplicate = await xlsx(contactHeaders, [['ACC-DUP-PHONE', 'تکرار تلفن', customer.phone]])
  const dupPhonePlan = await upload(phoneDuplicate, opts('customers', contactHeaders)); check('Customer duplicate phone detected', () => assert.equal(dupPhonePlan.canCommit, false))
  const overwrite = await xlsx(contactHeaders, [[customer.code, 'نام جدید', customer.phone]])
  const op = await upload(overwrite, opts('customers', contactHeaders)); check('Existing customer default skip', () => assert.equal(op.totals.skipped, 1))
  const updated = await upload(overwrite, opts('customers', contactHeaders, { replace: true })); await upload(overwrite, opts('customers', contactHeaders, { replace: true }), 'commit', updated.digest)
  assert.equal((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).name, 'نام جدید'); assertions++
  await login('accept_sales'); await upload(await xlsx(ph, [['NO-PERM', 'محصول', 'دستگاه']]), opts('products', ph), 'preview', undefined, 403)
  const sh = ['code', 'name', 'phone']; const saleCustomers = await xlsx(sh, [['ACC-SALES-CUST', 'مشتری فروش', '09120000003']]); const scp = await upload(saleCustomers, opts('customers', sh)); await upload(saleCustomers, opts('customers', sh), 'commit', scp.digest)
  await login('accept_service'); const found = await request('/api/customers?q=09120000001'); check('Imported customer searchable', () => assert.ok(found.data.customers.some((c: any) => c.id === customer.id)))
  const beforeDevices = await db.device.findMany({ orderBy: { id: 'asc' } }); const beforeWarranty = await db.warrantyOverride.count()
  await request('/api/customers?q=SAMPLE-CUST01')
  const ticket = (await request('/api/tickets', { customerId: customer.id, problem: 'بررسی عملکرد دستگاه پس از نصب' })).data.ticket
  check('Selected imported customer used by service', () => { assert.equal(ticket.customerId, customer.id); assert.equal(ticket.contactPhone, '09120000001'); assert.equal(ticket.status, 'NEW') })
  assert.deepEqual(await db.device.findMany({ orderBy: { id: 'asc' } }), beforeDevices); assert.equal(await db.warrantyOverride.count(), beforeWarranty); assertions += 2
  const negatives = await db.component.count({ where: { OR: [{ stockQty: { lt: 0 } }, { reservedQty: { lt: 0 } }] } }); assert.equal(negatives, 0); assertions++
  const fk = await db.$queryRawUnsafe<any[]>('PRAGMA foreign_key_check'); assert.equal(fk.length, 0); assertions++
  const result = { success: true, assertions, checks, database: 'isolated audit-test', completedAt: new Date().toISOString() }
  writeFileSync('tests/catalog-test-results.json', JSON.stringify(result, null, 2)); console.log(`PASS: ${assertions} catalog/workflow assertions`)
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
