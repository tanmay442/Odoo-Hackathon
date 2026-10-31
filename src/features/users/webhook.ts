import type { WebhookEvent } from '@clerk/tanstack-react-start/server'
import { Webhook } from 'svix'

import type { Database } from '../../db/client'

import { applyWebhookDelete, applyWebhookUpdate, ensureUserRecord } from './mutations'

interface HandleOptions {
  database: Database
  headers: Headers
  rawBody: string
  signingSecret: string | undefined
}

function primaryEmail(event: WebhookEvent): string | undefined {
  const data = event.data as unknown as {
    email_addresses?: Array<{ id: string; email_address: string }>
    primary_email_address_id?: string | null
  }
  const match = data.email_addresses?.find(
    (address) => address.id === data.primary_email_address_id,
  )
  return match?.email_address ?? data.email_addresses?.[0]?.email_address
}

function displayNameFor(email: string, firstName?: string | null, lastName?: string | null): string {
  const full = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (full) return full
  return email.split('@')[0] ?? email
}

// Signature is verified before any database write, so a forged delivery
// stores nothing.
export async function handleClerkWebhook(options: HandleOptions): Promise<Response> {
  const { database, headers, rawBody, signingSecret } = options
  if (!signingSecret) return Response.json({ error: 'Webhook not configured' }, { status: 500 })
  try {
    new Webhook(signingSecret).verify(rawBody, {
      'svix-id': headers.get('svix-id') ?? '',
      'svix-timestamp': headers.get('svix-timestamp') ?? '',
      'svix-signature': headers.get('svix-signature') ?? '',
    })
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }
  // This svix version verifies in place; the event parses from the raw body.
  // Anything below throws a generic 500: event payloads and SQL stay out of
  // webhook responses.
  try {
    const event = JSON.parse(rawBody) as WebhookEvent
    if (event.type !== 'user.created' && event.type !== 'user.updated' && event.type !== 'user.deleted') {
      return Response.json({ received: true })
    }
    const clerkUserId = (event.data as unknown as { id?: string }).id
    if (!clerkUserId) return Response.json({ error: 'Missing user id' }, { status: 400 })
    if (event.type === 'user.deleted') {
      await applyWebhookDelete(database, clerkUserId)
      return Response.json({ received: true })
    }
    const email = primaryEmail(event)
    if (!email) return Response.json({ error: 'Missing email' }, { status: 400 })
    if (event.type === 'user.created') {
      const names = event.data as unknown as { first_name?: string | null; last_name?: string | null }
      await ensureUserRecord(database, {
        clerkUserId,
        email,
        displayName: displayNameFor(email, names.first_name, names.last_name),
      })
      return Response.json({ received: true })
    }
    await applyWebhookUpdate(database, { clerkUserId, email })
    return Response.json({ received: true })
  } catch (error) {
    console.error('Clerk webhook handling failed', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
