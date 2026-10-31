import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'

import { getDatabase } from '../../src/db/client'
import { apiIdempotencyKeys } from '../../src/db/schema/api-idempotency'
import { apiKeys } from '../../src/db/schema/api-keys'
import { counters } from '../../src/db/schema/counters'
import { customers } from '../../src/db/schema/customers'
import { emailJobs } from '../../src/db/schema/email-jobs'
import {
  invoiceDiscounts,
  invoiceLineTaxes,
  invoiceLines,
  invoiceTaxes,
  invoices,
} from '../../src/db/schema/invoices'
import { jobRuns } from '../../src/db/schema/job-runs'
import { outboxEvents } from '../../src/db/schema/outbox'
import { paymentEvents, payments } from '../../src/db/schema/payments'
import { plans } from '../../src/db/schema/plans'
import { productVariants, products } from '../../src/db/schema/products'
import { staffInvites } from '../../src/db/schema/staff-invites'
import {
  subscriptionEvents,
  subscriptionLines,
  subscriptionLineTaxes,
  subscriptions,
} from '../../src/db/schema/subscriptions'
import { taxes } from '../../src/db/schema/taxes'
import { users } from '../../src/db/schema/users'
import type { UserRow } from '../../src/db/schema/users'
import { webhookDeliveries, webhookEndpoints } from '../../src/db/schema/webhooks'
import {
  authenticateApiKey,
  idempotencyKeyFor,
} from '../../src/features/api-keys/auth'
import { createApiKey, revokeApiKey } from '../../src/features/api-keys/mutations'
import { handleApiRead, handleApiWrite } from '../../src/features/api/handler'
import { createCustomer } from '../../src/features/customers/mutations'
import { buildNextInvoicePreview } from '../../src/features/discounts/preview'
import { dispatchPendingEmails } from '../../src/features/email/dispatch'
import { queueOverdueReminders, queueExpiringSubscriptions } from '../../src/features/email/scan'
import {
  invoiceOverdueTemplate,
  invoiceSentTemplate,
  paymentRejectedTemplate,
  paymentVerifiedTemplate,
} from '../../src/features/email/templates'
import { confirmInvoice, generatePeriodInvoice, sendInvoice } from '../../src/features/invoices/mutations'
import { decidePayment } from '../../src/features/payments/decide'
import { recordStaffPayment } from '../../src/features/payments/initiate'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { createConsoleEmailAdapter } from '../../src/ports/adapters/email/console-email-adapter'
import type { EmailPort } from '../../src/ports/email-port'
import { dispatchOutboxWithDatabase, hmacSha256Hex } from '../../src/jobs/dispatch-outbox'
import { createWebhookEndpoint, redeliverWebhook } from '../../src/features/webhooks/mutations'
import { Route as CustomersRoute } from '../../src/routes/api/v1/customers'

const database = getDatabase()

async function truncate() {
  await database.delete(webhookDeliveries)
  await database.delete(apiIdempotencyKeys)
  await database.delete(emailJobs)
  await database.delete(paymentEvents)
  await database.delete(payments)
  await database.delete(invoiceDiscounts)
  await database.delete(invoiceLineTaxes)
  await database.delete(invoiceTaxes)
  await database.delete(invoiceLines)
  await database.delete(invoices)
  await database.delete(outboxEvents)
  await database.delete(jobRuns)
  await database.delete(webhookEndpoints)
  await database.delete(apiKeys)
  await database.delete(subscriptionEvents)
  await database.delete(subscriptionLineTaxes)
  await database.delete(subscriptionLines)
  await database.delete(subscriptions)
  await database.delete(productVariants)
  await database.delete(plans)
  await database.delete(products)
  await database.delete(taxes)
  await database.delete(users)
  await database.delete(staffInvites)
  await database.delete(customers)
  for (const name of ['subscription', 'invoice']) {
    await database
      .insert(counters)
      .values({ name, value: 0 })
      .onConflictDoNothing({ target: counters.name })
    await database.update(counters).set({ value: 0 }).where(eq(counters.name, name))
  }
}

async function actorWithRole(clerkUserId: string, email: string, role: UserRow['role']) {
  const user = await ensureUserRecord(database, { clerkUserId, email, displayName: email })
  await database.update(users).set({ role }).where(eq(users.id, user.id))
  const reloaded = await ensureUserRecord(database, { clerkUserId, email, displayName: email })
  if (reloaded.role !== role) throw new Error('Role setup failed')
  return reloaded
}

let admin: UserRow
let staff: UserRow

beforeAll(async () => {
  await truncate()
})

