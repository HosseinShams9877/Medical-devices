import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'
import { writeFileSync } from 'node:fs'
async function main() {
  if (!process.env.DATABASE_URL?.includes('audit-test')) throw new Error('Use an isolated audit-test database')
  const admin = await db.user.create({ data: { username: 'audit_admin', fullName: 'Audit Admin', role: 'ADMIN', passwordHash: hashPassword('Audit-Only-2026!') } })
  await db.user.create({ data: { username: 'audit_viewer', fullName: 'Audit Viewer', role: 'VIEWER', passwordHash: hashPassword('Audit-Only-2026!') } })
  const component = await db.component.create({ data: { code: 'AUDIT-C', name: 'Audit Component', stockQty: 100 } })
  await db.componentLot.create({ data: { componentId: component.id, lotNumber: 'AUDIT-BASE', quantity: 100, remaining: 100, status: 'APPROVED' } })
  const product = await db.product.create({ data: { code: 'AUDIT-P', name: 'Audit Product' } })
  const revision = await db.productRevision.create({ data: { productId: product.id, revision: 'A', isActive: true } })
  const bom = await db.bom.create({ data: { productRevisionId: revision.id, revision: 1, items: { create: { componentId: component.id, qty: 2 } } } })
  const template = await db.testTemplate.create({ data: { code: 'AUDIT-T', name: 'Audit Numeric', productRevisionId: revision.id, productId: product.id, stage: 'FINAL', parameterName: 'Pressure', minValue: 1, maxValue: 5 } })
  const device = await db.device.create({ data: { serial: 'AUDIT-DEVICE', productId: product.id, productRevisionId: revision.id } })
  const order = await db.productionOrder.create({ data: { code: 'AUDIT-ORDER', productId: product.id, productRevisionId: revision.id, bomId: bom.id, qty: 1, createdById: admin.id } })
  writeFileSync(process.env.AUDIT_FIXTURE || '/tmp/mes-audit-fixture.json', JSON.stringify({ componentId: component.id, productId: product.id, orderId: order.id, templateId: template.id, deviceId: device.id }))
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
