import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildCashContribute, loadFund } from '@/lib/server/funds'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireEligible, requireUser, requireWallet } from '@/lib/server/users'

const rawAmount = z
  .string()
  .regex(/^[1-9][0-9]{0,77}$/)
  .transform(BigInt)

// Either cash, or shares held outside the mix to sell for it first
const bodySchema = z.union([
  z.object({
    cashRaw: rawAmount,
    note: z.string().trim().max(140).nullable().default(null),
  }),
  z.object({
    sell: z.object({ token: z.string().regex(/^0x[0-9a-fA-F]{40}$/), amountRaw: rawAmount }),
    note: z.string().trim().max(140).nullable().default(null),
  }),
])

/** Builds adding cash to a fund (or shares sold for cash first): it buys the fund's mix and puts the shares in */
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
            ...('sell' in body ? { sell: body.sell } : { cashRaw: body.cashRaw }),
            note: body.note || null,
          }),
        )
      }),
    },
  },
})
