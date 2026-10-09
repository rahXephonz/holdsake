import { createFileRoute } from '@tanstack/react-router'
import { buildWithdraw, loadFund } from '@/lib/server/funds'
import { json, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireUser, requireWallet } from '@/lib/server/users'

export const Route = createFileRoute('/api/funds/$id/withdraw')({
  server: {
    handlers: {
      POST: route<{ id: string }>(async ({ request, params }) => {
        const user = await requireUser(request)
        enforceRateLimit(user.id, 'build')
        return json(
          await buildWithdraw({
            fund: await loadFund(params.id),
            user,
            wallet: requireWallet(user),
          }),
        )
      }),
    },
  },
})
