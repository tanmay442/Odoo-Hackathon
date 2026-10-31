import { SignIn } from '@clerk/tanstack-react-start'
import { Stack } from '@astryxdesign/core/Stack'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

function SignInPage() {
  return (
    <Stack padding={6} hAlign="center">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/post-sign-in" />
    </Stack>
  )
}
