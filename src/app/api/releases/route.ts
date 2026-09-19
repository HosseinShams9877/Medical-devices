import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'

// ─── GET /api/releases — صف آزادسازی + تاریخچه ───
export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'qc.view')

  // صف آزادسازی: دستگاه‌های QC_PASS در سفارش‌های تکمیل‌شده
  const queue = await db.device.findMany({
    where: { status: 'QC_PASS', order: { status: { in: ['COMPLETED', 'WAITING_QC'] } } },
    include: {
      product: { select: { code: true, name: true } },
      productRevision: { select: { revision: true } },
      order: { select: { code: true, status: true, steps: { orderBy: { stepIndex: 'asc' } } } },
      tests: { orderBy: { createdAt: 'desc' } },
      releases: true,
    },
    orderBy: { producedAt: 'asc' },
  })

  // ارزیابی شرایط پیش‌آزادسازی برای هر دستگاه
  const queueWithChecks = await Promise.all(queue.map(async (d) => {
    const checks = await releaseChecks(d.id)
    return {
      id: d.id, serial: d.serial, status: d.status, product: d.product, productRevision: d.productRevision,
      order: { code: d.order?.code, status: d.order?.status }, firmwareVersion: d.firmwareVersion,
      producedAt: d.producedAt, checks,
    }
  }))

  const history = await db.productRelease.findMany({
    include: {
      device: { include: { product: { select: { code: true, name: true } } } },
      user: { select: { fullName: true, role: true } },
    },
    orderBy: { releasedAt: 'desc' },
    take: 100,
  })
  return ok({ queue: queueWithChecks, history })
})

// ─── شرایط الزامی آزادسازی (سمت سرور) ───
async function releaseChecks(deviceId: string) {
  const device = await db.device.findUnique({
    where: { id: deviceId },
    include: { product: true, order: { include: { steps: true } }, tests: true, productRevision: true },
  })
  if (!device) return []
  const checks: { key: string; label: string; pass: boolean; detail?: string }[] = []

  const steps = device.order?.steps ?? []
  const undone = steps.filter((s) => s.required && s.status !== 'DONE')
  checks.push({ key: 'steps', label: 'تمام مراحل اجباری تولید تکمیل شده', pass: undone.length === 0, detail: undone.length ? undone.map((s) => s.name).join('، ') : undefined })

  const packaging = steps.find((s) => s.isPackaging)
  checks.push({ key: 'packaging', label: 'بسته‌بندی انجام شده', pass: !!packaging && packaging.status === 'DONE' })

  checks.push({ key: 'serial', label: 'شماره سریال ثبت شده', pass: !!device.serial })

  const templates = await db.testTemplate.findMany({ where: { productRevisionId: device.productRevisionId, stage: 'FINAL', required: true, active: true } })
  let allTests = true
  const missing: string[] = []
  const failed: string[] = []
  for (const tpl of templates) {
    const latest = device.tests.filter((t) => t.templateId === tpl.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    if (!latest) { allTests = false; missing.push(tpl.name); continue }
    if (!latest.passed) { allTests = false; failed.push(tpl.name) }
  }
  checks.push({ key: 'tests-done', label: 'تمام تست‌های اجباری نهایی انجام شده', pass: missing.length === 0, detail: missing.join('، ') })
  checks.push({ key: 'tests-pass', label: 'تمام تست‌های اجباری پاس شده', pass: failed.length === 0, detail: failed.join('، ') })

  if (device.product.hasFirmware) {
    checks.push({ key: 'firmware', label: 'نسخه Firmware ثبت و تأیید شده', pass: !!device.firmwareVersion && !!device.programVerified })
  }

  const unverified = device.tests.filter((t) => t.stage === 'FINAL' && !t.verifiedById)
  checks.push({ key: 'qc-verified', label: 'نتایج تست نهایی توسط QC تأیید شده', pass: unverified.length === 0, detail: unverified.length ? `${unverified.length} تست تأیید نشده` : undefined })

  const existing = await db.productRelease.findFirst({ where: { deviceId } })
  checks.push({ key: 'not-released', label: 'قبلاً آزادسازی نشده', pass: !existing })

  return checks
}

// ─── POST /api/releases — آزادسازی دستگاه ───
const schema = z.object({
  action: z.literal('release'),
  deviceId: z.string(),
  notes: z.string().max(2000).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requirePerm(req, 'qc.release')
  const body = await readJson(req, schema)

  const device = await db.device.findUnique({ where: { id: body.deviceId }, include: { order: true, product: true } })
  if (!device) throw faError('دستگاه یافت نشد.', 404)
  if (device.status !== 'QC_PASS') throw faError('آزادسازی فقط برای دستگاه با وضعیت «QC پاس» مجاز است.')

  const checks = await releaseChecks(device.id)
  const failed = checks.filter((c) => !c.pass)
  if (failed.length > 0) {
    throw faError(`شرایط آزادسازی برقرار نیست: ${failed.map((c) => c.label).join('؛ ')}`)
  }

  await db.productRelease.create({
    data: {
      deviceId: device.id, releasedById: user.id, notes: body.notes,
      checksJson: JSON.stringify(checks.map((c) => ({ key: c.key, pass: c.pass }))),
    },
  })
  await db.device.update({ where: { id: device.id }, data: { status: 'RELEASED' } })
  await audit(req, user, 'PRODUCT_RELEASE', {
    entityType: 'DEVICE', entityId: device.id, entityCode: device.serial,
    newValues: { releasedBy: user.username, notes: body.notes, checks: checks.map((c) => `${c.key}:${c.pass ? 'OK' : 'FAIL'}`) },
  })

  // اگر همه دستگاه‌های سفارش آزاد شدند → سفارش RELEASED
  if (device.orderId) {
    const siblings = await db.device.findMany({ where: { orderId: device.orderId } })
    if (siblings.every((d) => d.status === 'RELEASED' || d.status === 'DELIVERED')) {
      await db.productionOrder.update({ where: { id: device.orderId }, data: { status: 'RELEASED' } })
      await audit(req, user, 'ORDER_TRANSITION', { entityType: 'ORDER', entityId: device.orderId, entityCode: device.order?.code, newValues: { status: 'RELEASED', note: 'آزادسازی همه دستگاه‌ها' } })
      await notifyRole('SALES', 'محصول آماده تحویل', `سفارش ${device.order?.code} کامل آزاد شد و آماده تحویل به مشتری است.`, 'SUCCESS', { entityType: 'ORDER', entityId: device.orderId, linkView: 'release' })
      await notifyRole('PRODUCTION_MGR', 'سفارش آزاد شد', `${device.order?.code} با موفقیت آزادسازی شد.`, 'SUCCESS', { entityType: 'ORDER', entityId: device.orderId, linkView: 'order-detail' })
    }
  }

  return ok({ success: true })
})
