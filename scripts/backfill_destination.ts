/** Run once after `prisma db push` when upgrading an existing installation. Idempotent. */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
async function main() {
try {
  const changed = await db.productionOrder.updateMany({
    where: {
      destinationType: 'WAREHOUSE',
      OR: [{ originType: 'CUSTOMER_ORDER' }, { customerId: { not: null } }],
    },
    data: { destinationType: 'CUSTOMER' },
  })
  console.log(`${changed.count} existing customer orders updated.`)
} finally {
  await db.$disconnect()
}
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
