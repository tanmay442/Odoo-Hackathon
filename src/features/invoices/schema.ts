import { z } from 'zod'

import type { InvoiceStatus } from '../../db/schema/invoices'

export const invoiceStatuses: InvoiceStatus[] = ['draft', 'confirmed', 'paid', 'cancelled']

export const invoiceStatusSchema = z.enum(invoiceStatuses)

export const invoiceListSchema = z.object({
  status: invoiceStatusSchema.optional(),
  customerId: z.uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  overdueOnly: z.boolean().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export const invoiceCancelSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1).max(2000),
})

export type InvoiceListInput = z.input<typeof invoiceListSchema>
export type InvoiceCancelInput = z.input<typeof invoiceCancelSchema>
