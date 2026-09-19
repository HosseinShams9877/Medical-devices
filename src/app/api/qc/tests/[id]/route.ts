import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'
import { recomputeDeviceQc } from '@/lib/qc'

// ─── POST /api/qc/tests/[id] — تأیید QC یا Retest ───
const schema = z.object({
  action: z.enum(['verify', 'retest']),
  notes: z.string().max(2000).optional(),
  actualValue: z.string().max(100).optional(),
  passed: z.boolean().optional(),
  equipmentId: z.string().optional().nullable(),
})

export const POST = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const body = await readJson(req, schema)

  const test = await db.testResult.findUnique({ where: { id }, include: { device: true, template: true } })
  if (!test) throw faError('نتیجه تست یافت نشد.', 404)

  if (body.action === 'verify') {
    if (!user.permissions.includes('qc.test.verify')) throw faError('فقط مسئول QC مجاز به تأیید نتایج است.', 403)
    if (test.verifiedById) throw faError('این نتیجه قبلاً تأیید شده است.')
    await db.testResult.update({ where: { id }, data: { verifiedById: user.id, verifiedAt: new Date(), notes: body.notes ?? test.notes } })
    await audit(req, user, 'QC_TEST_VERIFY', { entityType: 'DEVICE', entityId: test.deviceId ?? '—', entityCode: test.device?.serial ?? '—', newValues: { template: test.templateCode, passed: test.passed } })
    return ok({ success: true })
  }

  // ─── Retest: رکورد جدید، سوابق قبلی هرگز حذف/بازنویسی نمی‌شوند ───
  if (!user.permissions.includes('qc.test.create')) throw faError('شما مجوز ثبت Retest را ندارید.', 403)
  if (test.retestOfId) throw faError('این رکورد خودش Retest است؛ Retest جدید باید از نتیجه اصلی ثبت شود.')
  if (!test.deviceId) throw faError('Retest فقط برای تست‌های دستگاهی مجاز است.')
  if (test.passed) throw faError('برای تست موفق Retest موضوعیت ندارد.')
  if (!body.actualValue) throw faError('مقدار اندازه‌گیری Retest الزامی است.')

  const tpl = await db.testTemplate.findFirst({ where: { code: test.templateCode } })
  let passed = body.passed
  const numeric = parseFloat(body.actualValue.replace(/[^\d.-]/g, ''))
  if (passed === undefined) {
    const norm = body.actualValue.trim().toLowerCase()
    if (['pass', 'ok', 'تایید', 'تأیید', 'صحیح'].includes(norm)) passed = true
    else if (['fail', 'nok', 'خطا', 'ناموفق'].includes(norm)) passed = false
  }
  if (passed === undefined && tpl && !isNaN(numeric) && (tpl.minValue !== null || tpl.maxValue !== null)) {
    passed = true
    if (tpl.minValue !== null && numeric < tpl.minValue) passed = false
    if (tpl.maxValue !== null && numeric > tpl.maxValue) passed = false
  }
  if (passed === undefined) throw faError('نتیجه Pass/Fail مشخص نشد.')

  let equipmentId = body.equipmentId ?? test.equipmentId
  if (equipmentId) {
    const eq = await db.equipment.findUnique({ where: { id: equipmentId } })
    if (eq && (eq.status === 'OVERDUE' || (eq.calibrationDueAt && eq.calibrationDueAt < new Date()))) {
      throw faError(`کالیبراسیون تجهیزات «${eq.name}» منقضی شده است؛ امکان ثبت Retest وجود ندارد.`)
    }
  }

  const retest = await db.testResult.create({
    data: {
      templateCode: test.templateCode, name: `${test.name} (Retest)`, stage: test.stage, templateId: test.templateId,
      deviceId: test.deviceId, orderId: test.orderId, parameterName: test.parameterName, unit: test.unit,
      criteria: test.criteria, actualValue: body.actualValue, passed, equipmentId: equipmentId ?? null,
      operatorId: user.id, notes: body.notes, retestOfId: test.id,
    },
  })

  if (passed && test.deviceId) {
    await recomputeDeviceQc(test.deviceId)
  } else if (!passed && test.deviceId) {
    await db.device.update({ where: { id: test.deviceId }, data: { status: 'QC_FAIL' } })
    await notifyRole('QC', 'Retest ناموفق', `دستگاه ${test.device?.serial} در Retest «${test.name}» مجدداً رد شد.`, 'CRITICAL', { entityType: 'DEVICE', entityId: test.deviceId, linkView: 'device' })
  }

  await audit(req, user, 'QC_TEST_RETEST', {
    entityType: 'DEVICE', entityId: test.deviceId ?? '—', entityCode: test.device?.serial ?? '—',
    oldValues: { testId: test.id, actual: test.actualValue, passed: test.passed },
    newValues: { retestId: retest.id, actual: body.actualValue, passed },
  })
  return ok({ retest })
})
