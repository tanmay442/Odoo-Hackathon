import { Link, Outlet, createFileRoute, redirect, useLocation } from '@tanstack/react-router'
import { AppShell } from '@astryxdesign/core/AppShell'
import { Heading } from '@astryxdesign/core/Heading'
import { LayoutContent } from '@astryxdesign/core/Layout'
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import { adminAccessFn } from '#/features/users/functions'

export const Route = createFileRoute('/admin')({
  loader: async () => {
    const access = await adminAccessFn()
    if (access instanceof Response) {
      if (access.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return access
  },
  errorComponent: AdminAccessError,
  component: AdminLayout,
})

function AdminAccessError() {
  return (
    <LayoutContent>
      <Stack gap={3}>
        <Heading level={1}>No access</Heading>
        <Text>This area is for admins. Sign in with an admin account to continue.</Text>
        <Link to="/sign-in">Go to sign-in</Link>
      </Stack>
    </LayoutContent>
  )
}

function AdminLayout() {
  const location = useLocation()
  return (
    <AppShell
      sideNav={
        <SideNav header={<SideNavHeading heading="Destr admin" />}>
          <SideNavSection title="Manage">
            <SideNavItem
              label="Staff"
              href="/admin/staff"
              isSelected={location.pathname === '/admin/staff'}
            />
          </SideNavSection>
        </SideNav>
      }
    >
      <Outlet />
    </AppShell>
  )
}
