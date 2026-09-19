import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'
import { recomputeDeviceQc } from '@/lib/qc'

// ─── GET /api/qc/tests — فهرست نتایج تست ───
export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'qc.view')
  const sp = req.nextUrl.searchParams
  const stage = sp.get('stage') || undefined
  const deviceId = sp.get('deviceId') || undefined
  const orderId = sp.get('orderId') || undefined
  const passed = sp.get('passed')
  const q = sp.get('q') || undefined

  const tests = await db.testResult.findMany({
    where: {
      ...(stage ? { stage } : {}),
      ...(deviceId ? { deviceId } : {}),
      ...(orderId ? { orderId } : {}),
      ...(passed === 'fail' ? { passed: false } : passed === 'pass' ? { passed: true } : {}),
      ...(q ? { OR: [{ templateCode: { contains: q } }, { name: { contains: q } }, { device: { serial: { contains: q } } }, { order: { code: { contains: q } } }] } : {}),
    },
    include: {
      device: { select: { serial: true, status: true } },
      order: { select: { code: true, status: true } },
      operator: { select: { fullName: true } },
      verifier: { select: { fullName: true } },
      equipment: { select: { code: true, name: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return ok({ tests })
})

// ─── POST /api/qc/tests — ثبت نتیجه تست ───
const schema = z.object({
  templateId: z.string(),
  deviceId: z.string().optional().nullable(),
  actualValue: z.string().min(1, 'مقدار اندازه‌گیری الزامی است').max(100),
  passed: z.boolean().optional(),
  equipmentId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional(),
})

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!user.permissions.includes('qc.test.create')) throw faError('شما مجوز ثبت نتیجه تست را ندارید.', 403)
  const body = await readJson(req, schema)

  const tpl = await db.testTemplate.findUnique({ where: { id: body.templateId } })
  if (!tpl || !tpl.active) throw faError('قالب تست معتبر نیست.')

  // اعتبارسنجی تجهیزات تست — کالیبراسیون
  let equipmentCalibrated = true
  let equipmentId = body.equipmentId ?? tpl.equipmentId
  if (equipmentId) {
    const eq = await db.equipment.findUnique({ where: { id: equipmentId } })
    if (!eq) throw faError('تجهیزات تست یافت نشد.', 404)
    if (eq.status === 'OVERDUE' || (eq.calibrationDueAt && eq.calibrationDueAt < new Date())) {
      throw faError(`امکان ثبت تست وجود ندارد: کالیبراسیون تجهیزات «${eq.name}» منقضی شده است. ابتدا تجهیزات را کالیبره کنید.`)
    }
    equipmentCalibrated = true
  }

  // تعیین Pass/Fail
  let passed = body.passed
  const numeric = parseFloat(body.actualValue.replace(/[^\d.-]/g, ''))
  if (passed === undefined) {
    const norm = body.actualValue.trim().toLowerCase()
    if (['pass', 'ok', 'تایید', 'تأیید', 'صحیح'].includes(norm)) passed = true
    else if (['fail', 'nok', 'خطا', 'ناموفق'].includes(norm)) passed = false
  }
  if (passed === undefined) {
    if (!isNaN(numeric) && (tpl.minValue !== null || tpl.maxValue !== null)) {
      passed = true
      if (tpl.minValue !== null && numeric < tpl.minValue) passed = false
      if (tpl.maxValue !== null && numeric > tpl.maxValue) passed = false
    } else {
      throw faError('نتیجه Pass/Fail مشخص نشد؛ قالب تست معیار عددی ندارد و باید نتیجه صریحاً تعیین شود.')
    }
  }

  let device = null
  if (body.deviceId) {
    device = await db.device.findUnique({ where: { id: body.deviceId }, include: { order: true } })
    if (!device) throw faError('دستگاه یافت نشد.', 404)
    if (['RELEASED', 'DELIVERED', 'SCRAPPED'].includes(device.status)) {
      throw faError('برای دستگاه آزاد‌شده/تحویل‌شده امکان ثبت تست جدید وجود ندارد (کنترل سوابق).')
    }
    // تست نهایی فقط در وضعیت‌های مرتبط با QC سفارش
    if (tpl.stage === 'FINAL' && device.order && !['WAITING_QC', 'REWORK', 'COMPLETED'].includes(device.order.status)) {
      throw faError(`ثبت تست نهایی مجاز نیست: سفارش ${device.order.code} در وضعیت «${device.order.status}» است. سفارش باید در کنترل کیفیت باشد.`)
    }
  }

  const test = await db.testResult.create({
    data: {
      templateCode: tpl.code, name: tpl.name, stage: tpl.stage, templateId: tpl.id,
      deviceId: body.deviceId ?? null, orderId: device?.orderId ?? null,
      parameterName: tpl.parameterName, unit: tpl.unit, criteria: tpl.criteria,
      actualValue: body.actualValue, passed, equipmentId: equipmentId ?? null,
      equipmentCalibrated, operatorId: user.id, notes: body.notes,
    },
  })

  // ─── اثر تست ناموفق اجباری ───
  if (!passed && tpl.required && device) {
    const ncrCode = `NCR-1404-${String((await db.nonconformity.count()) + 1).padStart(3, '0')}`
    const ncr = await db.nonconformity.create({
      data: {
        code: ncrCode, type: 'TEST_FAIL', source: tpl.stage, deviceId: device.id, orderId: device.orderId, testResultId: test.id,
        title: `شکست تست «${tpl.name}» در ${device.serial}`,
        description: `مقدار اندازه‌گیری‌شده ${body.actualValue} ${tpl.unit ?? ''} در برابر معیار «${tpl.criteria ?? ''}» رد شد.`,
        severity: 'HIGH', detectedById: user.id,
      },
    })
    await db.testResult.update({ where: { id: test.id }, data: { ncrId: ncr.id } })
    if (tpl.stage === 'FINAL') {
      await db.device.update({ where: { id: device.id }, data: { status: 'QC_FAIL' } })
      if (device.order && device.order.status === 'WAITING_QC') {
        await db.productionOrder.update({ where: { id: device.orderId! }, data: { status: 'REWORK' } })
      }
    }
    await notifyRole('QC', 'تست اجباری ناموفق', `دستگاه ${device.serial} در تست «${tpl.name}» رد شد — NCR ${ncrCode} ایجاد شد.`, 'CRITICAL', { entityType: 'DEVICE', entityId: device.id, linkView: 'device' })
    await notifyRole('PRODUCTION_MGR', 'نیاز به Rework', `دستگاه ${device.serial} نیازمند اقدام اصلاحی است.`, 'WARNING', { entityType: 'DEVICE', entityId: device.id, linkView: 'device' })
    await audit(req, user, 'QC_TEST_FAIL', { entityType: 'DEVICE', entityId: device.id, entityCode: device.serial, newValues: { template: tpl.code, actual: body.actualValue, criteria: tpl.criteria, ncr: ncrCode } })
  }

  // ─── اثر تست موفق نهایی ───
  if (passed && tpl.stage === 'FINAL' && device) {
    await recomputeDeviceQc(device.id)
  }

  await audit(req, user, 'QC_TEST_CREATE', {
    entityType: 'DEVICE', entityId: device?.id ?? '—', entityCode: device?.serial ?? '—',
    newValues: { template: tpl.code, actual: body.actualValue, passed },
  })
  return ok({ test })
})
