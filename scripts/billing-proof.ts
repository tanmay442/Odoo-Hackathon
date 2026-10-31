// Live billing proof at scale: drains every due subscription, then proves
// a re-run invoices nothing (idempotent, zero duplicates).
import { getDatabase } from '../src/db/client'
import { runBillingJobWithDatabase } from '../src/jobs/run-billing'

const database = getDatabase(process.env.DATABASE_URL)

async function main(): Promise<void> {
  let totalInvoiced = 0
  let totalClosed = 0
  for (let run = 1; run <= 10; run += 1) {
    const summary = await runBillingJobWithDatabase(database, new Date())
    totalInvoiced += summary.invoiced
    totalClosed += summary.closed
    console.log(`run ${run}: invoiced=${summary.invoiced} skipped=${summary.skippedAlreadyBilled} closed=${summary.closed} errors=${summary.errors.length}`)
    if (summary.errors.length > 0) {
      console.error(summary.errors.slice(0, 3))
      process.exit(1)
    }
    if (summary.invoiced === 0) break
  }
  const rerun = await runBillingJobWithDatabase(database, new Date())
  console.log(`re-run: invoiced=${rerun.invoiced} skipped=${rerun.skippedAlreadyBilled} errors=${rerun.errors.length}`)
  if (rerun.invoiced !== 0 || rerun.errors.length > 0) {
    console.error('Re-run invoiced rows: duplicates suspected.')
    process.exit(1)
  }
  console.log(`Billing proof done: ${totalInvoiced} invoices, ${totalClosed} closed, re-run clean.`)
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
