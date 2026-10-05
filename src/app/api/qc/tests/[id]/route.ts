import { evaluateQc } from '@/lib/qc-evaluate'
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
    const verified = await db.testResult.updateMany({ where: { id, verifiedById: null }, data: { verifiedById: user.id, verifiedAt: new Date(), notes: body.notes ?? test.notes } })
    if (!verified.count) throw faError('این نتیجه هم‌زمان تأیید شده است.', 409)
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
  if (!tpl || !tpl.active || !tpl.retestAllowed) throw faError('قالب آزمون برای آزمون مجدد مجاز نیست.')
  if (!test.device || ['RELEASED', 'DELIVERED', 'SCRAPPED'].includes(test.device.status)) throw faError('وضعیت دستگاه اجازه آزمون مجدد نمی‌دهد.')
  let passed: boolean
  try { passed = evaluateQc(body.actualValue, tpl.minValue, tpl.maxValue, body.passed) }
  catch (error) { throw faError((error as Error).message) }

  let equipmentId = body.equipmentId ?? test.equipmentId
  if (equipmentId) {
    const eq = await db.equipment.findUnique({ where: { id: equipmentId } })
    if (!eq) throw faError('تجهیز آزمون یافت نشد.')
    if ((eq.status !== 'ACTIVE' || (eq.calibrationDueAt && eq.calibrationDueAt < new Date()))) {
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
