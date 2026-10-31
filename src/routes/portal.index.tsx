import { createFileRoute, redirect } from '@tanstack/react-router'
import { Card } from '@astryxdesign/core/Card'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import { portalOverviewFn } from '#/features/portal/functions'
import { OverviewCards } from '#/features/portal/components/OverviewCards'

export const Route = createFileRoute('/portal/')({
  loader: async () => {
    const overview = await portalOverviewFn()
    if (overview instanceof Response) {
      if (overview.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return overview
  },
  component: PortalOverviewPage,
})

function PortalOverviewPage() {
  const overview = Route.useLoaderData()
  if (overview.activeSubscriptions.length === 0 && overview.balanceDueMinor === 0) {
    return (
      <Stack gap={3}>
        <OverviewCards overview={overview} />
        <Card>
          <Text type="supporting">No subscriptions yet. Contact support to get started.</Text>
        </Card>
      </Stack>
    )
  }
  return <OverviewCards overview={overview} />
}
