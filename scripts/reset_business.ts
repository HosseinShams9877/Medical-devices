// ─────────────────────────────────────────────────────────────
// Reset Business Data — پاک‌سازی داده‌های نمایشی کسب‌وکار
// کاربران/نشست‌ها حفظ می‌شوند؛ فقط داده‌های عملیاتی پاک می‌شوند
// اجرا: bunx tsx scripts/reset_business.ts
// ─────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('⏳ پاک‌سازی داده‌های کسب‌وکار (کاربران حفظ می‌شوند)…')
  const tables = [
    'NotificationRead', 'Notification', 'AuditLog', 'Document', 'WarrantyOverride',
    'StockMovement', 'RepairPart', 'Repair', 'Complaint', 'TicketUpdate', 'ServiceTicket', 'Customer',
    'ProductRelease', 'ReworkRecord', 'Nonconformity', 'IncomingInspection', 'TestResult',
    'TestTemplate', 'Equipment', 'DevicePartUsage', 'StepRecord', 'Device', 'OrderStep',
    'OrderMaterial', 'ProductionOrder', 'ProcessStepTemplate', 'BomItem', 'Bom',
    'ProductRevision', 'Product', 'ComponentLot', 'Component', 'Supplier',
  ]
  for (const t of tables) {
    // @ts-expect-error dynamic table name
    await db[t].deleteMany()
    console.log(`  ✓ ${t}`)
  }
  console.log('✅ انجام شد — پایگاه‌داده آمادهٔ ورود دادهٔ واقعی است.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
