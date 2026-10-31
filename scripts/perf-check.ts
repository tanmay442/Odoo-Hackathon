import { getDatabase } from '../src/db/client'
import { getDashboardSummary } from '../src/features/dashboard/queries'
import { listInvoices } from '../src/features/invoices/queries'
import { listPayments } from '../src/features/payments/queries'
import { listSubscriptions } from '../src/features/subscriptions/queries'

const database = getDatabase(process.env.DATABASE_URL)
const results: Array<[string, number]> = []

async function timed(name: string, work: () => Promise<unknown>): Promise<void> {
  const start = performance.now()
  await work()
  const elapsed = Math.round(performance.now() - start)
  results.push([name, elapsed])
  console.log(`${name}: ${elapsed}ms`)
}

async function main(): Promise<void> {
  // First call warms the pool (cold TLS handshakes); production runs warm
  // behind Hyperdrive, so the budget applies to the warm pass.
  await getDashboardSummary(database, {})
  await timed('dashboard summary (warm)', () => getDashboardSummary(database, {}))
  await timed('subscriptions page 1', () => listSubscriptions(database, { page: 1, pageSize: 50 }))
  await timed('subscriptions page 20', () => listSubscriptions(database, { page: 20, pageSize: 50 }))
  await timed('invoices page 1', () => listInvoices(database, { page: 1, pageSize: 50 }))
  await timed('payments page 1', () => listPayments(database, { page: 1, pageSize: 50 }))
  const failed = results.filter(([, ms]) => ms >= 2000)
  if (failed.length > 0) {
    console.error(`OVER BUDGET: ${failed.map(([name]) => name).join(', ')}`)
    process.exit(1)
  }
  console.log('All pages under 2s.')
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
