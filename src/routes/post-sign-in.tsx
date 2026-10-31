import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LayoutContent } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'

import { sessionUserFn } from '#/features/users/functions'

export const Route = createFileRoute('/post-sign-in')({
  component: PostSignInPage,
})

function PostSignInPage() {
  const navigate = useNavigate()
  useEffect(() => {
    let cancelled = false
    sessionUserFn()
      .then((user) => {
        if (!cancelled && !(user instanceof Response))
          void navigate({ to: user.landingPath })
      })
      .catch(() => {
        if (!cancelled) void navigate({ to: '/sign-in' })
      })
    return () => {
      cancelled = true
    }
  }, [navigate])
  return (
    <LayoutContent>
      <Text>Signing you in…</Text>
    </LayoutContent>
  )
}
