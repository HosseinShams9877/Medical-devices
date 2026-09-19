import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePerm, readJson, withApi, ok, faError } from '@/lib/api'
import { audit } from '@/lib/audit'
import { notifyRole } from '@/lib/notify'

export const GET = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePerm(req, 'bom.view')
  const { id } = await ctx.params
  const product = await db.product.findUnique({
    where: { id },
    include: {
      revisions: {
        orderBy: { createdAt: 'asc' },
        include: {
          boms: { orderBy: { revision: 'asc' }, include: { items: { include: { component: { include: { supplier: true } } }, orderBy: { sortOrder: 'asc' } } } },
          processSteps: { orderBy: { stepIndex: 'asc' } },
        },
      },
      orders: { select: { id: true, code: true, status: true, bom: { select: { revision: true } }, qty: true }, orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })
  if (!product) throw faError('محصول یافت نشد.', 404)
  return ok({ product })
})

const actionSchema = z.object({
  action: z.enum(['edit', 'new-revision', 'new-bom-revision', 'activate-revision', 'save-process-template']),
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  warrantyMonths: z.number().int().min(0).max(120).optional(),
  hasFirmware: z.boolean().optional(),
  revision: z.string().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
  productRevisionId: z.string().optional(),
  items: z.array(z.object({
    componentId: z.string(),
    qty: z.number().positive().max(1000),
    criticality: z.enum(['CRITICAL', 'NORMAL']).optional(),
  })).optional(),
  steps: z.array(z.object({
    stepIndex: z.number().int().min(1).max(50),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().nullable(),
    tools: z.string().max(200).optional().nullable(),
    inputs: z.string().max(200).optional().nullable(),
    outputs: z.string().max(200).optional().nullable(),
    acceptance: z.string().max(200).optional().nullable(),
    required: z.boolean().default(true),
    needsQc: z.boolean().default(false),
    isPackaging: z.boolean().default(false),
  })).optional(),
})

