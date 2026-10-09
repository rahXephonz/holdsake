import { createFileRoute } from '@tanstack/react-router'
import { loadFund, toFundView } from '@/lib/server/funds'
import { json, route } from '@/lib/server/http'
import { optionalUser } from '@/lib/server/users'

/** Public with the link, so anyone can see the fund they're adding to */
export const Route = createFileRoute('/api/funds/$id/')({
  server: {
    handlers: {
      GET: route<{ id: string }>(async ({ request, params }) =>
        json(await toFundView(await loadFund(params.id), await optionalUser(request))),
      ),
    },
  },
})
