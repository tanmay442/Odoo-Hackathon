import { Resend } from 'resend'

import type { EmailMessage, EmailPort, EmailSendResult } from '../../email-port'

export function createResendEmailAdapter(apiKey: string, from: string): EmailPort {
  const client = new Resend(apiKey)
  return {
    async send(message: EmailMessage): Promise<EmailSendResult> {
      const sent = await client.emails.send({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
      if (sent.error) throw new Error(sent.error.message)
      return { providerId: sent.data.id }
    },
  }
}
