import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildTakeBack } from '@/lib/server/borrow'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireUser, requireWallet } from '@/lib/server/users'

const bodySchema = z.object({
  ticker: z.string().min(1).max(10),
  amountRaw: z.union([
    z.literal('all'),
    z
      .string()
      .regex(/^[1-9][0-9]{0,77}$/)
      .transform(BigInt),
  ]),
})

/** Builds taking locked shares back. No eligibility check: people can always take theirs back */
export const Route = createFileRoute('/api/borrow/take-back')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)

        enforceRateLimit(user.id, 'build')
        const body = await readBody(request, bodySchema)
        return json(
          await buildTakeBack({
            user,
            wallet: requireWallet(user),
            ticker: body.ticker,
            amountRaw: body.amountRaw,
          }),
        )
      }),
    },
  },
})
