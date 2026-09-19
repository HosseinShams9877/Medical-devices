// ─────────────────────────────────────────────────────────────
// Stock Ledger — دفتر گردش کالا (Append-Only)
// هر تغییر موجودی با مقدار قبل/بعد، نوع، مبنا و کاربر ثبت می‌شود.
// دفتر مبنای گزارش «گردش کالا» و راستی‌آزمایی موجودی است.
// ─────────────────────────────────────────────────────────────
import { db } from '@/lib/db'

export type MovementType =
  | 'MANUAL_IN'      // ورود دستی / ثبت رسید
  | 'MANUAL_OUT'     // خروج دستی
  | 'ADJUST'         // اصلاح موجودی (شمارش و…)
  | 'BOM_CONSUME'    // مصرف خودکار بر اساس BOM
  | 'PRODUCTION'     // مصرف تولید (شروع سفارش تولید)
  | 'IQC_REJECT'     // خروج لات رد‌شده در کنترل ورودی

export interface MovementInput {
  componentId: string
  type: MovementType
  qty: number // علامت‌دار: مثبت = ورود، منفی = خروج
  beforeQty: number
  afterQty: number
  reason?: string
  lotId?: string | null
  lotNumber?: string | null
  orderId?: string | null
  userId: string
}

// شمارهٔ یکتای گردش کالا — MV-1404-001
export async function nextMovementCode(): Promise<string> {
  const count = await db.stockMovement.count()
  let code = `MV-1404-${String(count + 1).padStart(3, '0')}`
  // در صورت تصادم (حذف/ادغام داده) پسوند زمانی یکتا
  while (await db.stockMovement.findUnique({ where: { code } })) {
    code = `MV-1404-${Date.now().toString().slice(-5)}`
  }
  return code
}

// ثبت یک ردیف دفتر — فقط درج؛ به‌روزرسانی/حذف ممنوع
export async function recordMovement(input: MovementInput) {
  const code = await nextMovementCode()
  return db.stockMovement.create({
    data: {
      code,
      componentId: input.componentId,
      type: input.type,
      qty: input.qty,
      beforeQty: input.beforeQty,
      afterQty: input.afterQty,
      reason: input.reason,
      lotId: input.lotId ?? undefined,
      lotNumber: input.lotNumber ?? undefined,
      orderId: input.orderId ?? undefined,
      userId: input.userId,
    },
  })
}

// مصرف FIFO از لات‌های تأیید‌شده — ردیابی لات حفظ می‌شود
export async function consumeLotsFIFO(
  componentId: string,
  qty: number,
): Promise<{ lotId: string; lotNumber: string; qty: number }[]> {
  const lots = await db.componentLot.findMany({
    where: { componentId, status: 'APPROVED', remaining: { gt: 0 } },
    orderBy: { receivedAt: 'asc' },
  })
  const consumed: { lotId: string; lotNumber: string; qty: number }[] = []
  let left = qty
  for (const lot of lots) {
    if (left <= 0.0000001) break
    const take = Math.min(lot.remaining, left)
    if (take <= 0) continue
    await db.componentLot.update({ where: { id: lot.id }, data: { remaining: { decrement: take } } })
    consumed.push({ lotId: lot.id, lotNumber: lot.lotNumber, qty: take })
    left -= take
  }
  return consumed
}
