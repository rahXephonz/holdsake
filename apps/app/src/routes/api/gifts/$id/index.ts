import { createFileRoute } from '@tanstack/react-router'
import { loadGift, toGiftView } from '@/lib/server/gifts'
import { json, route } from '@/lib/server/http'
import { requireUser } from '@/lib/server/users'

export const Route = createFileRoute('/api/gifts/$id/')({
  server: {
    handlers: {
      GET: route<{ id: string }>(async ({ request, params }) => {
        const user = await requireUser(request)
        return json(await toGiftView(await loadGift(params.id), user))
      }),
    },
  },
})
