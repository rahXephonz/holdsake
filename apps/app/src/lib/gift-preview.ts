import { createServerFn } from '@tanstack/react-start'
import type { GiftPreview } from '@/lib/types'

/**
 * A gift's public preview, callable from route loaders (so link previews in chats get real
 * meta tags from the server render) and from the sign-in screen. The server module is imported
 * inside the handler so none of it ships to the browser.
 */
export const getGiftPreview = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<GiftPreview | null> => {
    const { giftPreview } = await import('@/lib/server/gifts')
    return giftPreview(id)
  })
