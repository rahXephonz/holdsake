import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { earnView, setTarget } from '@/lib/server/earn'
import { json, readBody, route } from '@/lib/server/http'
import { requireUser, requireWallet } from '@/lib/server/users'

/** Where the person's Earn stands: what's in, what it has earned, and the stock it buys */
export const Route = createFileRoute('/api/earn/')({
  server: {
    handlers: {
      GET: route(async ({ request }) => {
        const user = await requireUser(request)
        return json(await earnView(user, requireWallet(user)))
      }),

      // Picks the stock interest turns into
      PUT: route(async ({ request }) => {
        const user = await requireUser(request)
        const body = await readBody(request, z.object({ ticker: z.string().min(1).max(10) }))
        await setTarget(user, body.ticker)
        return json({ ok: true })
      }),
    },
  },
})
