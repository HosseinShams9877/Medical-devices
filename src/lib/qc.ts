// ─────────────────────────────────────────────────────────────
// QC Helpers — محاسبه وضعیت QC دستگاه از آخرین نتایج تست
// (Retest ها زنجیره دارند؛ سوابق قبلی هرگز بازنویسی نمی‌شوند)
// ─────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { notifyRole } from '@/lib/notify'

export async function recomputeDeviceQc(deviceId: string): Promise<void> {
  const device = await db.device.findUnique({ where: { id: deviceId }, include: { productRevision: true } })
  if (!device) return
  const templates = await db.testTemplate.findMany({
    where: { productRevisionId: device.productRevisionId, stage: 'FINAL', required: true, active: true },
  })
  let allPass = true
  let anyMissing = false
  for (const tpl of templates) {
    const latest = await db.testResult.findFirst({ where: { templateId: tpl.id, deviceId }, orderBy: { createdAt: 'desc' } })
    if (!latest) { anyMissing = true; continue }
    if (!latest.passed) allPass = false
  }
  if (!anyMissing && allPass && ['QC_FAIL', 'REWORK', 'IN_PRODUCTION'].includes(device.status)) {
    await db.device.update({ where: { id: deviceId }, data: { status: 'QC_PASS', producedAt: device.producedAt ?? new Date() } })
    await db.nonconformity.updateMany({
      where: { deviceId, status: { in: ['IN_REWORK', 'RETEST', 'OPEN'] }, type: 'TEST_FAIL' },
      data: { status: 'RESOLVED' },
    })
    if (device.orderId) {
      const siblings = await db.device.findMany({ where: { orderId: device.orderId } })
      if (siblings.every((d) => d.status === 'QC_PASS')) {
        await notifyRole('QC', 'همه دستگاه‌های سفارش QC پاس کردند', 'سفارش آماده «تکمیل تولید» است.', 'SUCCESS', { entityType: 'ORDER', entityId: device.orderId, linkView: 'order-detail' })
        await notifyRole('PRODUCTION_MGR', 'سفارش آماده تکمیل', 'همه دستگاه‌ها QC را پاس کردند.', 'SUCCESS', { entityType: 'ORDER', entityId: device.orderId, linkView: 'order-detail' })
      }
    }
  }
}
