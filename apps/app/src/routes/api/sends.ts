import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { buildSend, validateDestination } from '@/lib/server/sends'
import { requireEligible, requireUser, requireWallet } from '@/lib/server/users'

const bodySchema = z.object({
  token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  destination: z.string().trim(),
  amountRaw: z
    .string()
    .regex(/^[1-9][0-9]{0,77}$/)
    .transform(BigInt),
})

/** Send shares or cash out to another account: a plain transfer, built and checked like the rest */
export const Route = createFileRoute('/api/sends')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        requireEligible(user, request)
        enforceRateLimit(user.id, 'build')
        const body = await readBody(request, bodySchema)
        const sender = requireWallet(user)
        const destination = await validateDestination(body.destination, sender)
        return json(
          await buildSend({
            user,
            sender,
            token: body.token,
            destination,
            amountRaw: body.amountRaw,
          }),
        )
      }),
    },
  },
})
