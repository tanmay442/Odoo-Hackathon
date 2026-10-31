import { z } from 'zod'

import { apiKeyScopes } from '../../db/schema/api-keys'

export const apiKeyScopeSchema = z.enum(apiKeyScopes)

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  scopes: z.array(apiKeyScopeSchema).min(1),
})

export type ApiKeyCreateInput = z.input<typeof apiKeyCreateSchema>
