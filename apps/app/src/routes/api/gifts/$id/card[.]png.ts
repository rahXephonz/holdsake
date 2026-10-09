import { createFileRoute } from '@tanstack/react-router'
import { giftPreview } from '@/lib/server/gifts'
import { route } from '@/lib/server/http'
import { clientIp, enforceRateLimit } from '@/lib/server/rate-limit'

/**
 * The gift's card as a PNG: chats fetch it to unfurl the link, and "Save card" downloads it.
 * Public like the preview, and shows no more than it does: the occasion and the two names.
 */
export const Route = createFileRoute('/api/gifts/$id/card.png')({
  server: {
    handlers: {
      GET: route<{ id: string }>(async ({ request, params }) => {
        enforceRateLimit(clientIp(request), 'recipientsIp')
        const preview = await giftPreview(params.id)
        if (!preview) return new Response('Not found', { status: 404 })
        // Loaded here, not at the top: the renderer pulls in a native binary that must never
        // reach the browser bundle or its dependency scan
        const { renderCard } = await import('@/lib/server/card-image')
        const png = await renderCard({
          theme: preview.cardTheme,
          recipientName: preview.recipientName,
          senderName: preview.senderName,
        })
        // A fresh copy: the renderer's buffer type isn't one fetch's Response accepts
        return new Response(Uint8Array.from(png), {
          headers: {
            'Content-Type': 'image/png',
            // The card never changes once sent; chats and browsers can keep it
            'Cache-Control': 'public, max-age=86400, immutable',
          },
        })
      }),
    },
  },
})
