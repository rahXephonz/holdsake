import { createFileRoute } from '@tanstack/react-router'
import { buildEarnClaim } from '@/lib/server/earn'
import { json, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireEligible, requireUser, requireWallet } from '@/lib/server/users'

/** Builds turning the interest into shares of the chosen stock */
export const Route = createFileRoute('/api/earn/claim')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        requireEligible(user, request)
        enforceRateLimit(user.id, 'build')
        return json(await buildEarnClaim({ user, wallet: requireWallet(user) }))
      }),
    },
  },
})
