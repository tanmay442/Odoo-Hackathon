import { Button } from '@astryxdesign/core/Button'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main>
      <h1>Destr</h1>
      <p>Subscription management system.</p>
      <Button label="Get started" variant="primary" />
    </main>
  )
}
