import { SignUp } from '@clerk/tanstack-react-start'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sign-up')({ component: SignUpPage })

function SignUpPage() {
  return (
    <Stack padding={6} hAlign="center" gap={4}>
      <Stack gap={1} hAlign="center">
        <Heading level={1}>Destr</Heading>
        <Text type="supporting">Recurring billing that runs itself.</Text>
      </Stack>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/post-sign-in" />
    </Stack>
  )
}
