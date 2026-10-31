import { createFileRoute } from '@tanstack/react-router'

import { getDatabase } from '#/db/client'
import { handleClerkWebhook } from '#/features/users/webhook'

export const Route = createFileRoute('/api/webhooks/clerk')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        handleClerkWebhook({
          database: getDatabase(),
          headers: request.headers,
          rawBody: await request.text(),
          signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
        }),
    },
  },
})
