import { SignIn } from '@clerk/tanstack-react-start'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

function SignInPage() {
  return (
    <Stack padding={6} hAlign="center" gap={4}>
      <Stack gap={1} hAlign="center">
        <Heading level={1}>Destr</Heading>
        <Text type="supporting">Recurring billing that runs itself.</Text>
      </Stack>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/post-sign-in" />
    </Stack>
  )
}
