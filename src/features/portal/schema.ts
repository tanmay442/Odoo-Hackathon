import { z } from 'zod'

export const portalListSchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export type PortalListInput = z.input<typeof portalListSchema>
