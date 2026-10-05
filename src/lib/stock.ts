// ─────────────────────────────────────────────────────────────
// Stock Ledger — دفتر گردش کالا (Append-Only)
// هر تغییر موجودی با مقدار قبل/بعد، نوع، مبنا و کاربر ثبت می‌شود.
// دفتر مبنای گزارش «گردش کالا» و راستی‌آزمایی موجودی است.
// ─────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'

export type StockDb = Prisma.TransactionClient

export type MovementType =
  | 'MANUAL_IN'      // ورود دستی / ثبت رسید
  | 'MANUAL_OUT'     // خروج دستی
  | 'ADJUST'         // اصلاح موجودی (شمارش و…)
  | 'BOM_CONSUME'    // مصرف خودکار بر اساس BOM
  | 'PRODUCTION'     // مصرف تولید (شروع سفارش تولید)
  | 'IQC_REJECT'     // خروج لات رد‌شده در کنترل ورودی
  | 'IQC_APPROVE'    // ورود موجودی قابل مصرف پس از تأیید

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
export async function nextMovementCode(): Promise<string> { return `MV-${randomUUID()}` }

// ثبت یک ردیف دفتر — فقط درج؛ به‌روزرسانی/حذف ممنوع
export async function recordMovement(input: MovementInput, client: StockDb = db) {
  const code = await nextMovementCode()
  return client.stockMovement.create({
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
  client: StockDb = db,
): Promise<{ lotId: string; lotNumber: string; qty: number }[]> {
  const lots = await client.componentLot.findMany({
    where: { componentId, status: 'APPROVED', remaining: { gt: 0 } },
    orderBy: { receivedAt: 'asc' },
  })
  if (qty <= 0 || !Number.isFinite(qty)) throw new Error('مقدار مصرف نامعتبر است.')
  if (lots.reduce((sum, lot) => sum + lot.remaining, 0) + 1e-7 < qty) {
    throw new Error('ماندهٔ لات‌های تأییدشده برای مصرف کافی نیست.')
  }
  const consumed: { lotId: string; lotNumber: string; qty: number }[] = []
  let left = qty
  for (const lot of lots) {
    if (left <= 0.0000001) break
    const take = Math.min(lot.remaining, left)
    if (take <= 0) continue
    const updated = await client.componentLot.updateMany({ where: { id: lot.id, status: 'APPROVED', remaining: { gte: take } }, data: { remaining: { decrement: take } } })
    if (updated.count !== 1) throw new Error('موجودی لات تغییر کرده است؛ دوباره تلاش کنید.')
    consumed.push({ lotId: lot.id, lotNumber: lot.lotNumber, qty: take })
    left -= take
  }
  return consumed
}
