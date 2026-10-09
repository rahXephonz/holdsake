import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildEarnDeposit } from '@/lib/server/earn'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireEligible, requireUser, requireWallet } from '@/lib/server/users'

const bodySchema = z.object({
  amountRaw: z
    .string()
    .regex(/^[1-9][0-9]{0,77}$/)
    .transform(BigInt),
})

/** Builds putting cash into Earn; the browser signs it */
export const Route = createFileRoute('/api/earn/deposit')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        requireEligible(user, request)
        enforceRateLimit(user.id, 'build')
        const body = await readBody(request, bodySchema)
        return json(
          await buildEarnDeposit({ user, wallet: requireWallet(user), amountRaw: body.amountRaw }),
        )
      }),
    },
  },
})
