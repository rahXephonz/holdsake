import { createFileRoute } from '@tanstack/react-router'
import { borrowView } from '@/lib/server/borrow'
import { json, route } from '@/lib/server/http'
import { requireUser, requireWallet } from '@/lib/server/users'

/** Stocks that can be borrowed against, and the person's open loans, read back from Morpho */
export const Route = createFileRoute('/api/borrow/')({
  server: {
    handlers: {
      GET: route(async ({ request }) => {
        const user = await requireUser(request)
        return json(await borrowView(requireWallet(user)))
      }),
    },
  },
})
