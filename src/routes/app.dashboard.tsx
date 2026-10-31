import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import type { SubscriptionStatus } from '#/db/schema/subscriptions'
import { dashboardChaseFn, dashboardOverdueFn, dashboardSummaryFn } from '#/features/dashboard/functions'
import { dashboardFilterSchema } from '#/features/dashboard/schema'
import { AgingBuckets } from '#/features/dashboard/components/AgingBuckets'
import { DashboardFilters } from '#/features/dashboard/components/DashboardFilters'
import type { DashboardFilterValues } from '#/features/dashboard/components/DashboardFilters'
import { OverdueTable } from '#/features/dashboard/components/OverdueTable'
import { RevenueTrend } from '#/features/dashboard/components/RevenueTrend'
import { SubscriptionFlow } from '#/features/dashboard/components/SubscriptionFlow'
import { SummaryCards } from '#/features/dashboard/components/SummaryCards'
import { planListFn } from '#/features/plans/functions'

const statuses: SubscriptionStatus[] = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed']

function parseSearch(search: Record<string, unknown>) {
  const parsed = dashboardFilterSchema.safeParse(search)
  return parsed.success ? parsed.data : {}
}

export const Route = createFileRoute('/app/dashboard')({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => ({ ...search }),
  loader: async ({ deps }) => {
    const [summary, overdue, plans] = await Promise.all([
      dashboardSummaryFn({ data: deps }),
      dashboardOverdueFn({ data: { ...deps, pageSize: 20 } }),
      planListFn(),
    ])
    if (summary instanceof Response) {
      if (summary.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    if (overdue instanceof Response) throw new Error('FORBIDDEN')
    if (plans instanceof Response) throw new Error('FORBIDDEN')
    return { summary, overdue, plans, filters: deps }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { summary, overdue, plans, filters } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const [draft, setDraft] = useState<DashboardFilterValues>({
    from: filters.from ?? '',
    to: filters.to ?? '',
    planId: filters.planId ?? '',
    status: filters.status ?? '',
  })
  useEffect(() => {
    setDraft({
      from: filters.from ?? '',
      to: filters.to ?? '',
      planId: filters.planId ?? '',
      status: filters.status ?? '',
    })
  }, [filters.from, filters.to, filters.planId, filters.status])
  const [chasingId, setChasingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function searchFrom(values: DashboardFilterValues) {
    return {
      ...(values.from ? { from: values.from } : {}),
      ...(values.to ? { to: values.to } : {}),
      ...(values.planId ? { planId: values.planId } : {}),
      ...(values.status ? { status: values.status } : {}),
    }
  }

  async function apply() {
    await navigate({ search: searchFrom(draft) })
  }

  async function clear() {
    setDraft({ from: '', to: '', planId: '', status: '' })
    await navigate({ search: {} })
  }

  async function chase(invoiceId: string) {
    setError(null)
    setNotice(null)
    setChasingId(invoiceId)
    try {
      const result = await dashboardChaseFn({ data: { invoiceId } })
      if (result instanceof Response) {
        setError('Chase failed. The invoice may no longer be overdue.')
        return
      }
      setNotice(`Reminder queued for ${result.recipient}.`)
      await router.invalidate()
    } finally {
      setChasingId(null)
    }
  }

  return (
    <Stack gap={3}>
      <Heading level={1}>Finance dashboard</Heading>
      {error ? <Banner status="error" title={error} /> : null}
      {notice ? <Banner status="success" title={notice} /> : null}
      <DashboardFilters
        values={draft}
        plans={plans}
        statuses={statuses}
        onChange={setDraft}
        onApply={() => void apply()}
        onClear={() => void clear()}
      />
      {summary.revenueByMonth.length === 0 && summary.subscriptionFlow.length === 0 ? (
        <Text>No data for this period.</Text>
      ) : null}
      <SummaryCards summary={summary} />
      <RevenueTrend rows={summary.revenueByMonth} currency={summary.currency} />
      <SubscriptionFlow rows={summary.subscriptionFlow} />
      <AgingBuckets rows={summary.agingBuckets} currency={summary.currency} />
      <OverdueTable
        rows={overdue.rows}
        total={overdue.total}
        currency={summary.currency}
        chasingId={chasingId}
        onChase={(invoiceId) => void chase(invoiceId)}
      />
    </Stack>
  )
}
