import { evaluateQc } from '@/lib/qc-evaluate'
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
    if (eq.status !== 'ACTIVE' || (eq.calibrationDueAt && eq.calibrationDueAt < new Date())) {
      throw faError(`امکان ثبت تست وجود ندارد: کالیبراسیون تجهیزات «${eq.name}» منقضی شده است. ابتدا تجهیزات را کالیبره کنید.`)
    }
    equipmentCalibrated = true
  }

  let passed: boolean
  try { passed = evaluateQc(body.actualValue, tpl.minValue, tpl.maxValue, body.passed) }
  catch (error) { throw faError((error as Error).message) }

  const device = body.deviceId ? await db.device.findUnique({ where: { id: body.deviceId }, include: { order: true } }) : null
  if (body.deviceId) {
    if (!device) throw faError('دستگاه یافت نشد.', 404)
    if ((tpl.productId && tpl.productId !== device.productId) || (tpl.productRevisionId && tpl.productRevisionId !== device.productRevisionId)) throw faError('قالب آزمون متعلق به این محصول یا نسخه نیست.')
    if (['RELEASED', 'DELIVERED', 'SCRAPPED'].includes(device.status)) {
      throw faError('برای دستگاه آزاد‌شده/تحویل‌شده امکان ثبت تست جدید وجود ندارد (کنترل سوابق).')
    }
    // تست نهایی فقط در وضعیت‌های مرتبط با QC سفارش
    if (tpl.stage === 'FINAL' && device.order && !['WAITING_QC', 'REWORK', 'COMPLETED'].includes(device.order.status)) {
      throw faError(`ثبت تست نهایی مجاز نیست: سفارش ${device.order.code} در وضعیت «${device.order.status}» است. سفارش باید در کنترل کیفیت باشد.`)
    }
  }

  const { test, ncrCode } = await db.$transaction(async (tx) => {
    if (device) {
      const current = await tx.device.findUniqueOrThrow({ where: { id: device.id } })
      if (['RELEASED', 'DELIVERED', 'SCRAPPED'].includes(current.status)) throw faError('وضعیت دستگاه تغییر کرده است.', 409)
    }
    let ncrCode: string | null = null
    const test = await tx.testResult.create({
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
    ncrCode = `NCR-${crypto.randomUUID()}`
    const ncr = await tx.nonconformity.create({
      data: {
        code: ncrCode, type: 'TEST_FAIL', source: tpl.stage, deviceId: device.id, orderId: device.orderId, testResultId: test.id,
        title: `شکست تست «${tpl.name}» در ${device.serial}`,
        description: `مقدار اندازه‌گیری‌شده ${body.actualValue} ${tpl.unit ?? ''} در برابر معیار «${tpl.criteria ?? ''}» رد شد.`,
        severity: 'HIGH', detectedById: user.id,
      },
    })
    await tx.testResult.update({ where: { id: test.id }, data: { ncrId: ncr.id } })
    if (tpl.stage === 'FINAL') {
      await tx.device.update({ where: { id: device.id }, data: { status: 'QC_FAIL' } })
      if (device.order && device.order.status === 'WAITING_QC') {
        await tx.productionOrder.updateMany({ where: { id: device.orderId!, status: 'WAITING_QC' }, data: { status: 'REWORK' } })
      }
    }
    }
    return { test, ncrCode }
  })
  if (ncrCode && device) {
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
