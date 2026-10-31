import { ClerkProvider } from '@clerk/tanstack-react-start'
import { Theme } from '@astryxdesign/core/theme'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { defaultThemeSlug, themes } from '../astryx-themes'

import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '../styles.css'

const queryClient = new QueryClient()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Destr' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <ClerkProvider>
        <QueryClientProvider client={queryClient}>
          <Theme theme={themes[defaultThemeSlug]}>
            <Outlet />
          </Theme>
        </QueryClientProvider>
      </ClerkProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
