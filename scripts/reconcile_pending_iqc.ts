/** Review old PENDING receipts that were counted in stock before the QC gate was fixed. */
import { db } from '../src/lib/db'
import { recordMovement } from '../src/lib/stock'

const apply = process.argv.includes('--apply')

async function main() {
  const pending = await db.componentLot.findMany({
    where: { status: 'PENDING' }, include: { component: true, inspections: true },
  })
  let eligible = 0
  let fixed = 0
  let review = 0
  for (const lot of pending) {
    const key = `legacy-pending-iqc:${lot.id}`
    if (await db.inventoryOperation.findUnique({ where: { id: key } })) continue
    const receipts = await db.stockMovement.findMany({
      where: { componentId: lot.componentId, lotId: lot.id, type: 'MANUAL_IN' },
    })
    const receipt = receipts.length === 1 ? receipts[0] : null
    const inspection = lot.inspections.find(i => i.status === 'PENDING')
    if (!receipt || !inspection || Math.abs(receipt.qty - lot.quantity) > 1e-7 ||
        lot.component.stockQty - lot.quantity < lot.component.reservedQty - 1e-7) {
      review++
      console.log(`REVIEW ${lot.component.code}/${lot.lotNumber}: رسید قدیمی یا ماندهٔ آزاد قابل احراز نیست؛ شمارش دستی لازم است.`)
      continue
    }
    eligible++
    if (!apply) {
      console.log(`READY ${lot.component.code}/${lot.lotNumber}: ${lot.quantity} ${lot.component.unit} باید از موجودی قابل مصرف خارج شود.`)
      continue
    }
    await db.$transaction(async tx => {
      if (await tx.inventoryOperation.findUnique({ where: { id: key } })) return
      const current = await tx.component.findUniqueOrThrow({ where: { id: lot.componentId } })
      if (current.stockQty - lot.quantity < current.reservedQty - 1e-7) throw Error('موجودی آزاد برای تطبیق کافی نیست؛ دوباره بررسی کنید.')
      const claimed = await tx.component.updateMany({
        where: { id: current.id, stockQty: current.stockQty, reservedQty: current.reservedQty },
        data: { stockQty: { decrement: lot.quantity } },
      })
      if (!claimed.count) throw Error('موجودی هنگام تطبیق تغییر کرد؛ دوباره اجرا کنید.')
      await recordMovement({ componentId: current.id, lotId: lot.id, lotNumber: lot.lotNumber,
        type: 'ADJUST', qty: -lot.quantity, beforeQty: current.stockQty,
        afterQty: current.stockQty - lot.quantity, userId: receipt.userId,
        reason: `تطبیق رسید معلق نسخه پیشین؛ ورود واقعی پس از تأیید QC ثبت می‌شود — ${inspection.code}` }, tx)
      await tx.inventoryOperation.create({ data: { id: key, kind: 'LEGACY_PENDING_QC_RECONCILE' } })
    })
    fixed++
  }
  console.log(`${apply ? 'اصلاح‌شده' : 'قابل اصلاح'}: ${apply ? fixed : eligible}، نیازمند بررسی دستی: ${review}، کل لات‌های معلق: ${pending.length}`)
  if (review) process.exitCode = 2
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
