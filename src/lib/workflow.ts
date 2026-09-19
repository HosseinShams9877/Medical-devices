// ─────────────────────────────────────────────────────────────
// Workflow Engine — گذار‌های مجاز وضعیت، سمت سرور اعمال می‌شود.
// هیچ کاربری نمی‌تواند بدون مجوز مرحله‌ای را Skip یا تغییر دهد.
// تعاریف خالص در workflow-defs.ts قرار دارد (قابل استفاده در کلاینت).
// ─────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { hasPerm } from '@/lib/rbac'
import {
  ORDER_TRANSITIONS, TICKET_TRANSITIONS, COMPLAINT_TRANSITIONS, NCR_TRANSITIONS,
  type TransitionDef,
} from './workflow-defs'

export * from './workflow-defs'

// ─── محاسبه‌ی گذار‌های مجاز برای کاربر (سمت سرور، برای رندر UI) ───
export async function allowedTransitions(
  kind: 'order' | 'ticket' | 'complaint' | 'ncr',
  status: string,
  role: string,
  entityId: string,
): Promise<{ to: string; label: string; perm: string; danger?: boolean; disabled?: boolean; disabledReason?: string }[]> {
  const map =
    kind === 'order' ? ORDER_TRANSITIONS :
    kind === 'ticket' ? TICKET_TRANSITIONS :
    kind === 'complaint' ? COMPLAINT_TRANSITIONS : NCR_TRANSITIONS

  const list: TransitionDef[] = map[status] ?? []
  const result: { to: string; label: string; perm: string; danger?: boolean; disabled?: boolean; disabledReason?: string }[] = []
  for (const t of list) {
    const permitted = hasPerm(role, t.perm)
    let disabled = false
    let disabledReason: string | undefined
    if (permitted && t.guard) {
      const g = await evaluateGuard(kind, t.guard, entityId)
      disabled = !g.ok
      disabledReason = g.reason
    }
    result.push({
      to: t.to,
      label: t.label,
      perm: t.perm,
      danger: t.danger,
      disabled: !permitted ? true : disabled,
      disabledReason: !permitted ? 'مجوز لازم را ندارید' : disabledReason,
    })
  }
  return result
}

// ─── گارد‌های سخت سمت سرور ───
export async function evaluateGuard(
  kind: 'order' | 'ticket' | 'complaint' | 'ncr',
  guard: string,
  id: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (kind === 'order') {
    const order = await db.productionOrder.findUnique({ where: { id }, include: { bom: { include: { items: true } }, steps: true, devices: true, materials: true } })
    if (!order) return { ok: false, reason: 'سفارش یافت نشد' }
    switch (guard) {
      case 'hasBom':
        return order.bom && order.bom.items.length > 0
          ? { ok: true }
          : { ok: false, reason: 'نسخه BOM فعال برای این محصول تعریف نشده است' }
      case 'hasCriticalShortage': {
        const critical = order.materials.find((m) => m.critical && m.shortageQty > 0)
        return critical ? { ok: true } : { ok: false, reason: 'کمبود بحرانی وجود ندارد؛ نیاز به تأیید نیست' }
      }
      case 'noCriticalShortage': {
        const critical = order.materials.find((m) => m.critical && m.shortageQty > 0)
        return critical
          ? { ok: false, reason: 'قطعه بحرانیِ کسری دارید؛ ابتدا باید کمبود توسط فرد مجاز تأیید شود' }
          : { ok: true }
      }
      case 'allStepsDone': {
        const undone = order.steps.filter((s) => s.required && s.status !== 'DONE')
        if (undone.length > 0) return { ok: false, reason: `مراحل اجباری تکمیل نشده: ${undone.map((s) => s.name).join('، ')}` }
        if (order.devices.length < order.qty) return { ok: false, reason: 'شماره سریال برای همه دستگاه‌ها ثبت نشده است' }
        return { ok: true }
      }
      case 'allDevicesQcPass': {
        const failed = order.devices.filter((d) => d.status !== 'QC_PASS')
        if (failed.length > 0) return { ok: false, reason: `${failed.length} دستگاه هنوز QC را پاس نکرده است` }
        return { ok: true }
      }
      case 'retestPassed': {
        const failed = order.devices.filter((d) => d.status === 'QC_FAIL' || d.status === 'REWORK')
        if (failed.length > 0) return { ok: false, reason: 'دستگاه‌های ناموفق هنوز Retest موفق ندارند' }
        return { ok: true }
      }
      case 'allDevicesReleased': {
        if (order.devices.length === 0) return { ok: false, reason: 'دستگاهی برای این سفارش ثبت نشده است' }
        const notReleased = order.devices.filter((d) => !['RELEASED', 'DELIVERED', 'SCRAPPED'].includes(d.status))
        if (notReleased.length > 0) return { ok: false, reason: `${notReleased.length} دستگاه هنوز آزادسازی QC نشده است — ابتدا از بخش «آزادسازی و تحویل» اقدام کنید` }
        return { ok: true }
      }
      case 'allDevicesDelivered': {
        const notDelivered = order.devices.filter((d) => d.status !== 'DELIVERED')
        if (notDelivered.length > 0) return { ok: false, reason: `${notDelivered.length} دستگاه هنوز تحویل مشتری نشده است — ابتدا از بخش «آزادسازی و تحویل»، تحویل را ثبت کنید` }
        return { ok: true }
      }
    }
  }
  if (kind === 'ticket') {
    const ticket = await db.serviceTicket.findUnique({ where: { id } })
    if (!ticket) return { ok: false, reason: 'تیکت یافت نشد' }
    if (guard === 'hasTechnician') {
      return ticket.assignedTechnicianId
        ? { ok: true }
        : { ok: false, reason: 'ابتدا تکنسین را انتخاب کنید' }
    }
  }
  if (kind === 'complaint') {
    const c = await db.complaint.findUnique({ where: { id } })
    if (!c) return { ok: false, reason: 'شکایت یافت نشد' }
    if (guard === 'capaFields') {
      if (!c.rootCause?.trim() || !c.correctiveAction?.trim())
        return { ok: false, reason: 'ثبت علت ریشه‌ای و اقدام اصلاحی الزامی است' }
      return { ok: true }
    }
    if (guard === 'resolutionField') {
      if (!c.preventiveAction?.trim() || !c.resolution?.trim())
        return { ok: false, reason: 'ثبت اقدام پیشگیرانه و نتیجه بررسی الزامی است' }
      return { ok: true }
    }
  }
  if (kind === 'ncr') {
    const n = await db.nonconformity.findUnique({ where: { id }, include: { reworks: true } })
    if (!n) return { ok: false, reason: 'NCR یافت نشد' }
    if (guard === 'capaFilled') {
      if (!n.rootCause?.trim() || !n.correctiveAction?.trim())
        return { ok: false, reason: 'علت ریشه‌ای و اقدام اصلاحی ثبت نشده است' }
      return { ok: true }
    }
    if (guard === 'retestDone') {
      if (!n.testResultId) return { ok: true }
      const ret = await db.testResult.findFirst({ where: { retestOfId: n.testResultId } })
      return ret
        ? { ok: true }
        : { ok: false, reason: 'هنوز Retest ثبت نشده است' }
    }
  }
  return { ok: true }
}
