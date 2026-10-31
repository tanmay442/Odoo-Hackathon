export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface EmailSendResult {
  providerId: string | null
}

export interface EmailPort {
  send: (message: EmailMessage) => Promise<EmailSendResult>
}
