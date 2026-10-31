import { createFileRoute } from '@tanstack/react-router'

import { getDatabase } from '#/db/client'
import { dispatchOutboxWithDatabase } from '#/jobs/dispatch-outbox'
import { runBillingJobWithDatabase } from '#/jobs/run-billing'

function unauthorized() {
  return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid job secret' } }, { status: 401 })
}

export function providedSecret(request: Request): string | null {
  const direct = request.headers.get('x-job-secret') ?? request.headers.get('job-secret')
  if (direct) return direct
  const authorization = request.headers.get('authorization')
  if (authorization?.toLowerCase().startsWith('bearer ')) return authorization.slice(7)
  return null
}

export async function handleRunBilling(request: Request) {
  const expected = process.env.JOB_SECRET
  const provided = providedSecret(request)
  if (!expected || !provided || provided !== expected) return unauthorized()
  const database = getDatabase()
  const summary = await runBillingJobWithDatabase(database, new Date())
  await dispatchOutboxWithDatabase(database)
  return Response.json({ data: summary })
}

export const Route = createFileRoute('/api/jobs/run-billing')({
  server: {
    handlers: {
      POST: async ({ request }) => handleRunBilling(request),
    },
  },
})
