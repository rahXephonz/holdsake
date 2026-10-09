import { createFileRoute } from '@tanstack/react-router'
import { catalog, toStock } from '@/lib/server/catalog'
import { dayChanges } from '@/lib/server/changes'
import { json, route } from '@/lib/server/http'

export const Route = createFileRoute('/api/stocks/')({
  server: {
    handlers: {
      GET: route(async () => {
        const [entries, changes] = await Promise.all([catalog(), dayChanges()])
        return json(
          entries.map((entry) => ({
            ...toStock(entry),
            changePct: changes.get(entry.ticker) ?? null,
          })),
        )
      }),
    },
  },
})
