import type { EmailMessage, EmailPort, EmailSendResult } from '../../email-port'

export function createConsoleEmailAdapter(): EmailPort {
  return {
    async send(message: EmailMessage): Promise<EmailSendResult> {
      const providerId = `console-${Date.now()}`
      console.info(
        JSON.stringify({
          event: 'email.send',
          provider: 'console',
          to: message.to,
          subject: message.subject,
          providerId,
        }),
      )
      return { providerId }
    },
  }
}
