// ─────────────────────────────────────────────────────────────
// Patch — دادهٔ نمایشی برای ماژول‌های جدید:
// ۱) مبدأ درخواست برای سفارش‌های موجود (دستور مدیریتی / صورت‌جلسه / سفارش مشتری)
// ۲) دفتر گردش کالا: ساخت ردیف ورود برای لات‌های موجود (بازسازی تاریخی)
// ۳) دو نمونه خروج دستی برای نمایش دفتر
// اجرا: bun scripts/patch_warehouse.ts   (idempotent)
// ─────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('⏳ ۰) مهاجرت وضعیت سفارش‌های RELEASED قدیمی → IN_WAREHOUSE…')
  const legacy = await db.productionOrder.findMany({ where: { status: 'RELEASED' } })
  for (const o of legacy) {
    await db.productionOrder.update({ where: { id: o.id }, data: { status: 'IN_WAREHOUSE' } })
    console.log(`   ${o.code}: RELEASED → IN_WAREHOUSE`)
  }

  console.log('⏳ ۱) مبدأ درخواست سفارش‌ها…')
  const orders = await db.productionOrder.findMany({ orderBy: { createdAt: 'asc' } })
  const customer = await db.customer.findFirst({ orderBy: { createdAt: 'asc' } })

  const origins: Record<string, { type: string; ref?: string; title?: string; issuedBy?: string; customerId?: string }> = {}
  if (orders[0]) origins[orders[0].code] = { type: 'DIRECTIVE', ref: 'MSD-1404-018', title: 'تولید سفارش نیم‌سال اول', issuedBy: 'مدیرعالی محترم' }
  if (orders[1]) origins[orders[1].code] = { type: 'MINUTES', ref: 'MJ-1404-023', title: 'صورتجلسهٔ کمیتهٔ تولید', issuedBy: 'دبیر کمیتهٔ تولید' }
  if (orders[2] && customer) origins[orders[2].code] = { type: 'CUSTOMER_ORDER', ref: 'SO-1404-045', title: 'سفارش تأمین تجهیزات', customerId: customer.id }
  for (const [code, o] of Object.entries(origins)) {
    const order = orders.find((x) => x.code === code)
    if (!order || order.originType !== 'INTERNAL') continue
    await db.productionOrder.update({
      where: { id: order.id },
      data: {
        originType: o.type,
        originRef: o.ref,
        originTitle: o.title,
        originIssuedBy: o.issuedBy,
        originDate: order.createdAt,
        ...(o.customerId ? { customerId: o.customerId } : {}),
      },
    })
    console.log(`   ${code} → ${o.type}`)
  }

  console.log('⏳ ۲) دفتر گردش کالا (بازسازی رسیدهای لات‌ها)…')
  const warehouseUser = (await db.user.findFirst({ where: { role: 'WAREHOUSE' } })) ?? await db.user.findFirst()
  if (!warehouseUser) throw new Error('کاربر انبار یافت نشد')

  const existing = await db.stockMovement.count()
  if (existing === 0) {
    let seq = 0
    const comps = await db.component.findMany({ include: { lots: { orderBy: { receivedAt: 'asc' } } } })
    for (const comp of comps) {
      let running = 0
      for (const lot of comp.lots) {
        if (lot.quantity <= 0) continue
        seq++
        running += lot.quantity
        await db.stockMovement.create({
          data: {
            code: `MV-1404-${String(seq).padStart(3, '0')}`,
            componentId: comp.id,
            lotId: lot.id,
            lotNumber: lot.lotNumber,
            type: 'MANUAL_IN',
            qty: lot.quantity,
            beforeQty: running - lot.quantity,
            afterQty: running,
            reason: `رسید انبار — لات ${lot.lotNumber} (${lot.status === 'APPROVED' ? 'تأییدشده' : lot.status === 'REJECTED' ? 'ردشده' : 'در انتظار IQC'})`,
            userId: warehouseUser.id,
            createdAt: lot.receivedAt,
          },
        })
      }
    }
    console.log(`   ${seq} ردیف ورود ساخته شد`)

    // دو نمونهٔ خروج دستی روی اولین قطعهٔ دارای موجودی
    const withStock = comps.find((c) => c.stockQty >= 5)
    if (withStock) {
      const base = withStock.stockQty
      seq++
      await db.stockMovement.create({
        data: {
          code: `MV-1404-${String(seq).padStart(3, '0')}`,
          componentId: withStock.id,
          type: 'MANUAL_OUT',
          qty: -3,
          beforeQty: base,
          afterQty: base - 3,
          reason: 'مصرف نمونهٔ آزمایشگاه داخلی',
          userId: warehouseUser.id,
        },
      })
      await db.component.update({ where: { id: withStock.id }, data: { stockQty: base - 3 } })
      console.log(`   خروج دستی نمونه روی ${withStock.code} ثبت شد`)
    }
  } else {
    console.log(`   از قبل ${existing} ردیف وجود دارد — رد شد (idempotent)`)
  }

  console.log('✅ پایان')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
