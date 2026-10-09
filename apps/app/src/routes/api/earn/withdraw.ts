import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildEarnWithdraw } from '@/lib/server/earn'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireUser, requireWallet } from '@/lib/server/users'

const bodySchema = z.object({
  amountRaw: z.union([
    z.literal('all'),
    z
      .string()
      .regex(/^[1-9][0-9]{0,77}$/)
      .transform(BigInt),
  ]),
})

/** Builds taking cash back out of Earn. No eligibility check: people can always leave */
export const Route = createFileRoute('/api/earn/withdraw')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        enforceRateLimit(user.id, 'build')
        const body = await readBody(request, bodySchema)
        return json(
          await buildEarnWithdraw({ user, wallet: requireWallet(user), amountRaw: body.amountRaw }),
        )
      }),
    },
  },
})
