import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'

import type { CustomerLifecycleTarget } from '#/features/portal/queries'
import { subscriptionTransitionFn } from '#/features/subscriptions/functions'

const actionLabels: Record<CustomerLifecycleTarget, string> = {
  paused: 'Pause',
  closed: 'Close',
  active: 'Renew',
}

export function SubscriptionActions({
  subscriptionId,
  allowedActions,
  onChanged,
}: {
  subscriptionId: string
  allowedActions: CustomerLifecycleTarget[]
  onChanged: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<CustomerLifecycleTarget | null>(null)

  async function move(to: CustomerLifecycleTarget) {
    setError(null)
    setPending(to)
    try {
      const result = await subscriptionTransitionFn({ data: { id: subscriptionId, to } })
      if (result instanceof Response) {
        setError('This action is not available for your plan right now.')
        return
      }
      onChanged()
    } finally {
      setPending(null)
    }
  }

  if (allowedActions.length === 0) return null
  return (
    <Stack gap={1}>
      {error ? <Banner status="error" title={error} /> : null}
      <Stack direction="horizontal" gap={2}>
        {allowedActions.map((to) => (
          <Button
            key={to}
            label={actionLabels[to]}
            size="sm"
            isLoading={pending === to}
            isDisabled={pending !== null}
            onClick={() => void move(to)}
          />
        ))}
      </Stack>
    </Stack>
  )
}
