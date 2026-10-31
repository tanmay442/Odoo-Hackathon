import { z } from 'zod'

import { webhookEventTypes } from '../../db/schema/webhooks'

export const webhookEventSchema = z.enum(webhookEventTypes)

export const webhookCreateSchema = z.object({
  url: z.url({ message: 'Use an http(s) URL' }),
  eventTypes: z.array(webhookEventSchema).min(1),
})

export const webhookToggleSchema = z.object({
  id: z.uuid(),
  isActive: z.boolean(),
})

export const webhookDeleteSchema = z.object({ id: z.uuid() })

export const webhookRedeliverSchema = z.object({ deliveryId: z.uuid() })

export type WebhookCreateInput = z.input<typeof webhookCreateSchema>
