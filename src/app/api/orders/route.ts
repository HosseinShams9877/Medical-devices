import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'

// ─── GET /api/orders — فهرست سفارش‌های تولید ───
export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'production.view')
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || undefined
  const q = sp.get('q') || undefined
  const productId = sp.get('productId') || undefined

  const orders = await db.productionOrder.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(productId ? { productId } : {}),
      ...(q ? { OR: [{ code: { contains: q } }, { productionLine: { contains: q } }, { originRef: { contains: q } }] } : {}),
    },
    include: {
      product: { select: { code: true, name: true } },
      productRevision: { select: { revision: true } },
      bom: { select: { revision: true, status: true } },
      owner: { select: { fullName: true } },
      customer: { select: { code: true, name: true } },
      _count: { select: { devices: true, tests: true, ncrs: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const devices = await db.device.groupBy({
    by: ['orderId', 'status'],
    where: { orderId: { in: orders.map((o) => o.id) } },
    _count: true,
  })
  const devMap: Record<string, Record<string, number>> = {}
  for (const d of devices) {
    if (!d.orderId) continue
    devMap[d.orderId] ??= {}
    devMap[d.orderId][d.status] = d._count
  }

  return ok({ orders: orders.map((o) => ({ ...o, deviceStatus: devMap[o.id] ?? {} })) })
})

// ─── POST /api/orders — ایجاد سفارش تولید (با مبدأ درخواست) ───
const createSchema = z.object({
  productId: z.string().min(1),
  productRevisionId: z.string().min(1),
  qty: z.number().int().min(1).max(500),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  productionLine: z.string().max(100).optional(),
  ownerId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  // ── مبدأ درخواست: دستور مدیریتی / صورت‌جلسه / سفارش مشتری / داخلی ──
  originType: z.enum(['DIRECTIVE', 'MINUTES', 'CUSTOMER_ORDER', 'INTERNAL']).default('INTERNAL'),
  originRef: z.string().max(100).optional(),
  originTitle: z.string().max(300).optional(),
  originIssuedBy: z.string().max(120).optional(),
  originDate: z.string().optional(),
  customerId: z.string().optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'production.create')
  const body = await readJson(req, createSchema)

  const revision = await db.productRevision.findUnique({
    where: { id: body.productRevisionId },
    include: { product: true, boms: { where: { status: 'ACTIVE' }, orderBy: { revision: 'desc' }, take: 1, include: { items: true } } },
  })
  if (!revision || revision.productId !== body.productId) throw faError('نسخه محصول انتخابی معتبر نیست.')
  if (revision.boms.length === 0) throw faError('این نسخه محصول BOM فعال ندارد. ابتدا BOM را تعریف کنید.')

  if (body.plannedStart && body.plannedEnd && new Date(body.plannedEnd) < new Date(body.plannedStart)) {
    throw faError('تاریخ پایان برنامه‌ریزی نمی‌تواند قبل از تاریخ شروع باشد.')
  }

  // اعتبارسنجی مبدأ درخواست
  if (body.originType === 'CUSTOMER_ORDER' && !body.customerId) {
    throw faError('برای مبدأ «سفارش مشتری»، انتخاب مشتری الزامی است.')
  }
  if ((body.originType === 'DIRECTIVE' || body.originType === 'MINUTES') && !body.originRef?.trim()) {
    throw faError(body.originType === 'DIRECTIVE' ? 'شمارهٔ دستور مدیریتی الزامی است.' : 'شمارهٔ صورت‌جلسه الزامی است.')
  }
  let customer = null
  if (body.customerId) {
    customer = await db.customer.findUnique({ where: { id: body.customerId } })
    if (!customer) throw faError('مشتری انتخابی یافت نشد.')
  }

  // شماره سفارش یکتا و خودکار
  const year = 1404
  const count = await db.productionOrder.count()
  const code = `PO-${year}-${String(count + 1).padStart(3, '0')}`
  const clash = await db.productionOrder.findUnique({ where: { code } })
  const finalCode = clash ? `PO-${year}-${Date.now().toString().slice(-5)}` : code

  const order = await db.productionOrder.create({
    data: {
      code: finalCode,
      productId: body.productId,
      productRevisionId: body.productRevisionId,
      bomId: revision.boms[0].id,
      qty: body.qty,
      priority: body.priority,
      status: 'DRAFT',
      plannedStart: body.plannedStart ? new Date(body.plannedStart) : undefined,
      plannedEnd: body.plannedEnd ? new Date(body.plannedEnd) : undefined,
      productionLine: body.productionLine,
      ownerId: body.ownerId,
      notes: body.notes,
      createdById: user.id,
      originType: body.originType,
      originRef: body.originRef,
      originTitle: body.originTitle,
      originIssuedBy: body.originIssuedBy,
      originDate: body.originDate ? new Date(body.originDate) : undefined,
      customerId: customer?.id,
    },
  })

  await audit(req, user, 'ORDER_CREATE', {
    entityType: 'ORDER', entityId: order.id, entityCode: order.code,
    newValues: { product: revision.product.code, qty: body.qty, priority: body.priority, originType: body.originType, originRef: body.originRef },
  })

  return ok({ order })
})
