import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { LayoutContent } from '@astryxdesign/core/Layout'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

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
  component: AppPage,
})

function AppAccessError() {
  return (
    <LayoutContent>
      <Stack gap={3}>
        <Heading level={1}>No access</Heading>
        <Text>This area is for staff. Sign in with a staff account to continue.</Text>
        <Link to="/sign-in">Go to sign-in</Link>
      </Stack>
    </LayoutContent>
  )
}

function AppPage() {
  const access = Route.useLoaderData()
  return (
    <LayoutContent>
      <Stack gap={4}>
        <Heading level={1}>Workspace</Heading>
        <Card>
          <Text>Signed in as {access.role}. Customer, subscription, and billing tools land here in later phases.</Text>
        </Card>
      </Stack>
    </LayoutContent>
  )
}
