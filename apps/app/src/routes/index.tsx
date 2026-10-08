import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

// Placeholder until the first real screen. The brand is plain text in the heading font: no logo
// yet (see AGENT.md "Design").
function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-4xl font-bold tracking-tight">Holdsake</h1>
      <p className="mt-3 text-muted-foreground">Give real ownership.</p>
    </main>
  )
}
