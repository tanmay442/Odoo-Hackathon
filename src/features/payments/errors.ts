export class PaymentError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 422) {
    super(message)
    this.name = 'PaymentError'
    this.code = code
    this.status = status
  }
}
