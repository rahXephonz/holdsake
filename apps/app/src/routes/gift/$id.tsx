import { createFileRoute } from '@tanstack/react-router'
import GiftScreen from '@/components/screens/gift-screen'
import { getGiftPreview } from '@/lib/gift-preview'

export const Route = createFileRoute('/gift/$id')({
  // Read on the server render, so a link pasted into a chat unfurls into "Ry sent you a gift"
  loader: ({ params }) => getGiftPreview({ data: params.id }).catch(() => null),
  head: ({ loaderData, params }) => {
    // Chats need an absolute image URL
    const origin = import.meta.env.VITE_APP_URL ?? ''
    const title = loaderData ? `${loaderData.senderName} sent you a gift` : 'A gift on Holdsake'
    const description = loaderData?.waiting
      ? 'Open it on Holdsake to see what’s inside. Only you can.'
      : 'Shares of real companies, sent as a gift on Holdsake.'
    return {
      meta: [
        { title: `${title} · Holdsake` },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Holdsake' },
        // The card itself, rendered by the server (no amount or message on it)
        ...(loaderData
          ? [
              { property: 'og:image', content: `${origin}/api/gifts/${params.id}/card.png` },
              { property: 'og:image:width', content: '1200' },
              { property: 'og:image:height', content: '630' },
              { name: 'twitter:image', content: `${origin}/api/gifts/${params.id}/card.png` },
            ]
          : []),
        { name: 'twitter:card', content: loaderData ? 'summary_large_image' : 'summary' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
    }
  },
  component: function Gift() {
    const { id } = Route.useParams()
    return <GiftScreen id={id} />
  },
})
