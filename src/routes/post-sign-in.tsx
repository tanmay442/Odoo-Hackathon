import { useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Text } from '@astryxdesign/core/Text'

import { sessionUserFn } from '#/features/users/functions'

export const Route = createFileRoute('/post-sign-in')({
  component: PostSignInPage,
})

function PostSignInPage() {
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    sessionUserFn()
      .then((user) => {
        if (cancelled) return
        if (user instanceof Response) {
          if (user.status === 401) void navigate({ to: '/sign-in' })
          else setFailed(true)
          return
        }
        void navigate({ to: user.landingPath })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [navigate])
  if (failed) {
    return (
      <main>
        <Text>Sign-in did not finish. Your session may be stale.</Text>
        <Link to="/">Back to start</Link>
      </main>
    )
  }
  return (
    <main>
      <Text>Signing you in…</Text>
    </main>
  )
}
