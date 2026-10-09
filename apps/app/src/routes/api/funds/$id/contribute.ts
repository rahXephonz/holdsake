import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildContribute, loadFund } from '@/lib/server/funds'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireEligible, requireUser, requireWallet } from '@/lib/server/users'

const bodySchema = z.object({
  amounts: z
    .array(
      z.object({
        token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        amountRaw: z
          .string()
          .regex(/^[1-9][0-9]{0,77}$/)
          .transform(BigInt),
      }),
    )
    .min(1)
    .max(3),
  note: z.string().trim().max(140).nullable().default(null),
})

export const Route = createFileRoute('/api/funds/$id/contribute')({
  server: {
    handlers: {
      POST: route<{ id: string }>(async ({ request, params }) => {
        const user = await requireUser(request)
        requireEligible(user, request)
        enforceRateLimit(user.id, 'build')
        const body = await readBody(request, bodySchema)
        const fund = await loadFund(params.id)
        return json(
          await buildContribute({
            fund,
            user,
            wallet: requireWallet(user),
            amounts: body.amounts,
            note: body.note || null,
          }),
        )
      }),
    },
  },
})
