import { Button } from '@astryxdesign/core/Button'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { SubscriptionStatus } from '#/db/schema/subscriptions'

export interface DashboardFilterValues {
  from: string
  to: string
  planId: string
  status: SubscriptionStatus | ''
}

interface DashboardFiltersProps {
  values: DashboardFilterValues
  plans: Array<{ id: string; name: string }>
  statuses: SubscriptionStatus[]
  onChange: (values: DashboardFilterValues) => void
  onApply: () => void
  onClear: () => void
}

export function DashboardFilters({ values, plans, statuses, onChange, onApply, onClear }: DashboardFiltersProps) {
  return (
    <Stack direction="horizontal" gap={2}>
      <TextInput
        label="From (YYYY-MM-DD)"
        value={values.from}
        onChange={(value) => onChange({ ...values, from: value })}
        placeholder="2026-01-01"
        hasClear
      />
      <TextInput
        label="To (YYYY-MM-DD)"
        value={values.to}
        onChange={(value) => onChange({ ...values, to: value })}
        placeholder="2026-12-31"
        hasClear
      />
      <Selector
        label="Plan filter"
        options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
        value={values.planId === '' ? null : values.planId}
        onChange={(value) => onChange({ ...values, planId: value ?? '' })}
        hasClear
        isOptional
        placeholder="All plans"
      />
      <Selector
        label="Status filter"
        options={statuses.map((value) => ({ value, label: value }))}
        value={values.status === '' ? null : values.status}
        onChange={(value) => onChange({ ...values, status: (value as SubscriptionStatus | null) ?? '' })}
        hasClear
        isOptional
        placeholder="All statuses"
      />
      <Button label="Apply filters" variant="primary" onClick={onApply} />
      <Button label="Clear" onClick={onClear} />
    </Stack>
  )
}
