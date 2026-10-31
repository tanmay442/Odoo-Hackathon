import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Link, Outlet, createFileRoute, redirect, useLocation } from '@tanstack/react-router'

import { appAccessFn } from '#/features/users/functions'

export const Route = createFileRoute('/app')({
  loader: async () => {
    const access = await appAccessFn()
    if (access instanceof Response) {
      if (access.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return access
  },
  errorComponent: AppAccessError,
  component: AppLayout,
})

function AppAccessError() {
  return (
    <Stack gap={3} padding={6}>
      <Heading level={1}>No access</Heading>
      <Text>This area is for staff. Sign in with a staff account to continue.</Text>
      <Link to="/sign-in">Go to sign-in</Link>
    </Stack>
  )
}

const workspaceAreas = [
  { label: 'Dashboard', detail: 'Revenue, outstanding, and overdue at a glance.', href: '/app/dashboard' },
  { label: 'Customers', detail: 'Customer accounts and their billing history.', href: '/app/customers' },
  { label: 'Subscriptions', detail: 'Draft to active, with every status in between.', href: '/app/subscriptions' },
  { label: 'Invoices', detail: 'Generated from subscriptions. Confirm, send, print.', href: '/app/invoices' },
  { label: 'Payment verification', detail: 'Customer payment claims waiting for review.', href: '/app/payments/verification-queue' },
]

function AppLayout() {
  const access = Route.useLoaderData()
  const location = useLocation()
  const isWorkspaceHome = location.pathname === '/app'
  return (
    <Stack gap={5} padding={6}>
      <Stack direction="horizontal" hAlign="between" vAlign="center">
        <Stack direction="horizontal" gap={3} vAlign="center">
          <Text size="lg" weight="bold">
            Destr
          </Text>
          <Badge variant="neutral" label={access.role} />
        </Stack>
        <Stack direction="horizontal" gap={3}>
          <Link to="/app/dashboard">Dashboard</Link>
          <Link to="/app/customers">Customers</Link>
          <Link to="/app/subscriptions">Subscriptions</Link>
          <Link to="/app/invoices">Invoices</Link>
          <Link to="/app/payments/verification-queue">Payments</Link>
          {access.role === 'admin' ? <Link to="/admin/products">Admin</Link> : null}
        </Stack>
      </Stack>
      {isWorkspaceHome ? (
        <Stack gap={4}>
          <Heading level={1}>Workspace</Heading>
          <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
            {workspaceAreas.map((area) => (
              <Card key={area.href}>
                <Stack gap={2}>
                  <Heading level={3}>{area.label}</Heading>
                  <Text type="supporting">{area.detail}</Text>
                  <Link to={area.href}>Open {area.label.toLowerCase()}</Link>
                </Stack>
              </Card>
            ))}
          </Grid>
        </Stack>
      ) : (
        <Outlet />
      )}
    </Stack>
  )
}
