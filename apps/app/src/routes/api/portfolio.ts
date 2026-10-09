import { createFileRoute } from '@tanstack/react-router'
import { syncDeposits } from '@/lib/server/deposits'
import { json, route } from '@/lib/server/http'
import { portfolioOf } from '@/lib/server/portfolio'
import { requireUser, requireWallet } from '@/lib/server/users'

export const Route = createFileRoute('/api/portfolio')({
  server: {
    handlers: {
      GET: route(async ({ request }) => {
        const user = await requireUser(request)
        // Runs alongside the balance read; it never throws and skips itself if run recently
        const [portfolio] = await Promise.all([
          portfolioOf(requireWallet(user)),
          syncDeposits(user),
        ])
        return json(portfolio)
      }),
    },
  },
})
