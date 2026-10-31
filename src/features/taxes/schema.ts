import { z } from 'zod'

export const taxSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rateBasisPoints: z.number().int().min(0).max(10000),
  isActive: z.boolean(),
})

export const updateTaxSchema = taxSchema.extend({ id: z.uuid() })

export type TaxInput = z.input<typeof taxSchema>
export type UpdateTaxInput = z.input<typeof updateTaxSchema>
