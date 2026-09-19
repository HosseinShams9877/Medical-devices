import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePerm, withApi, ok } from '@/lib/api'
import { hasPerm } from '@/lib/rbac'

export const GET = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'production.view')
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthAgo = new Date(now.getTime() - 30 * 86400000)

  const [
    activeOrders, todayDevices, monthDevices, waitingMaterial, inProduction, waitingQc,
    failedDevices, releasedDevices, openNcrs, openTickets, overdueTickets, openComplaints,
    activeRepairs, overdueServices, criticalNotifs, shortageRows, monthTests, failTests,
    topFailures, monthProduced,
  ] = await Promise.all([
    db.productionOrder.count({ where: { status: { notIn: ['RELEASED', 'CANCELLED', 'DRAFT'] } } }),
    db.device.count({ where: { createdAt: { gte: startToday } } }),
    db.device.count({ where: { createdAt: { gte: startMonth } } }),
    db.productionOrder.count({ where: { status: 'MATERIAL_CHECK' } }),
    db.productionOrder.count({ where: { status: 'IN_PRODUCTION' } }),
    db.productionOrder.count({ where: { status: { in: ['WAITING_QC', 'REWORK'] } } }),
    db.device.count({ where: { status: 'QC_FAIL' } }),
    db.device.count({ where: { status: 'RELEASED' } }),
    db.nonconformity.count({ where: { status: { in: ['OPEN', 'IN_REWORK', 'RETEST'] } } }),
    db.serviceTicket.count({ where: { status: { notIn: ['CLOSED'] } } }),
    db.serviceTicket.count({ where: { status: { notIn: ['CLOSED', 'RESOLVED'] }, receivedAt: { lt: new Date(now.getTime() - 3 * 86400000) } } }),
    db.complaint.count({ where: { status: { notIn: ['CLOSED', 'REJECTED'] } } }),
    db.repair.count({ where: { ticket: { status: { in: ['REPAIRING', 'DIAGNOSING', 'TESTING', 'WAITING_PART'] } } } }),
    db.serviceTicket.count({ where: { status: { in: ['WAITING_PART', 'DIAGNOSING'] }, receivedAt: { lt: new Date(now.getTime() - 5 * 86400000) } } }),
    db.notification.count({ where: { OR: [{ targetUserId: user.id }, { targetRole: user.role }], severity: 'CRITICAL' } }),
    db.orderMaterial.findMany({ where: { shortageQty: { gt: 0 }, order: { status: { in: ['APPROVED', 'MATERIAL_CHECK'] } } }, include: { component: true, order: true } }),
    db.testResult.count({ where: { createdAt: { gte: monthAgo } } }),
    db.testResult.count({ where: { createdAt: { gte: monthAgo }, passed: false, retestOfId: null } }),
    db.testResult.groupBy({ by: ['templateCode', 'name'], where: { passed: false, retestOfId: null }, _count: true, orderBy: { _count: { templateCode: 'desc' } }, take: 5 }),
    db.device.findMany({
      where: { createdAt: { gte: monthAgo } },
      select: { productId: true, product: { select: { code: true, name: true } } },
    }),
  ])

  // تولید ماه بر اساس محصول
  const byProduct: Record<string, { code: string; name: string; count: number }> = {}
  for (const d of monthProduced) {
    const key = d.product.code
    byProduct[key] ??= { code: d.product.code, name: d.product.name, count: 0 }
    byProduct[key].count++
  }

  const alerts = shortageRows.map((m) => ({
    type: 'material',
    severity: m.critical ? 'CRITICAL' : 'WARNING',
    title: `کسری ${m.component.name}`,
    body: `${m.order.code}: موردنیاز ${m.requiredQty}، رزرو ${m.reservedQty}، کسری ${m.shortageQty} ${m.component.unit}${m.critical ? ' — قطعه بحرانی' : ''}`,
    orderId: m.orderId,
    orderCode: m.order.code,
  }))

  if (failedDevices > 0) alerts.push({ type: 'quality', severity: 'CRITICAL', title: `${failedDevices} دستگاه QC رد‌شده`, body: 'دستگاه‌های ناموفق در انتظار Rework و Retest هستند.', orderId: '', orderCode: '' })

  const awaitingRelease = await db.device.count({ where: { status: 'QC_PASS', order: { status: 'COMPLETED' } } })
  if (awaitingRelease > 0) alerts.push({ type: 'release', severity: 'WARNING', title: `${awaitingRelease} دستگاه در انتظار آزادسازی`, body: 'سفارش تکمیل‌شده؛ نیازمند آزادسازی توسط QC.', orderId: '', orderCode: '' })

  const myNotifs = hasPerm(user.role, 'notifications.view')
    ? await db.notification.findMany({
        where: { OR: [{ targetUserId: user.id }, { targetRole: user.role }], reads: { none: { userId: user.id } } },
        orderBy: { createdAt: 'desc' }, take: 6,
      })
    : []

  return ok({
    kpi: {
      activeOrders, todayDevices, monthDevices, waitingMaterial, inProduction, waitingQc,
      failedDevices, releasedDevices, openNcrs, openTickets, overdueTickets, openComplaints,
      activeRepairs, overdueServices, awaitingRelease, criticalNotifs,
      monthTests, failTests, rejectRate: monthTests ? +((failTests / monthTests) * 100).toFixed(1) : 0,
    },
    alerts,
    byProduct: Object.values(byProduct),
    topFailures: topFailures.map((f) => ({ code: f.templateCode, name: f.name, count: f._count.templateCode })),
    notifications: myNotifs,
    user: { role: user.role, fullName: user.fullName },
  })
})