beforeEach(async () => {
  await truncate()
  admin = await actorWithRole('user_api_admin', 'api-admin@example.com', 'admin')
  staff = await actorWithRole('user_api_staff', 'api-staff@example.com', 'staff')
})

afterAll(async () => {
  await truncate()
})

interface RouteHandlerContext {
  request: Request
  params?: Record<string, string>
}

interface ApiRouteHandlers {
  GET?: (context: RouteHandlerContext) => Promise<Response>
  POST?: (context: RouteHandlerContext) => Promise<Response>
  PATCH?: (context: RouteHandlerContext) => Promise<Response>
}

function routeHandlers(route: object): ApiRouteHandlers {
  const server = (route as { options?: { server?: { handlers?: ApiRouteHandlers } } }).options?.server
  if (!server?.handlers) throw new Error('Route has no server handlers')
  return server.handlers
}

function postHandler(route: object) {
  const post = routeHandlers(route).POST
  if (!post) throw new Error('Route has no POST handler')
  return post
}

function getHandler(route: object) {
  const get = routeHandlers(route).GET
  if (!get) throw new Error('Route has no GET handler')
  return get
}

function apiRequest(path: string, key: string | null, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...init?.headers,
    },
  })
}

async function seedBasics() {
  const product = await createProduct(database, admin, {
    name: 'Suite',
    type: 'software',
    salesPriceMinor: 100000,
    costPriceMinor: 40000,
    currency: 'INR',
    notes: null,
  })
  const [plan] = await database
    .insert(plans)
    .values({
      name: 'Monthly',
      productId: null,
      priceMinor: 500000,
      currency: 'INR',
      billingInterval: 'monthly',
      intervalCount: 1,
      minQuantity: 1,
      autoCloseAtEnd: false,
      allowEarlyClose: true,
      allowPause: true,
      allowRenew: true,
    })
    .returning()
  const customer = await createCustomer(database, staff, {
    displayName: 'Acme',
    email: `acme-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
    phone: null,
    billingAddress: null,
    taxIdentifier: null,
    notes: null,
  })
  return { product, plan, customer }
}

async function seedActiveSubscription(customerId: string, planId: string, productId: string) {
  const created = await createSubscription(database, staff, {
    customerId,
    planId,
    startDate: '2026-01-01',
    paymentTerms: null,
    sourceTemplateId: null,
    lines: [
      {
        productId,
        variantId: null,
        description: '',
        quantity: 2,
        unitPriceMinor: 50000,
        taxIds: [],
      },
    ],
  })
  await transitionSubscription(database, staff, created.id, 'quotation')
  await transitionSubscription(database, staff, created.id, 'confirmed')
  return transitionSubscription(database, staff, created.id, 'active')
}

const failingPort: EmailPort = {
  send: async () => {
    throw new Error('smtp down')
  },
}

describe('api keys', () => {
  it('revoked keys fail closed and wrong scopes are refused', async () => {
    const { plainKey } = await createApiKey(database, admin, { name: 'sync', scopes: ['read'] })
    expect(plainKey.startsWith('destr_live_')).toBe(true)
    const readable = await authenticateApiKey(database, apiRequest('/api/v1/customers', plainKey), 'read')
    expect('key' in readable).toBe(true)
    const writable = await authenticateApiKey(database, apiRequest('/api/v1/customers', plainKey), 'write')
    expect(writable).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    const [stored] = await database.query.apiKeys.findMany()
    expect(stored.keyHash).not.toContain('destr_live_')
    await revokeApiKey(database, admin, stored.id)
    const revoked = await authenticateApiKey(database, apiRequest('/api/v1/customers', plainKey), 'read')
    expect(revoked).toMatchObject({ status: 401 })
    const missing = await authenticateApiKey(database, apiRequest('/api/v1/customers', null), 'read')
    expect(missing).toMatchObject({ status: 401 })
  })

  it('route handlers enforce key auth with the shared error shape', async () => {
    const { plainKey } = await createApiKey(database, admin, { name: 'reader', scopes: ['read'] })
    const post = postHandler(CustomersRoute)
    const get = getHandler(CustomersRoute)
    const denied = await post({ request: apiRequest('/api/v1/customers', plainKey, { method: 'POST' }) })
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({
      error: { code: 'FORBIDDEN', message: 'API key lacks the required scope' },
    })
    const anonymous = await get({ request: apiRequest('/api/v1/customers', null) })
    expect(anonymous.status).toBe(401)
    const missing: unknown = await anonymous.json()
    expect((missing as { error: { code: string } }).error.code).toBe('UNAUTHORIZED')
  })

  it('repeating an Idempotency-Key returns the original response without a second record', async () => {
    const { plainKey } = await createApiKey(database, admin, { name: 'writer', scopes: ['write'] })
    const headers = { authorization: `Bearer ${plainKey}`, 'idempotency-key': 'key-123' }
    const payload = JSON.stringify({
      displayName: 'Idem Co',
      email: `idem-${Date.now()}@example.com`,
      phone: null,
      billingAddress: null,
      taxIdentifier: null,
      notes: null,
    })
    const post = postHandler(CustomersRoute)
    const first = await post({
      request: new Request('http://localhost/api/v1/customers', { method: 'POST', headers, body: payload }),
    })
    const second = await post({
      request: new Request('http://localhost/api/v1/customers', { method: 'POST', headers, body: payload }),
    })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(await second.json()).toEqual(await first.json())
    const rows = await database.query.customers.findMany()
    expect(rows.filter((row) => row.displayName === 'Idem Co')).toHaveLength(1)
    expect(idempotencyKeyFor(apiRequest('/x', null, { headers: { 'idempotency-key': 'key-123' } }))).toBe('key-123')
  })

  it('handleApiWrite replays stored responses for the same key', async () => {
    const { plainKey } = await createApiKey(database, admin, { name: 'replay', scopes: ['write'] })
    const headers = { authorization: `Bearer ${plainKey}`, 'idempotency-key': 'replay-1' }
    const run = () =>
      handleApiWrite(apiRequest('/api/v1/customers', null, { method: 'POST', headers }), 'write', async (db, actor) =>
        createCustomer(db, actor, {
          displayName: 'Replay',
          email: `replay-${Date.now()}@example.com`,
          phone: null,
          billingAddress: null,
          taxIdentifier: null,
          notes: null,
        }).then((row) => ({ body: { data: row }, status: 201 })),
      )
    const first = await run()
    const second = await run()
    expect(first.status).toBe(201)
    expect(await second.json()).toEqual(await first.json())
    const stored = await database.query.customers.findMany()
    expect(stored.filter((row) => row.displayName === 'Replay')).toHaveLength(1)
  })

  it('reads list through the shared handler with the read scope', async () => {
    const { plainKey } = await createApiKey(database, admin, { name: 'lister', scopes: ['read'] })
    await createCustomer(database, staff, {
      displayName: 'Listed',
      email: `listed-${Date.now()}@example.com`,
      phone: null,
      billingAddress: null,
      taxIdentifier: null,
      notes: null,
    })
    const response = await handleApiRead(apiRequest('/api/v1/customers', plainKey), 'read', async (db) =>
      db.query.customers.findMany(),
    )
    expect(response.status).toBe(200)
    const listed: unknown = await response.json()
    const rows = (listed as { data: Array<{ displayName: string }> }).data
    expect(rows.some((row) => row.displayName === 'Listed')).toBe(true)
  })
})

describe('outbound webhooks', () => {
  it('signs deliveries, retries to dead, and redelivers on demand', async () => {
    const { product, plan, customer } = await seedBasics()
    const subscription = await seedActiveSubscription(customer.id, plan.id, product.id)
    await transitionSubscription(database, staff, subscription.id, 'paused')
    const created = await createWebhookEndpoint(database, admin, {
      url: 'https://example.com/destr-hook',
      eventTypes: ['subscription.paused'],
    })
    const captured: Array<{ url: string; body: string; signature: string }> = []
    const workingFetch = async (url: string, init: RequestInit): Promise<Response> => {
      const headers = new Headers(init.headers)
      captured.push({ url, body: init.body as string, signature: headers.get('destr-signature') ?? '' })
      return new Response('ok', { status: 200 })
    }
    const failingFetch = async (): Promise<Response> => {
      throw new Error('receiver down')
    }
    const start = new Date()
    const steps = [0, 1, 3, 7, 15]
    for (const [index, minutes] of steps.entries()) {
      const summary = await dispatchOutboxWithDatabase(database, {
        now: new Date(start.getTime() + minutes * 60_000),
        fetchImpl: failingFetch,
      })
      if (index === 0) expect(summary.events).toBeGreaterThan(0)
    }
    const deliveries = await database.query.webhookDeliveries.findMany()
    const paused = deliveries.filter((row) => row.status === 'dead')
    expect(paused.length).toBeGreaterThan(0)
    const events = await database.query.outboxEvents.findMany()
    expect(events.some((event) => event.status === 'dead')).toBe(true)
    await redeliverWebhook(database, admin, paused[0].id)
    await dispatchOutboxWithDatabase(database, {
      now: new Date(start.getTime() + 60 * 60_000),
      fetchImpl: workingFetch as typeof fetch,
    })
    expect(captured.length).toBeGreaterThan(0)
    const body = JSON.parse(captured[0].body) as { id: string; type: string }
    expect(body.type).toBe('subscription.paused')
    const expected = await hmacSha256Hex(created.plainSecret, captured[0].body)
    expect(captured[0].signature).toBe(expected)
    const reloaded = await database.query.webhookDeliveries.findMany()
    expect(reloaded.some((row) => row.status === 'delivered')).toBe(true)
  })
})

describe('transactional outbox', () => {
  it('writes the event in the same transaction and failed writes leave nothing', async () => {
    const { product, plan, customer } = await seedBasics()
    const subscription = await seedActiveSubscription(customer.id, plan.id, product.id)
    const outcome = await generatePeriodInvoice(database, subscription.id, new Date('2026-02-15T00:00:00Z'))
    expect(outcome.outcome).toBe('invoiced')
    if (outcome.outcome !== 'invoiced') throw new Error('Invoice setup failed')
    const invoice = await database.query.invoices.findFirst({
      where: eq(invoices.id, outcome.invoiceId),
    })
    if (!invoice) throw new Error('Invoice setup failed')
    await confirmInvoice(database, staff, invoice.id)
    const before = await database.query.outboxEvents.findMany()
    await recordStaffPayment(database, staff, {
      invoiceId: invoice.id,
      method: 'bank_transfer',
      amountMinor: invoice.totalMinor,
      currency: 'INR',
      paidOn: '2026-02-16',
      note: '',
    })
    const after = await database.query.outboxEvents.findMany()
    expect(after.length).toBeGreaterThan(before.length)
    const verified = after.filter((event) => event.type === 'payment.verified')
    expect(verified.length).toBe(1)
    expect(verified[0].payload).toMatchObject({ invoiceId: invoice.id })
    const settled = await database.query.invoices.findFirst({ where: eq(invoices.id, invoice.id) })
    expect(settled?.status).toBe('paid')
    const storedPayments = await database.query.payments.findMany()
    await expect(
      decidePayment(database, staff, storedPayments[0].id, { approved: true, reason: '' }),
    ).rejects.toThrow()
    const count = await database.query.outboxEvents.findMany()
    expect(count).toHaveLength(after.length)
  })
})

describe('api and ui totals', () => {
  it('produce identical totals for the same subscription through shared pricing', async () => {
    const { product, plan, customer } = await seedBasics()
    const lines = [
      {
        productId: product.id,
        variantId: null,
        description: '',
        quantity: 2,
        unitPriceMinor: 50000,
        taxIds: [],
      },
    ]
    const uiSubscription = await createSubscription(database, staff, {
      customerId: customer.id,
      planId: plan.id,
      startDate: '2026-01-01',
      paymentTerms: null,
      sourceTemplateId: null,
      lines,
    })
    const uiPreview = await buildNextInvoicePreview(database, uiSubscription.id, new Date('2026-01-01T00:00:00Z'))
    const { plainKey } = await createApiKey(database, admin, { name: 'billing-sync', scopes: ['write'] })
    const response = await handleApiWrite(
      apiRequest('/api/v1/subscriptions', plainKey, { method: 'POST' }),
      'write',
      async (db, actor) =>
        createSubscription(db, actor, {
          customerId: customer.id,
          planId: plan.id,
          startDate: '2026-01-01',
          paymentTerms: null,
          sourceTemplateId: null,
          lines,
        }).then((row) => ({ body: { data: row }, status: 201 })),
    )
    expect(response.status).toBe(201)
    const created: unknown = await response.json()
    const apiSubscription = (created as { data: { id: string } }).data
    const apiPreview = await buildNextInvoicePreview(database, apiSubscription.id, new Date('2026-01-01T00:00:00Z'))
    expect(apiPreview.totalMinor).toBe(uiPreview.totalMinor)
    await transitionSubscription(database, staff, uiSubscription.id, 'quotation')
    await transitionSubscription(database, staff, uiSubscription.id, 'confirmed')
    await transitionSubscription(database, staff, uiSubscription.id, 'active')
    const invoiced = await generatePeriodInvoice(database, uiSubscription.id, new Date('2026-02-15T00:00:00Z'))
    expect(invoiced.outcome).toBe('invoiced')
    if (invoiced.outcome !== 'invoiced') throw new Error('Billing setup failed')
    const stored = await database.query.invoices.findFirst({ where: eq(invoices.id, invoiced.invoiceId) })
    expect(stored?.totalMinor).toBe(uiPreview.totalMinor)
  })
})

describe('email', () => {
  it('uses the console adapter in dev and renders every template', async () => {
    const adapter = createConsoleEmailAdapter()
    const result = await adapter.send({
      to: 'buyer@example.com',
      subject: 'hello',
      html: '<p>hello</p>',
      text: 'hello',
    })
    expect(result.providerId?.startsWith('console-')).toBe(true)
    const templates = [
      invoiceSentTemplate({
        invoiceNumber: 'INV-000001',
        customerName: 'Acme',
        totalMinor: 118000,
        currency: 'INR',
        dueDate: '2026-02-01',
        portalUrl: 'http://localhost:3000/portal/invoices/x',
      }),
      paymentVerifiedTemplate({
        invoiceNumber: 'INV-000001',
        amountMinor: 118000,
        currency: 'INR',
        balanceMinor: 0,
      }),
      paymentRejectedTemplate({
        invoiceNumber: 'INV-000001',
        amountMinor: 118000,
        currency: 'INR',
        reason: 'Wrong reference',
      }),
      invoiceOverdueTemplate({
        invoiceNumber: 'INV-000001',
        balanceMinor: 118000,
        currency: 'INR',
        dueDate: '2026-02-01',
        portalUrl: 'http://localhost:3000/portal/invoices/x',
      }),
    ]
    for (const template of templates) {
      expect(template.subject.length).toBeGreaterThan(0)
      expect(template.html).toContain('INV-000001')
      expect(template.text).toContain('INV-000001')
    }
  })

  it('failed sends leave the business action successful with a retryable job', async () => {
    const { product, plan, customer } = await seedBasics()
    const subscription = await seedActiveSubscription(customer.id, plan.id, product.id)
    const outcome = await generatePeriodInvoice(database, subscription.id, new Date('2026-02-15T00:00:00Z'))
    expect(outcome.outcome).toBe('invoiced')
    if (outcome.outcome !== 'invoiced') throw new Error('Billing setup failed')
    await confirmInvoice(database, staff, outcome.invoiceId)
    const sent = await sendInvoice(database, staff, outcome.invoiceId, failingPort)
    expect(sent.email.status).toBe('queued')
    const reloaded = await database.query.invoices.findFirst({ where: eq(invoices.id, outcome.invoiceId) })
    expect(reloaded?.status).toBe('confirmed')
    const jobs = await database.query.emailJobs.findMany()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].status).toBe('queued')
    expect(jobs[0].template).toBe('invoice_sent')
    const dispatched = await dispatchPendingEmails(database, createConsoleEmailAdapter())
    expect(dispatched).toEqual({ attempted: 1, sent: 1 })
    const flushed = await database.query.emailJobs.findMany()
    expect(flushed[0].status).toBe('sent')
  })

  it('sends at most one overdue reminder per invoice per week', async () => {
    const { product, plan, customer } = await seedBasics()
    const subscription = await seedActiveSubscription(customer.id, plan.id, product.id)
    const outcome = await generatePeriodInvoice(database, subscription.id)
    expect(outcome.outcome).toBe('invoiced')
    if (outcome.outcome !== 'invoiced') throw new Error('Billing setup failed')
    await confirmInvoice(database, staff, outcome.invoiceId)
    const now = new Date()
    const first = await queueOverdueReminders(database, now)
    expect(first.queued).toBe(1)
    const second = await queueOverdueReminders(database, new Date(now.getTime() + 24 * 3_600_000))
    expect(second.queued).toBe(0)
    const later = await queueOverdueReminders(database, new Date(now.getTime() + 8 * 86_400_000))
    expect(later.queued).toBe(1)
  })

  it('reminds expiring subscriptions once per week', async () => {
    const { product, plan, customer } = await seedBasics()
    const created = await createSubscription(database, staff, {
      customerId: customer.id,
      planId: plan.id,
      startDate: '2026-01-01',
      paymentTerms: null,
      sourceTemplateId: null,
      lines: [
        { productId: product.id, variantId: null, description: '', quantity: 1, unitPriceMinor: 50000, taxIds: [] },
      ],
    })
    await transitionSubscription(database, staff, created.id, 'quotation')
    await transitionSubscription(database, staff, created.id, 'confirmed')
    const active = await transitionSubscription(database, staff, created.id, 'active')
    const now = new Date(active.expiryDate.getTime() - 3 * 86_400_000)
    const first = await queueExpiringSubscriptions(database, now)
    expect(first.queued).toBe(1)
    const second = await queueExpiringSubscriptions(database, now)
    expect(second.queued).toBe(0)
  })
})
