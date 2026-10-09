import { createFileRoute } from '@tanstack/react-router'
import { findStock } from '@/lib/server/catalog'
import { notFound, route } from '@/lib/server/http'

/**
 * Serves a company logo from our own origin for canvas drawing (share cards): a cross-origin image
 * taints the canvas. One fixed upstream host, so this can't be pointed at arbitrary URLs. Screens
 * use the provider's URL directly; fetch this one with fetch(), not an <img>, in dev.
 */
const LOGO_BASE = 'https://financialmodelingprep.com/image-stock/'

export const Route = createFileRoute('/api/stocks/$ticker/logo')({
  server: {
    handlers: {
      GET: route<{ ticker: string }>(async ({ params }) => {
        const stock = await findStock(params.ticker)
        if (!stock) throw notFound('We don’t offer that stock.')
        const upstream = await fetch(`${LOGO_BASE}${encodeURIComponent(stock.ticker)}.png`)
        const type = upstream.headers.get('content-type') ?? ''
        if (!upstream.ok || !type.startsWith('image/')) throw notFound('No logo for this stock.')
        return new Response(await upstream.arrayBuffer(), {
          headers: { 'content-type': type, 'cache-control': 'public, max-age=86400, immutable' },
        })
      }),
    },
  },
})
