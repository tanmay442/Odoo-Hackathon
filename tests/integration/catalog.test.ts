import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDatabase } from '../../src/db/client'
import { customers } from '../../src/db/schema/customers'
import {
  discountProducts,
  discounts,
  subscriptionDiscounts,
} from '../../src/db/schema/discounts'
import {
  invoiceDiscounts,
  invoiceLineTaxes,
  invoiceLines,
  invoiceTaxes,
  invoices,
} from '../../src/db/schema/invoices'
import { paymentEvents, payments } from '../../src/db/schema/payments'
import { jobRuns } from '../../src/db/schema/job-runs'
import { outboxEvents } from '../../src/db/schema/outbox'
import { plans } from '../../src/db/schema/plans'
import { productVariants, products } from '../../src/db/schema/products'
import { staffInvites } from '../../src/db/schema/staff-invites'
import {
  subscriptionEvents,
  subscriptionLines,
  subscriptionLineTaxes,
  subscriptions,
} from '../../src/db/schema/subscriptions'
import {
  quotationTemplateLineTaxes,
  quotationTemplateLines,
  quotationTemplates,
} from '../../src/db/schema/templates'
import { taxes } from '../../src/db/schema/taxes'
import { users } from '../../src/db/schema/users'
import type { UserRow } from '../../src/db/schema/users'
import { effectiveVariantPrice } from '../../src/domain/money'
import {
  assertPlanAvailableForNewSubscription,
  PlanUnavailableError,
} from '../../src/features/plans/availability'
import {
  createPlan,
  deletePlan,
  updatePlan,
} from '../../src/features/plans/mutations'
import { getPlan } from '../../src/features/plans/queries'
import {
  createProduct,
  createVariant,
  deleteProduct,
  deleteVariant,
  restoreProduct,
  updateProduct,
} from '../../src/features/products/mutations'
import { getProduct } from '../../src/features/products/queries'
import {
  createTax,
  deleteTax,
  updateTax,
} from '../../src/features/taxes/mutations'
import { getTax } from '../../src/features/taxes/queries'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { ForbiddenError } from '../../src/lib/auth'

const database = getDatabase()

async function truncate() {
  await database.delete(paymentEvents)
  await database.delete(payments)
  await database.delete(invoiceDiscounts)
  await database.delete(invoiceLineTaxes)
  await database.delete(invoiceTaxes)
  await database.delete(invoiceLines)
  await database.delete(invoices)
  await database.delete(outboxEvents)
  await database.delete(jobRuns)
  await database.delete(subscriptionDiscounts)
  await database.delete(subscriptionEvents)
  await database.delete(subscriptionLineTaxes)
  await database.delete(subscriptionLines)
  await database.delete(subscriptions)
  await database.delete(discountProducts)
  await database.delete(discounts)
  await database.delete(quotationTemplateLineTaxes)
  await database.delete(quotationTemplateLines)
  await database.delete(quotationTemplates)
  await database.delete(productVariants)
  await database.delete(plans)
  await database.delete(products)
  await database.delete(taxes)
  await database.delete(users)
  await database.delete(staffInvites)
  await database.delete(customers)
}

async function actorWithRole(
  clerkUserId: string,
  email: string,
  role: UserRow['role'],
) {
  const user = await ensureUserRecord(database, {
    clerkUserId,
    email,
    displayName: email,
  })
  await database.update(users).set({ role }).where(eq(users.id, user.id))
  const reloaded = await ensureUserRecord(database, {
    clerkUserId,
    email,
    displayName: email,
  })
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
  admin = await actorWithRole(
    'user_catalog_admin',
    'catalog-admin@example.com',
    'admin',
  )
  staff = await actorWithRole(
    'user_catalog_staff',
    'catalog-staff@example.com',
    'staff',
  )
})

const productInput = {
  name: 'Destr Suite',
  type: 'software',
  salesPriceMinor: 100000,
  costPriceMinor: 40000,
  currency: 'INR',
  notes: null,
}

