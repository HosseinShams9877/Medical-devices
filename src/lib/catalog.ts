import type { Prisma } from '@prisma/client'
import { db } from './db'
import { faError } from './api'

export async function saveBom(tx: Prisma.TransactionClient, revisionId: string, items: { componentId: string; qty: number; criticality?: string }[], userId: string, notes?: string) {
  if (!items.length || new Set(items.map(i => i.componentId)).size !== items.length) throw faError('BOM خالی یا دارای قطعه تکراری است.')
  for (const item of items) {
    if (!Number.isFinite(item.qty) || item.qty <= 0 || item.qty > 1000) throw faError('مقدار مصرف معتبر نیست.')
    const component = await tx.component.findUnique({ where: { id: item.componentId } })
    if (!component?.active) throw faError('قطعه نامعتبر یا غیرفعال است.')
  }
  const last = await tx.bom.findFirst({ where: { productRevisionId: revisionId }, orderBy: { revision: 'desc' } })
  const bom = await tx.bom.create({ data: {
    productRevisionId: revisionId, revision: (last?.revision ?? 0) + 1, status: 'ACTIVE', createdById: userId, notes,
    items: { create: items.map((i, idx) => ({ componentId: i.componentId, qty: i.qty, criticality: i.criticality ?? 'NORMAL', sortOrder: idx + 1 })) },
  } })
  await tx.bom.updateMany({ where: { productRevisionId: revisionId, status: 'ACTIVE', id: { not: bom.id } }, data: { status: 'RETIRED' } })
  return bom
}

export async function materialPlan(revisionId: string, qty: number, client: Prisma.TransactionClient = db) {
  const revision = await client.productRevision.findUnique({ where: { id: revisionId }, include: { product: true } })
  if (!revision?.product.active) throw faError('نسخه محصول معتبر یا فعال نیست.')
  const bom = await client.bom.findFirst({ where: { productRevisionId: revisionId, status: 'ACTIVE' }, orderBy: { revision: 'desc' }, include: { items: { include: { component: true }, orderBy: { sortOrder: 'asc' } } } })
  if (!bom?.items.length) throw faError('BOM فعال و غیرخالی برای این نسخه تعریف نشده است.')
  if (bom.items.some(i => !i.component.active)) throw faError('BOM شامل قطعه غیرفعال است؛ نسخه جدید تعریف کنید.')
  return { bomId: bom.id, bomRevision: bom.revision, items: bom.items.map(i => {
    const required = i.qty * qty
    const available = Math.max(0, i.component.stockQty - i.component.reservedQty)
    return { componentId: i.componentId, code: i.component.code, name: i.component.name, unit: i.component.unit, perUnit: i.qty, required, available, shortage: Math.max(0, required - available), critical: i.criticality === 'CRITICAL' || i.component.criticality === 'CRITICAL' }
  }) }
}
