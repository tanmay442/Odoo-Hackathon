import { z } from 'zod'

export const userRoleSchema = z.enum(['admin', 'staff', 'customer'])

export const staffInviteSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
})

export const updateUserRoleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(['admin', 'staff', 'customer']),
})

export type StaffInviteInput = z.input<typeof staffInviteSchema>
export type UpdateUserRoleInput = z.input<typeof updateUserRoleSchema>
