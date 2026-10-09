import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildBorrow } from '@/lib/server/borrow'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireEligible, requireUser, requireWallet } from '@/lib/server/users'

const bodySchema = z.object({
  ticker: z.string().min(1).max(10),
  borrowRaw: z
    .string()
    .regex(/^[1-9][0-9]{0,77}$/)
    .transform(BigInt),
})

/** Builds a loan: locks the shares it needs, borrows, pays the fee */
export const Route = createFileRoute('/api/borrow/open')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        requireEligible(user, request)
        enforceRateLimit(user.id, 'build')
        const body = await readBody(request, bodySchema)
        return json(
          await buildBorrow({
            user,
            wallet: requireWallet(user),
            ticker: body.ticker,
            borrowRaw: body.borrowRaw,
          }),
        )
      }),
    },
  },
})
