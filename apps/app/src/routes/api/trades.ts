import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { findStock } from '@/lib/server/catalog'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { buildTrade } from '@/lib/server/trades'
import { requireEligible, requireUser, requireWallet } from '@/lib/server/users'

const bodySchema = z.object({
  ticker: z.string().min(1).max(10),
  side: z.enum(['buy', 'sell']),
  /** Cash for a buy, shares for a sell, raw units */
  amountRaw: z
    .string()
    .regex(/^[1-9][0-9]{0,77}$/)
    .transform(BigInt),
})

/** Builds a buy or sell with its exact quote and fees; the browser shows them, then signs */
export const Route = createFileRoute('/api/trades')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        requireEligible(user, request)
        enforceRateLimit(user.id, 'build')
        const body = await readBody(request, bodySchema)
        const stock = await findStock(body.ticker)
        if (!stock) throw badRequest('We don’t offer that stock.', 'unknown_token')
        return json(
          await buildTrade({
            user,
            wallet: requireWallet(user),
            stock,
            side: body.side,
            amountRaw: body.amountRaw,
          }),
        )
      }),
    },
  },
})