export const POST = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePerm(req, 'bom.view')
  const { id } = await ctx.params
  const body = await readJson(req, actionSchema)
  const product = await db.product.findUnique({ where: { id }, include: { revisions: true } })
  if (!product) throw faError('محصول یافت نشد.', 404)

  if (body.action === 'edit') {
    if (!user.permissions.includes('product.manage')) throw faError('مجوز ویرایش محصول ندارید.', 403)
    const old = { name: product.name, description: product.description, warrantyMonths: product.warrantyMonths, category: product.category, hasFirmware: product.hasFirmware }
    await db.product.update({
      where: { id },
      data: { name: body.name, description: body.description, category: body.category, warrantyMonths: body.warrantyMonths, hasFirmware: body.hasFirmware },
    })
    await audit(req, user, 'PRODUCT_EDIT', { entityType: 'PRODUCT', entityId: id, entityCode: product.code, oldValues: old, newValues: body })
    return ok({ success: true })
  }

  if (body.action === 'new-revision') {
    if (!user.permissions.includes('product.manage')) throw faError('مجوز ایجاد نسخه محصول ندارید.', 403)
    if (!body.revision) throw faError('شناسه نسخه الزامی است.')
    const exists = await db.productRevision.findFirst({ where: { productId: id, revision: body.revision } })
    if (exists) throw faError('این نسخه قبلاً برای محصول ثبت شده است.')
    const rev = await db.productRevision.create({ data: { productId: id, revision: body.revision, notes: body.notes } })
    await audit(req, user, 'PRODUCT_REVISION_CREATE', { entityType: 'PRODUCT', entityId: id, entityCode: product.code, newValues: { revision: body.revision, revisionId: rev.id } })
    return ok({ revision: rev })
  }

  if (body.action === 'activate-revision') {
    if (!user.permissions.includes('product.manage')) throw faError('مجوز ندارید.', 403)
    if (!body.productRevisionId) throw faError('نسخه انتخاب نشده است.')
    const rev = await db.productRevision.findUnique({ where: { id: body.productRevisionId } })
    if (!rev || rev.productId !== id) throw faError('نسخه معتبر نیست.')
    await db.productRevision.updateMany({ where: { productId: id }, data: { isActive: false } })
    await db.productRevision.update({ where: { id: rev.id }, data: { isActive: true } })
    await audit(req, user, 'PRODUCT_REVISION_ACTIVATE', { entityType: 'PRODUCT', entityId: id, entityCode: product.code, newValues: { revision: rev.revision } })
    return ok({ success: true })
  }

  if (body.action === 'new-bom-revision') {
    if (!user.permissions.includes('bom.revise')) throw faError('مجوز ایجاد نسخه BOM ندارید.', 403)
    if (!body.productRevisionId) throw faError('نسخه محصول انتخاب نشده است.')
    const rev = await db.productRevision.findUnique({ where: { id: body.productRevisionId }, include: { boms: { where: { status: 'ACTIVE' }, include: { items: true }, orderBy: { revision: 'desc' } } } })
    if (!rev || rev.productId !== id) throw faError('نسخه محصول معتبر نیست.')

    // نسخه جدید از روی نسخه فعال (یا آیتم‌های ارسالی) — BOM قبلی بازنویسی نمی‌شود
    const newRevNo = (await db.bom.count({ where: { productRevisionId: rev.id } })) + 1
    const sourceItems = body.items ?? rev.boms[0]?.items.map((i) => ({ componentId: i.componentId, qty: i.qty, criticality: i.criticality })) ?? []
    if (sourceItems.length === 0) throw faError('BOM خالی قابل ثبت نیست.')

    // اعتبارسنجی قطعات
    for (const item of sourceItems) {
      const comp = await db.component.findUnique({ where: { id: item.componentId } })
      if (!comp) throw faError('یکی از قطعات انتخابی یافت نشد.')
    }

    const newBom = await db.bom.create({ data: { productRevisionId: rev.id, revision: newRevNo, status: 'ACTIVE', notes: body.notes, createdById: user.id } })
    await db.bomItem.createMany({
      data: sourceItems.map((item, idx) => ({
        bomId: newBom.id, componentId: item.componentId, qty: item.qty,
        criticality: item.criticality ?? 'NORMAL', sortOrder: idx + 1,
      })),
    })
    // بازنشسته‌کردن نسخه قبلی (بدون Overwrite)
    if (rev.boms[0]) {
      await db.bom.update({ where: { id: rev.boms[0].id }, data: { status: 'RETIRED' } })
    }
    await audit(req, user, 'BOM_REVISION_CREATE', {
      entityType: 'PRODUCT', entityId: id, entityCode: product.code,
      oldValues: { previousRevision: rev.boms[0]?.revision }, newValues: { newRevision: newRevNo, items: sourceItems.length },
    })
    await notifyRole('PRODUCTION_MGR', `BOM جدید برای ${product.code}`, `نسخه ${newRevNo} برای نسخه محصول ${rev.revision} فعال شد. سفارش‌های قبلی به نسخه خود متصل می‌مانند.`, 'INFO', { entityType: 'PRODUCT', entityId: id, linkView: 'products' })
    return ok({ bom: newBom })
  }

  if (body.action === 'save-process-template') {
    if (!user.permissions.includes('product.manage')) throw faError('مجوز ندارید.', 403)
    if (!body.productRevisionId || !body.steps || body.steps.length === 0) throw faError('مراحل معتبر نیستند.')
    const rev = await db.productRevision.findUnique({ where: { id: body.productRevisionId } })
    if (!rev || rev.productId !== id) throw faError('نسخه محصول معتبر نیست.')
    // فقط برای نسخه‌ای که سفارش فعال ندارد قابل ویرایش است
    const activeOrders = await db.productionOrder.count({ where: { productRevisionId: rev.id, status: { in: ['IN_PRODUCTION', 'WAITING_QC', 'REWORK'] } } })
    if (activeOrders > 0) throw faError('برای این نسخه سفارش در حال تولید وجود دارد؛ تغییر قالب فرایند مجاز نیست. نسخه محصول جدید ایجاد کنید.')
    await db.processStepTemplate.deleteMany({ where: { productRevisionId: rev.id } })
    await db.processStepTemplate.createMany({
      data: body.steps.map((s) => ({ productRevisionId: rev.id, ...s, description: s.description ?? null, tools: s.tools ?? null, inputs: s.inputs ?? null, outputs: s.outputs ?? null, acceptance: s.acceptance ?? null })),
    })
    await audit(req, user, 'PROCESS_TEMPLATE_SAVE', { entityType: 'PRODUCT', entityId: id, entityCode: product.code, newValues: { revisionId: rev.id, steps: body.steps.length } })
    return ok({ success: true })
  }

  throw faError('اقدام نامعتبر است.')
})
