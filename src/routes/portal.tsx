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
    <Stack gap={3} padding={6}>
      <Heading level={1}>Sign in required</Heading>
      <Text>Your subscriptions live here. Sign in to view them.</Text>
      <Link to="/sign-in">Go to sign-in</Link>
    </Stack>
  )
}

function PortalLayout() {
  return (
    <Stack gap={5} padding={6}>
      <Stack direction="horizontal" hAlign="between" vAlign="center">
        <Text size="lg" weight="bold">
          Destr
        </Text>
        <Stack direction="horizontal" gap={3}>
          <Link to="/portal">Overview</Link>
          <Link to="/portal/subscriptions">Subscriptions</Link>
          <Link to="/portal/invoices">Invoices</Link>
          <Link to="/portal/account">Account</Link>
        </Stack>
      </Stack>
      <Outlet />
    </Stack>
  )
}
