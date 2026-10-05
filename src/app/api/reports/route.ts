import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePerm, withApi, ok } from '@/lib/api'

// ─── GET /api/reports?type=production|quality|service ───
export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'reports.view')
  const type = req.nextUrl.searchParams.get('type') || 'production'
  const days = parseInt(req.nextUrl.searchParams.get('days') || '90')
  const from = new Date(Date.now() - days * 86400000)
  const now = new Date()

  if (type === 'production') {
    const devices = await db.device.findMany({
      where: { createdAt: { gte: from } },
      include: { product: { select: { code: true, name: true } }, order: { select: { code: true, productionLine: true, plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true, status: true, qty: true } } },
    })
    const orders = await db.productionOrder.findMany({ where: { createdAt: { gte: from } }, include: { product: { select: { code: true, name: true } }, _count: { select: { devices: true } } } })
    const tests = await db.testResult.count({ where: { createdAt: { gte: from } } })
    const failTests = await db.testResult.count({ where: { createdAt: { gte: from }, passed: false, retestOfId: null } })

    // تولید ماهانه (۶ ماه اخیر)
    const monthly: { month: string; produced: number; failed: number; released: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const produced = await db.device.count({ where: { createdAt: { gte: start, lt: end } } })
      const failed = await db.device.count({ where: { createdAt: { gte: start, lt: end }, status: { in: ['QC_FAIL', 'SCRAPPED'] } } })
      const released = await db.device.count({ where: { releases: { some: { releasedAt: { gte: start, lt: end } } } } })
      monthly.push({ month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, produced, failed, released })
    }

    const byProductMap: Record<string, { code: string; name: string; produced: number; failed: number }> = {}
    for (const d of devices) {
      const key = d.product.code
      byProductMap[key] ??= { code: d.product.code, name: d.product.name, produced: 0, failed: 0 }
      byProductMap[key].produced++
      if (['QC_FAIL', 'SCRAPPED'].includes(d.status)) byProductMap[key].failed++
    }

    return ok({
      type, summary: {
        totalDevices: devices.length, totalOrders: orders.length, tests, failTests,
        rejectRate: tests ? +((failTests / tests) * 100).toFixed(1) : 0,
      },
      monthly, byProduct: Object.values(byProductMap),
      lines: orders.reduce<Record<string, { line: string; orders: number; qty: number; completed: number }>>((acc, o) => {
        const line = o.productionLine || 'بدون خط'
        acc[line] ??= { line, orders: 0, qty: 0, completed: 0 }
        acc[line].orders++
        acc[line].qty += o.qty
        if (['COMPLETED', 'RELEASED'].includes(o.status)) acc[line].completed++
        return acc
      }, {}),
    })
  }

  if (type === 'quality') {
    const fails = await db.testResult.groupBy({ by: ['templateCode', 'name'], where: { passed: false, retestOfId: null, createdAt: { gte: from } }, _count: true })
    const ncrsByType = await db.nonconformity.groupBy({ by: ['type'], where: { detectedAt: { gte: from } }, _count: true })
    const ncrsBySeverity = await db.nonconformity.groupBy({ by: ['severity'], where: { detectedAt: { gte: from } }, _count: true })
    const reworks = await db.reworkRecord.count({ where: { performedAt: { gte: from } } })
    const failureModes = await db.repair.groupBy({ by: ['failureMode'], where: { performedAt: { gte: from }, failureMode: { not: null } }, _count: true })
    const openNcrs = await db.nonconformity.count({ where: { status: { in: ['OPEN', 'IN_REWORK', 'RETEST'] } } })
    const totalTests = await db.testResult.count({ where: { createdAt: { gte: from } } })
    const totalFails = await db.testResult.count({ where: { createdAt: { gte: from }, passed: false, retestOfId: null } })

    // روند ماهانه عدم انطباق
    const monthly: { month: string; ncrs: number; fails: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const n = await db.nonconformity.count({ where: { detectedAt: { gte: start, lt: end } } })
      const f = await db.testResult.count({ where: { passed: false, retestOfId: null, createdAt: { gte: start, lt: end } } })
      monthly.push({ month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, ncrs: n, fails: f })
    }

    return ok({
      type, summary: {
        totalTests, totalFails, failRate: totalTests ? +((totalFails / totalTests) * 100).toFixed(1) : 0,
        openNcrs, reworks,
      },
      failsByTemplate: fails.map((f) => ({ code: f.templateCode, name: f.name, count: f._count })),
      ncrsByType: ncrsByType.map((n) => ({ type: n.type, count: n._count })),
      ncrsBySeverity: ncrsBySeverity.map((n) => ({ severity: n.severity, count: n._count })),
      failureModes: failureModes.map((f) => ({ mode: f.failureMode, count: f._count })),
      monthly,
    })
  }

  // service
  const tickets = await db.serviceTicket.findMany({ where: { receivedAt: { gte: from } }, include: { customer: { select: { name: true } } } })
  const resolved = tickets.filter((t) => t.resolvedAt)
  const mttrHours = resolved.length ? resolved.reduce((sum, t) => sum + (new Date(t.resolvedAt!).getTime() - new Date(t.receivedAt).getTime()) / 3600000, 0) / resolved.length : 0
  const ticketsByStatus = await db.serviceTicket.groupBy({ by: ['status'], _count: true })
  const complaints = await db.complaint.findMany({ where: { receivedAt: { gte: from } } })
  const complaintsBySeverity = await db.complaint.groupBy({ by: ['severity'], where: { receivedAt: { gte: from } }, _count: true })
  const repairs = await db.repair.findMany({ where: { performedAt: { gte: from } }, include: { technician: { select: { fullName: true } }, device: { select: { serial: true } }, parts: true } })
  const partsConsumption = await db.repairPart.groupBy({ by: ['componentId'], where: { repair: { performedAt: { gte: from } } }, _sum: { qty: true } })
  const componentIds = partsConsumption.map((p) => p.componentId)
  const partComponents = await db.component.findMany({ where: { id: { in: componentIds } }, select: { id: true, code: true, name: true, unit: true } })

  const technicianPerf: Record<string, { technician: string; repairs: number; parts: number }> = {}
  for (const r of repairs) {
    const key = r.technician.fullName
    technicianPerf[key] ??= { technician: key, repairs: 0, parts: 0 }
    technicianPerf[key].repairs++
    technicianPerf[key].parts += r.parts.length
  }

  const deviceFailures: Record<string, { serial: string; count: number }> = {}
  for (const r of repairs) {
    deviceFailures[r.device.serial] ??= { serial: r.device.serial, count: 0 }
    deviceFailures[r.device.serial].count++
  }

  const warrantyDevices = await db.device.findMany({ where: { deliveredAt: { not: null } }, include: { product: { select: { warrantyMonths: true } }, warrantyOverride: true, _count: { select: { repairs: true } } } })
  const inWarranty = warrantyDevices.filter((d) => {
    if (d.warrantyOverride) return d.warrantyOverride.status === 'IN_WARRANTY'
    if (!d.deliveredAt) return false
    const end = new Date(d.deliveredAt)
    end.setMonth(end.getMonth() + d.product.warrantyMonths)
    return end >= now
  }).length

  return ok({
    type, summary: {
      totalTickets: tickets.length, openTickets: tickets.filter((t) => t.status !== 'CLOSED').length,
      mttrHours: +mttrHours.toFixed(1), complaints: complaints.length,
      openComplaints: complaints.filter((c) => !['CLOSED', 'REJECTED'].includes(c.status)).length,
      repairs: repairs.length, deliveredDevices: warrantyDevices.length, inWarranty,
    },
    ticketsByStatus: ticketsByStatus.map((t) => ({ status: t.status, count: t._count })),
    complaintsBySeverity: complaintsBySeverity.map((c) => ({ severity: c.severity, count: c._count })),
    partsConsumption: partsConsumption.map((p) => {
      const c = partComponents.find((pc) => pc.id === p.componentId)
      return { component: c ? `${c.code} — ${c.name}` : p.componentId, qty: p._sum.qty ?? 0, unit: c?.unit ?? '' }
    }),
    technicianPerf: Object.values(technicianPerf).sort((a, b) => b.repairs - a.repairs),
    topFailureDevices: Object.values(deviceFailures).sort((a, b) => b.count - a.count).slice(0, 8),
  })
})
