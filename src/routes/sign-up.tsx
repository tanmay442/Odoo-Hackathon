import { SignUp } from '@clerk/tanstack-react-start'
import { Stack } from '@astryxdesign/core/Stack'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sign-up')({ component: SignUpPage })

function SignUpPage() {
  return (
    <Stack padding={6} hAlign="center">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/post-sign-in" />
    </Stack>
  )
}
