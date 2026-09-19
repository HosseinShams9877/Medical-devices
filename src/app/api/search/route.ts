import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePerm, withApi, ok } from '@/lib/api'

// ─── GET /api/search?q= — جستجوی سراسری ───
export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'search.use')
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return ok({ groups: [] })

  const [devices, orders, tickets, complaints, customers, components, ncrs, lots] = await Promise.all([
    db.device.findMany({ where: { OR: [{ serial: { contains: q } }, { firmwareVersion: { contains: q } }] }, include: { product: { select: { name: true } }, customer: { select: { name: true } } }, take: 8 }),
    db.productionOrder.findMany({ where: { OR: [{ code: { contains: q } }, { productionLine: { contains: q } }] }, include: { product: { select: { name: true } } }, take: 8 }),
    db.serviceTicket.findMany({ where: { OR: [{ code: { contains: q } }, { problem: { contains: q } }] }, include: { customer: { select: { name: true } }, device: { select: { serial: true } } }, take: 8 }),
    db.complaint.findMany({ where: { OR: [{ code: { contains: q } }, { description: { contains: q } }] }, include: { customer: { select: { name: true } } }, take: 8 }),
    db.customer.findMany({ where: { OR: [{ name: { contains: q } }, { code: { contains: q } }, { contactPerson: { contains: q } }] }, take: 8 }),
    db.component.findMany({ where: { OR: [{ code: { contains: q } }, { name: { contains: q } }, { manufacturer: { contains: q } }] }, take: 8 }),
    db.nonconformity.findMany({ where: { OR: [{ code: { contains: q } }, { title: { contains: q } }] }, take: 8 }),
    db.componentLot.findMany({ where: { lotNumber: { contains: q } }, include: { component: { select: { name: true, code: true } } }, take: 8 }),
  ])

  const groups = [
    { type: 'DEVICE', label: 'دستگاه‌ها (شماره سریال)', view: 'device', items: devices.map((d) => ({ id: d.id, title: d.serial, subtitle: `${d.product.name}${d.customer ? ' — ' + d.customer.name : ''} — ${d.status}`, key: d.serial })) },
    { type: 'ORDER', label: 'سفارش‌های تولید', view: 'order-detail', items: orders.map((o) => ({ id: o.id, title: o.code, subtitle: `${o.product.name} × ${o.qty} — ${o.status}`, key: o.code })) },
    { type: 'TICKET', label: 'تیکت‌های خدمات', view: 'service', items: tickets.map((t) => ({ id: t.id, title: t.code, subtitle: `${t.customer?.name ?? ''} ${t.device ? '— ' + t.device.serial : ''} — ${t.status}`, key: t.code })) },
    { type: 'COMPLAINT', label: 'شکایات', view: 'service', items: complaints.map((c) => ({ id: c.id, title: c.code, subtitle: `${c.customer?.name ?? ''} — ${c.status}`, key: c.code })) },
    { type: 'CUSTOMER', label: 'مشتریان', view: 'service', items: customers.map((c) => ({ id: c.id, title: c.name, subtitle: `${c.code} — ${c.city ?? ''}`, key: c.code })) },
    { type: 'COMPONENT', label: 'قطعات', view: 'inventory', items: components.map((c) => ({ id: c.id, title: c.name, subtitle: `${c.code} — موجودی ${c.stockQty} ${c.unit}`, key: c.code })) },
    { type: 'NCR', label: 'عدم انطباق‌ها', view: 'quality', items: ncrs.map((n) => ({ id: n.id, title: n.code, subtitle: `${n.title} — ${n.status}`, key: n.code })) },
    { type: 'LOT', label: 'لات‌های قطعه', view: 'inventory', items: lots.map((l) => ({ id: l.id, title: l.lotNumber, subtitle: `${l.component.name} — باقی‌مانده ${l.remaining} (${l.status})`, key: l.lotNumber })) },
  ].filter((g) => g.items.length > 0)

  return ok({ groups })
})
