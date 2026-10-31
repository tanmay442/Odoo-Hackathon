import { z } from 'zod'

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const discountKindSchema = z.enum(['fixed', 'percentage'])
export const discountScopeSchema = z.enum(['product', 'subscription'])

export const discountSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    kind: discountKindSchema,
    valueMinorOrBasisPoints: z.number().int().min(0),
    scope: discountScopeSchema,
    productIds: z.array(z.uuid()).default([]),
    minPurchaseMinor: z.number().int().min(0).nullish(),
    minQuantity: z.number().int().min(1).nullish(),
    startsAt: isoDay.nullish(),
    endsAt: isoDay.nullish(),
    maxRedemptions: z.number().int().min(1).nullish(),
    isActive: z.boolean(),
  })
  .superRefine((discount, issue) => {
    if (discount.kind === 'percentage' && discount.valueMinorOrBasisPoints > 10000) {
      issue.addIssue({
        code: 'custom',
        path: ['valueMinorOrBasisPoints'],
        message: 'Percentage cannot exceed 10000 basis points (100%)',
      })
    }
    if (discount.scope === 'product' && discount.productIds.length === 0) {
      issue.addIssue({
        code: 'custom',
        path: ['productIds'],
        message: 'Product discounts need at least one product',
      })
    }
    if (discount.startsAt && discount.endsAt && discount.startsAt > discount.endsAt) {
      issue.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'Discount ends before it starts',
      })
    }
  })

export const updateDiscountSchema = discountSchema.extend({ id: z.uuid() })

export const discountAttachSchema = z.object({
  subscriptionId: z.uuid(),
  discountId: z.uuid(),
})

export type DiscountInput = z.input<typeof discountSchema>
export type UpdateDiscountInput = z.input<typeof updateDiscountSchema>
export type DiscountAttachInput = z.input<typeof discountAttachSchema>
export type DiscountKindInput = z.input<typeof discountKindSchema>
export type DiscountScopeInput = z.input<typeof discountScopeSchema>