describe('products and variants', () => {
  it('creates, reads, and updates a product', async () => {
    const created = await createProduct(database, admin, productInput)
    expect((await getProduct(database, created.id))?.name).toBe('Destr Suite')
    const updated = await updateProduct(database, admin, {
      ...productInput,
      id: created.id,
      name: 'Destr Suite Pro',
    })
    expect(updated.name).toBe('Destr Suite Pro')
  })

  it('prices the Odoo variant at sales plus ₹560 in the API rows', async () => {
    const product = await createProduct(database, admin, productInput)
    const variant = await createVariant(database, admin, {
      productId: product.id,
      name: 'Odoo',
      priceDeltaMinor: 56000,
    })
    expect(
      effectiveVariantPrice(product.salesPriceMinor, variant.priceDeltaMinor),
    ).toBe(156000)
  })

  it('archives instead of deleting a product with variants', async () => {
    const product = await createProduct(database, admin, productInput)
    await createVariant(database, admin, {
      productId: product.id,
      name: 'Odoo',
      priceDeltaMinor: 56000,
    })
    const result = await deleteProduct(database, admin, product.id)
    expect(result.archived).toBe(true)
    const kept = await getProduct(database, product.id)
    expect(kept?.archivedAt).not.toBeNull()
    const restored = await restoreProduct(database, admin, product.id)
    expect(restored.archivedAt).toBeNull()
  })

  it('hard-deletes a product with no variants', async () => {
    const product = await createProduct(database, admin, productInput)
    const result = await deleteProduct(database, admin, product.id)
    expect(result.archived).toBe(false)
    expect(await getProduct(database, product.id)).toBeUndefined()
  })

  it('deletes a variant outright', async () => {
    const product = await createProduct(database, admin, productInput)
    const variant = await createVariant(database, admin, {
      productId: product.id,
      name: 'Odoo',
      priceDeltaMinor: 56000,
    })
    await deleteVariant(database, admin, variant.id)
    expect(await deleteProduct(database, admin, product.id)).toEqual({
      archived: false,
    })
  })

  it('refuses every product write from staff', async () => {
    const product = await createProduct(database, admin, productInput)
    await expect(
      createProduct(database, staff, productInput),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      updateProduct(database, staff, { ...productInput, id: product.id }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      deleteProduct(database, staff, product.id),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      createVariant(database, staff, {
        productId: product.id,
        name: 'X',
        priceDeltaMinor: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      deleteVariant(database, staff, product.id),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

const planInput = {
  name: 'Monthly',
  productId: null,
  priceMinor: 500000,
  currency: 'INR',
  billingInterval: 'monthly' as const,
  intervalCount: 1,
  minQuantity: 1,
  availableFrom: null,
  availableTo: null,
  autoCloseAtEnd: false,
  allowEarlyClose: true,
  allowPause: true,
  allowRenew: true,
}

describe('plans', () => {
  it('creates and updates a plan without stamping the price', async () => {
    const created = await createPlan(database, admin, planInput)
    const updated = await updatePlan(database, admin, {
      ...planInput,
      id: created.id,
      priceMinor: 600000,
    })
    expect(updated.priceMinor).toBe(600000)
    expect(updated.priceChangedAt).toBeNull()
  })

  it('rejects a plan outside its availability window for new subscriptions', async () => {
    const expired = await createPlan(database, admin, {
      ...planInput,
      availableFrom: '2024-01-01',
      availableTo: '2024-12-31',
    })
    const row = await getPlan(database, expired.id)
    if (!row) throw new Error('Plan row missing')
    expect(() =>
      assertPlanAvailableForNewSubscription(
        row,
        new Date('2026-06-01T00:00:00Z'),
      ),
    ).toThrow(PlanUnavailableError)
    expect(() =>
      assertPlanAvailableForNewSubscription(
        row,
        new Date('2024-06-01T00:00:00Z'),
      ),
    ).not.toThrow()
  })

  it('rejects an archived plan for new subscriptions', async () => {
    const created = await createPlan(database, admin, planInput)
    await database
      .update(plans)
      .set({ archivedAt: new Date() })
      .where(eq(plans.id, created.id))
    const row = await getPlan(database, created.id)
    if (!row) throw new Error('Plan row missing')
    expect(() =>
      assertPlanAvailableForNewSubscription(row, new Date()),
    ).toThrow(PlanUnavailableError)
  })

  it('hard-deletes a plan with no subscriptions', async () => {
    const created = await createPlan(database, admin, planInput)
    expect(await deletePlan(database, admin, created.id)).toEqual({
      archived: false,
    })
    expect(await getPlan(database, created.id)).toBeUndefined()
  })

  it('refuses every plan write from staff', async () => {
    const created = await createPlan(database, admin, planInput)
    await expect(createPlan(database, staff, planInput)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    await expect(
      updatePlan(database, staff, { ...planInput, id: created.id }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      deletePlan(database, staff, created.id),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('taxes', () => {
  it('creates, updates, and deletes a tax', async () => {
    const created = await createTax(database, admin, {
      name: 'GST 18%',
      rateBasisPoints: 1800,
      isActive: true,
    })
    expect((await getTax(database, created.id))?.rateBasisPoints).toBe(1800)
    const updated = await updateTax(database, admin, {
      id: created.id,
      name: 'GST 18%',
      rateBasisPoints: 1800,
      isActive: false,
    })
    expect(updated.isActive).toBe(false)
    await deleteTax(database, admin, created.id)
    expect(await getTax(database, created.id)).toBeUndefined()
  })

  it('refuses every tax write from staff', async () => {
    const created = await createTax(database, admin, {
      name: 'GST 18%',
      rateBasisPoints: 1800,
      isActive: true,
    })
    await expect(
      createTax(database, staff, {
        name: 'GST 5%',
        rateBasisPoints: 500,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      updateTax(database, staff, {
        id: created.id,
        name: 'GST 18%',
        rateBasisPoints: 1800,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(deleteTax(database, staff, created.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })
})
