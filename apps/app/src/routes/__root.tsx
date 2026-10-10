import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { InstallPrompt } from '@/components/install-prompt'
import { Providers } from '@/components/providers'

import appCss from '@/styles.css?url'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Holdsake' },
      { name: 'description', content: 'Give real ownership. Gift stocks to the people you love.' },
      // Light only: stops browsers from darkening controls.
      { name: 'color-scheme', content: 'light' },
      { name: 'theme-color', content: '#ffffff' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'apple-mobile-web-app-title', content: 'Holdsake' },
      { name: 'mobile-web-app-capable', content: 'yes' },
    ],
    links: [
      // Google Sans and Inter (numbers) from Google Fonts. Valley Sans isn't there, so
      // headings fall back to Google Sans until its licensed files land in packages/ui/src/fonts.
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      // Icons live at fixed paths in public/icons (see public/icons/README.md)
      { rel: 'icon', href: '/icons/icon-192.png', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <QueryClientProvider client={queryClient}>
      <Providers>
        <InstallPrompt />
        <Outlet />
      </Providers>
    </QueryClientProvider>
  )
}

// Runs before React hydrates: the browser's install event fires once and early, and the service
// worker only in production, so it never caches a dev server's modules
const BOOT = `
addEventListener('beforeinstallprompt', function (event) {
  event.preventDefault()
  window.holdsakeInstallPrompt = event
})
addEventListener('appinstalled', function () {
  window.holdsakeInstalled = true
  delete window.holdsakeInstallPrompt
})
${
  import.meta.env.PROD
    ? `if ('serviceWorker' in navigator) addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}) })`
    : ''
}
`

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
