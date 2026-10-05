import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePerm, withApi, ok, faError } from '@/lib/api'

function warrantyCalc(dev: { deliveredAt: Date | null; warrantyMonths: number | null; override: { status: string; reason: string } | null }, product: { warrantyMonths: number }) {
  if (dev.override) return { status: dev.override.status, reason: dev.override.reason, source: 'override' as const }
  if (!dev.deliveredAt) return { status: 'UNKNOWN', reason: 'تحویل به مشتری ثبت نشده است', source: 'computed' as const }
  const months = dev.warrantyMonths ?? product.warrantyMonths
  const end = new Date(dev.deliveredAt)
  end.setMonth(end.getMonth() + months)
  return {
    status: end >= new Date() ? 'IN_WARRANTY' : 'OUT_OF_WARRANTY',
    end: end.toISOString(),
    months,
    source: 'computed' as const,
  }
}

// ─── GET /api/devices/[key] — پرونده دیجیتال کامل دستگاه (Traceability) ───
export const GET = withApi(async (req: NextRequest, ctx: { params: Promise<{ key: string }> }) => {
  await requirePerm(req, 'device.view')
  const { key } = await ctx.params
  const device = await db.device.findFirst({
    where: { OR: [{ id: key }, { serial: key }] },
    include: {
      product: true,
      productRevision: true,
      bom: { include: { items: { include: { component: { include: { supplier: { select: { name: true } } } } }, orderBy: { sortOrder: 'asc' } } } },
      order: {
        include: {
          steps: { orderBy: { stepIndex: 'asc' } },
          owner: { select: { fullName: true } },
          createdBy: { select: { fullName: true } },
        },
      },
      customer: true,
      warrantyOverride: true,
      partUsages: { include: { component: true, lot: true, user: { select: { fullName: true } } } },
      tests: { orderBy: { createdAt: 'asc' }, include: { operator: { select: { fullName: true } }, verifier: { select: { fullName: true } }, equipment: { select: { code: true, name: true, calibrationDueAt: true, status: true } } } },
      releases: { include: { user: { select: { fullName: true } } } },
      reworks: { include: { performer: { select: { fullName: true } } } },
      ncrs: true,
      repairs: { include: { technician: { select: { fullName: true } }, parts: { include: { component: true } }, ticket: { select: { code: true } } } },
      complaints: { include: { customer: { select: { name: true } } } },
      stepRecords: { include: { step: { select: { name: true, stepIndex: true } }, operator: { select: { fullName: true } } } },
    },
  })
  if (!device) throw faError('دستگاهی با این شناسه/شماره سریال یافت نشد.', 404)

  // ردیابی دوسویه: برای هر لات مصرف‌شده، سایر دستگاه‌های همان لات
  const lotIds = device.partUsages.map((u) => u.lotId).filter(Boolean) as string[]
  const siblings: { lotNumber: string; devices: string[] }[] = []
  for (const lotId of new Set(lotIds)) {
    const usages = await db.devicePartUsage.findMany({
      where: { lotId, deviceId: { not: device.id } },
      include: { device: { select: { serial: true } } },
      take: 20,
    })
    const usage = device.partUsages.find((u) => u.lotId === lotId)
    siblings.push({
      lotNumber: usage?.lotNumber ?? lotId,
      devices: usages.map((u) => u.device.serial),
    })
  }

  // مستندات مرتبط
  const documents = await db.document.findMany({ where: { OR: [{ entityType: 'DEVICE', entityId: device.id }, { entityType: 'ORDER', entityId: device.orderId ?? 'none' }] } })

  // تاریخچه خدمات مشتری (تیکت‌های این دستگاه)
  const tickets = await db.serviceTicket.findMany({
    where: { deviceId: device.id },
    include: { customer: { select: { name: true } }, assignedTechnician: { select: { fullName: true } } },
    orderBy: { receivedAt: 'desc' },
  })

  const warranty = warrantyCalc(
    { deliveredAt: device.deliveredAt, warrantyMonths: null, override: device.warrantyOverride ? { status: device.warrantyOverride.status, reason: device.warrantyOverride.reason } : null },
    device.product,
  )

  return ok({
    device: {
      id: device.id, serial: device.serial, status: device.status, currentStepIndex: device.currentStepIndex,
      firmwareVersion: device.firmwareVersion, softwareVersion: device.softwareVersion,
      programmedAt: device.programmedAt, programmedById: device.programmedById, programMethod: device.programMethod, programVerified: device.programVerified,
      producedAt: device.producedAt, createdAt: device.createdAt,
      deliveredAt: device.deliveredAt, deliveryNote: device.deliveryNote, notes: device.notes,
      product: device.product, productRevision: device.productRevision,
      bom: device.bom ? { id: device.bom.id, revision: device.bom.revision, status: device.bom.status, effectiveDate: device.bom.effectiveDate, items: device.bom.items } : null,
      order: device.order ? {
        id: device.order.id, code: device.order.code, status: device.order.status, qty: device.order.qty,
        plannedStart: device.order.plannedStart, plannedEnd: device.order.plannedEnd, actualStart: device.order.actualStart, actualEnd: device.order.actualEnd,
        productionLine: device.order.productionLine, owner: device.order.owner?.fullName, createdBy: device.order.createdBy?.fullName,
        steps: device.order.steps,
      } : null,
      customer: device.customer,
      warranty,
      stepRecords: device.stepRecords.map((r) => ({ id: r.id, step: r.step.name, stepIndex: r.step.stepIndex, operator: r.operator.fullName, startedAt: r.startedAt, finishedAt: r.finishedAt, result: r.result, notes: r.notes })),
      tests: device.tests.map((t) => ({
        id: t.id, templateCode: t.templateCode, name: t.name, stage: t.stage, parameterName: t.parameterName, unit: t.unit,
        criteria: t.criteria, actualValue: t.actualValue, passed: t.passed, operator: t.operator.fullName,
        verifier: t.verifier?.fullName, verifiedAt: t.verifiedAt, notes: t.notes, retestOfId: t.retestOfId,
        equipment: t.equipment ? { code: t.equipment.code, name: t.equipment.name, calibrationStatus: t.equipment.status, calibrationDueAt: t.equipment.calibrationDueAt } : null,
        equipmentCalibrated: t.equipmentCalibrated, createdAt: t.createdAt,
      })),
      releases: device.releases.map((r) => ({ id: r.id, releasedBy: r.user.fullName, releasedAt: r.releasedAt, notes: r.notes, checks: r.checksJson })),
      reworks: device.reworks.map((r) => ({ id: r.id, action: r.action, performedBy: r.performer.fullName, performedAt: r.performedAt, notes: r.notes })),
      ncrs: device.ncrs,
      repairs: device.repairs.map((r) => ({
        id: r.id, code: r.code, ticketCode: r.ticket?.code, technician: r.technician.fullName, diagnosis: r.diagnosis,
        failureMode: r.failureMode, rootCause: r.rootCause, action: r.action, result: r.result, performedAt: r.performedAt, notes: r.notes,
        parts: r.parts.map((p) => ({ component: p.component.code + ' — ' + p.component.name, lotNumber: p.lotNumber, qty: p.qty, oldPart: p.oldPart, newPart: p.newPart })),
      })),
      complaints: device.complaints.map((c) => ({ id: c.id, code: c.code, description: c.description, severity: c.severity, status: c.status, safetyImpact: c.safetyImpact, receivedAt: c.receivedAt })),
      tickets: tickets.map((t) => ({ id: t.id, code: t.code, problem: t.problem, status: t.status, priority: t.priority, receivedAt: t.receivedAt, customer: t.customer.name, technician: t.assignedTechnician?.fullName, closedAt: t.closedAt })),
      partUsages: device.partUsages.map((u) => ({
        component: { code: u.component.code, name: u.component.name, manufacturer: u.component.manufacturer },
        lotNumber: u.lotNumber, lotStatus: u.lot?.status, qty: u.qty, source: u.source, usedBy: u.user.fullName, usedAt: u.usedAt,
      })),
      lotSiblings: siblings,
      documents,
    },
  })
})
