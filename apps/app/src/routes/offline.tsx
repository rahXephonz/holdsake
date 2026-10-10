import { createFileRoute } from '@tanstack/react-router'
import { WifiSlashIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

/** What the installed app shows when there's no connection (cached by public/sw.js) */
export const Route = createFileRoute('/offline')({ component: Offline })

function Offline() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <WifiSlashIcon className="size-10 text-muted-foreground" />
      <h1 className="mt-5 text-2xl font-bold tracking-tight">You’re offline</h1>
      <p className="mt-2 text-muted-foreground">
        Holdsake needs a connection to show your money. It’ll pick up where you left off.
      </p>
      <Button size="lg" variant="secondary" className="mt-6" onClick={() => location.reload()}>
        Try again
      </Button>
    </div>
  )
}
