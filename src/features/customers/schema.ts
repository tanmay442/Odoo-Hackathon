import { z } from 'zod'

export const customerSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(50).nullish(),
  billingAddress: z.string().trim().max(2000).nullish(),
  taxIdentifier: z.string().trim().max(100).nullish(),
  notes: z.string().trim().max(2000).nullish(),
})

export const updateCustomerSchema = customerSchema.extend({ id: z.uuid() })

export type CustomerInput = z.input<typeof customerSchema>
export type UpdateCustomerInput = z.input<typeof updateCustomerSchema>
