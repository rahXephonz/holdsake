import { createFileRoute } from '@tanstack/react-router'
import { findStock } from '@/lib/server/catalog'
import { json, notFound, route } from '@/lib/server/http'
import { getCompanyProfile } from '@/lib/server/profiles'

export const Route = createFileRoute('/api/stocks/$ticker/profile')({
  server: {
    handlers: {
      GET: route<{ ticker: string }>(async ({ params }) => {
        const stock = await findStock(params.ticker)
        if (!stock) throw notFound('We don’t offer that stock.')
        return json(await getCompanyProfile(stock.ticker), {
          headers: { 'cache-control': 'public, max-age=3600' },
        })
      }),
    },
  },
})
