import { z } from 'zod'

import type { SubscriptionStatus } from '../../db/schema/subscriptions'

export const subscriptionStatuses: SubscriptionStatus[] = [
  'draft',
  'quotation',
  'confirmed',
  'active',
  'paused',
  'closed',
]

export const subscriptionStatusSchema = z.enum(subscriptionStatuses)

export const subscriptionLineSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().nullish(),
  description: z.string().trim().max(500).default(''),
  quantity: z.number().int().min(1),
  unitPriceMinor: z.number().int().min(0),
  taxIds: z.array(z.uuid()).default([]),
})

export const subscriptionCreateSchema = z.object({
  customerId: z.uuid(),
  planId: z.uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  paymentTerms: z.string().trim().max(2000).nullish(),
  sourceTemplateId: z.uuid().nullish(),
  lines: z.array(subscriptionLineSchema).min(1),
})

export const subscriptionLinesUpdateSchema = z.object({
  id: z.uuid(),
  lines: z.array(subscriptionLineSchema).min(1),
})

export const subscriptionTransitionSchema = z.object({
  id: z.uuid(),
  to: subscriptionStatusSchema,
})

export type SubscriptionLineInput = z.input<typeof subscriptionLineSchema>
export type SubscriptionCreateInput = z.input<typeof subscriptionCreateSchema>
export type SubscriptionLinesUpdateInput = z.input<typeof subscriptionLinesUpdateSchema>
export type SubscriptionTransitionInput = z.input<typeof subscriptionTransitionSchema>
