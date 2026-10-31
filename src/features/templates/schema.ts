import { z } from 'zod'

export const templateLineSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().nullish(),
  quantity: z.number().int().min(1),
  unitPriceMinor: z.number().int().min(0),
  taxIds: z.array(z.uuid()).default([]),
})

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  planId: z.uuid(),
  validityDays: z.number().int().min(1).max(3650),
  isActive: z.boolean(),
  lines: z.array(templateLineSchema).min(1),
})

export const updateTemplateSchema = templateSchema.extend({ id: z.uuid() })

export type TemplateLineInput = z.input<typeof templateLineSchema>
export type TemplateInput = z.input<typeof templateSchema>
export type UpdateTemplateInput = z.input<typeof updateTemplateSchema>
