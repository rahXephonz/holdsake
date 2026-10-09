import { createFileRoute } from '@tanstack/react-router'
import { json, readBody, route } from '@/lib/server/http'
import { clientIp, enforceRateLimit } from '@/lib/server/rate-limit'
import { lookupRecipient, recipientSchema } from '@/lib/server/recipients'
import { requireUser } from '@/lib/server/users'

export const Route = createFileRoute('/api/recipients')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        enforceRateLimit(user.id, 'recipients')
        enforceRateLimit(clientIp(request), 'recipientsIp')
        return json(await lookupRecipient(await readBody(request, recipientSchema)))
      }),
    },
  },
})
