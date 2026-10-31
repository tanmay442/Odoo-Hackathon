import type { Database } from '../../db/client'
import { emailJobs } from '../../db/schema/email-jobs'
import type { EmailPort } from '../../ports/email-port'
import { createConsoleEmailAdapter } from '../../ports/adapters/email/console-email-adapter'
import { createResendEmailAdapter } from '../../ports/adapters/email/resend-email-adapter'

import type { EmailTemplate } from './templates'

export type EmailJobTemplate =
  | 'invoice_sent'
  | 'payment_verified'
  | 'payment_rejected'
  | 'invoice_overdue'
  | 'subscription_expiring'

export function resolveEmailPort(override?: EmailPort): EmailPort {
  if (override) return override
  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    const from = process.env.EMAIL_FROM ?? 'Destr <billing@example.com>'
    return createResendEmailAdapter(apiKey, from)
  }
  return createConsoleEmailAdapter()
}

export async function deliverEmail(
  database: Database,
  input: {
    template: EmailJobTemplate
    recipient: string
    payload: Record<string, string | number | null>
    message: EmailTemplate
  },
  port?: EmailPort,
) {
  const sender = resolveEmailPort(port)
  try {
    const result = await sender.send({
      to: input.recipient,
      subject: input.message.subject,
      html: input.message.html,
      text: input.message.text,
    })
    const inserted = await database
      .insert(emailJobs)
      .values({
        template: input.template,
        recipient: input.recipient,
        payload: input.payload,
        status: 'sent',
        providerId: result.providerId,
      })
      .returning({ id: emailJobs.id })
    return { status: 'sent' as const, jobId: inserted[0]?.id ?? null }
  } catch (error) {
    const inserted = await database
      .insert(emailJobs)
      .values({
        template: input.template,
        recipient: input.recipient,
        payload: input.payload,
        status: 'queued',
        lastError: error instanceof Error ? error.message : 'Email send failed',
      })
      .returning({ id: emailJobs.id })
    return { status: 'queued' as const, jobId: inserted[0]?.id ?? null }
  }
}
