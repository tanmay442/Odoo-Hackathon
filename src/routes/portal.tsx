import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import { sessionUserFn } from '#/features/users/functions'

export const Route = createFileRoute('/portal')({
  loader: async () => {
    const user = await sessionUserFn()
    if (user instanceof Response) {
      if (user.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return user
  },
  errorComponent: PortalAccessError,
  component: PortalPage,
})

function PortalAccessError() {
  return (
    <main>
      <Stack gap={3}>
        <Heading level={1}>Sign in required</Heading>
        <Text>Your subscriptions live here. Sign in to view them.</Text>
        <Link to="/sign-in">Go to sign-in</Link>
      </Stack>
    </main>
  )
}

function PortalPage() {
  Route.useLoaderData()
  return (
    <main>
      <Stack gap={4}>
        <Heading level={1}>My subscriptions</Heading>
        <Card>
          <Text>Your plans, invoices, and payments will appear here. Nothing to show yet.</Text>
        </Card>
      </Stack>
    </main>
  )
}
