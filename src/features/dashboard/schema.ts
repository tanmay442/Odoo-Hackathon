import { z } from 'zod'

import { subscriptionStatus } from '../../db/schema/subscriptions'

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const dashboardStatusFilter = z.enum(subscriptionStatus.enumValues)

export const dashboardFilterSchema = z
  .object({
    from: isoDay.optional(),
    to: isoDay.optional(),
    planId: z.uuid().optional(),
    status: dashboardStatusFilter.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'From date must be on or before to date.',
    path: ['from'],
  })

export const dashboardOverdueSchema = dashboardFilterSchema.extend({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export const dashboardChaseSchema = z.object({
  invoiceId: z.uuid(),
})

export type DashboardFilterInput = z.input<typeof dashboardFilterSchema>
export type DashboardOverdueInput = z.input<typeof dashboardOverdueSchema>
export type DashboardChaseInput = z.input<typeof dashboardChaseSchema>
