import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const billingIntervalSchema = z.enum(['daily', 'weekly', 'monthly', 'yearly'])

export const planSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    productId: z.uuid().nullish(),
    priceMinor: z.number().int().min(0),
    currency: z.string().trim().min(1).max(10).default('INR'),
    billingInterval: billingIntervalSchema,
    intervalCount: z.number().int().min(1),
    minQuantity: z.number().int().min(1),
    availableFrom: isoDate.nullish(),
    availableTo: isoDate.nullish(),
    autoCloseAtEnd: z.boolean(),
    allowEarlyClose: z.boolean(),
    allowPause: z.boolean(),
    allowRenew: z.boolean(),
  })
  .superRefine((plan, issue) => {
    if (plan.availableFrom && plan.availableTo && plan.availableFrom > plan.availableTo) {
      issue.addIssue({
        code: 'custom',
        path: ['availableTo'],
        message: 'Availability ends before it starts',
      })
    }
  })

export const updatePlanSchema = planSchema.extend({ id: z.uuid() })

export type PlanInput = z.input<typeof planSchema>
export type UpdatePlanInput = z.input<typeof updatePlanSchema>
