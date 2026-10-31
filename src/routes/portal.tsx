import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
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
  component: PortalLayout,
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

function PortalLayout() {
  return (
    <main>
      <Stack gap={3}>
        <Stack direction="horizontal" gap={3}>
          <Heading level={1}>Portal</Heading>
          <Link to="/portal">Overview</Link>
          <Link to="/portal/subscriptions">Subscriptions</Link>
          <Link to="/portal/invoices">Invoices</Link>
          <Link to="/portal/account">Account</Link>
        </Stack>
        <Outlet />
      </Stack>
    </main>
  )
}
