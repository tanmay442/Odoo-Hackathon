import { and, asc, count, eq, ilike, isNull, or  } from 'drizzle-orm'
import type {SQL} from 'drizzle-orm';

import type { Database } from '../../db/client'
import { customers } from '../../db/schema/customers'

export interface CustomerListParams {
  search?: string
  page?: number
  pageSize?: number
}

function searchCondition(term: string): SQL | undefined {
  const pattern = `%${term}%`
  return or(ilike(customers.displayName, pattern), ilike(customers.email, pattern))
}

export async function listCustomers(database: Database, params: CustomerListParams = {}) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const term = params.search?.trim()
  const conditions = [isNull(customers.archivedAt), term ? searchCondition(term) : undefined].filter(
    (condition): condition is SQL => condition !== undefined,
  )
  const where = conditions.length > 0 ? and(...conditions) : undefined
  const [rows, totalRows] = await Promise.all([
    database.query.customers.findMany({
      where,
      orderBy: asc(customers.createdAt),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    database
      .select({ total: count() })
      .from(customers)
      .where(where)
      .then((result) => result[0]?.total ?? 0),
  ])
  return { rows, total: totalRows, page, pageSize }
}

export function getCustomer(database: Database, customerId: string) {
  return database.query.customers.findFirst({ where: eq(customers.id, customerId) })
}
