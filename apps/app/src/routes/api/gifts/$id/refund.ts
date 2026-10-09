import { createFileRoute } from '@tanstack/react-router'
import { buildSettle, loadGift, toGiftView } from '@/lib/server/gifts'
import { badRequest, json, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireUser, requireWallet } from '@/lib/server/users'

export const Route = createFileRoute('/api/gifts/$id/refund')({
  server: {
    handlers: {
      POST: route<{ id: string }>(async ({ request, params }) => {
        const user = await requireUser(request)
        enforceRateLimit(user.id, 'build')
        const gift = await loadGift(params.id)
        const view = await toGiftView(gift, user)
        if (!view.canRefund) throw badRequest('This gift can’t be taken back now.')
        return json(
          await buildSettle({ gift, user, wallet: requireWallet(user), action: 'refund' }),
        )
      }),
    },
  },
})
