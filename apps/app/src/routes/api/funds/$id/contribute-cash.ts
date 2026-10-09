import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildCashContribute, loadFund } from '@/lib/server/funds'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireEligible, requireUser, requireWallet } from '@/lib/server/users'

const bodySchema = z.object({
  cashRaw: z
    .string()
    .regex(/^[1-9][0-9]{0,77}$/)
    .transform(BigInt),
  note: z.string().trim().max(140).nullable().default(null),
})

/** Builds adding cash to a fund: it buys the fund's mix and puts the shares in */
export const Route = createFileRoute('/api/funds/$id/contribute-cash')({
  server: {
    handlers: {
      POST: route<{ id: string }>(async ({ request, params }) => {
        const user = await requireUser(request)
        requireEligible(user, request)
        enforceRateLimit(user.id, 'build')
        const body = await readBody(request, bodySchema)
        const fund = await loadFund(params.id)
        return json(
          await buildCashContribute({
            fund,
            user,
            wallet: requireWallet(user),
            cashRaw: body.cashRaw,
            note: body.note || null,
          }),
        )
      }),
    },
  },
})
