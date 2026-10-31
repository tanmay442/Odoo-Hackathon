import { Link, Outlet, createFileRoute, redirect, useLocation } from '@tanstack/react-router'
import { Heading } from '@astryxdesign/core/Heading'
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
    <main>
      <Stack gap={3}>
        <Heading level={1}>No access</Heading>
        <Text>This area is for admins. Sign in with an admin account to continue.</Text>
        <Link to="/sign-in">Go to sign-in</Link>
      </Stack>
    </main>
  )
}

function AdminLayout() {
  const location = useLocation()
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <SideNav header={<SideNavHeading heading="Destr admin" />}>
        <SideNavSection title="Manage">
          <SideNavItem
            label="Products"
            href="/admin/products"
            isSelected={location.pathname === '/admin/products'}
          />
          <SideNavItem
            label="Plans"
            href="/admin/plans"
            isSelected={location.pathname === '/admin/plans'}
          />
          <SideNavItem
            label="Taxes"
            href="/admin/taxes"
            isSelected={location.pathname === '/admin/taxes'}
          />
          <SideNavItem
            label="Templates"
            href="/admin/templates"
            isSelected={location.pathname === '/admin/templates'}
          />
          <SideNavItem
            label="Staff"
            href="/admin/staff"
            isSelected={location.pathname === '/admin/staff'}
          />
        </SideNavSection>
      </SideNav>
      <div style={{ flex: 1, padding: 24 }}>
        <Outlet />
      </div>
    </div>
  )
}
