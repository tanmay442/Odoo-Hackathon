import { z } from 'zod'

export const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(100),
  salesPriceMinor: z.number().int().min(0),
  costPriceMinor: z.number().int().min(0),
  currency: z.string().trim().min(1).max(10).default('INR'),
  notes: z.string().trim().max(2000).nullish(),
})

export const updateProductSchema = productSchema.extend({ id: z.uuid() })

export const variantSchema = z.object({
  productId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  priceDeltaMinor: z.number().int(),
})

export const updateVariantSchema = variantSchema.omit({ productId: true }).extend({ id: z.uuid() })

export type ProductInput = z.input<typeof productSchema>
export type UpdateProductInput = z.input<typeof updateProductSchema>
export type VariantInput = z.input<typeof variantSchema>
export type UpdateVariantInput = z.input<typeof updateVariantSchema>
