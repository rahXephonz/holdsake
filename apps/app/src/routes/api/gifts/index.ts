import { createFileRoute } from '@tanstack/react-router'
import { CARD_THEMES } from '@/lib/gift-cards'
import { z } from 'zod'
import { createGifts, giftItemsSchema, listGifts, MAX_RECIPIENTS } from '@/lib/server/gifts'
import { json, readBody, route } from '@/lib/server/http'
import { clientIp, enforceRateLimit } from '@/lib/server/rate-limit'
import { recipientSchema, resolveGiftRecipient } from '@/lib/server/recipients'
import { requireEligible, requireUser, requireWallet } from '@/lib/server/users'

const createSchema = z.object({
  recipients: z.array(recipientSchema).min(1).max(MAX_RECIPIENTS),
  items: giftItemsSchema,
  message: z.string().trim().max(280).nullable().default(null),
  cardTheme: z.enum(CARD_THEMES).default('birthday'),
})

export const Route = createFileRoute('/api/gifts/')({
  server: {
    handlers: {
      GET: route(async ({ request }) => json(await listGifts(await requireUser(request)))),

      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        requireEligible(user, request)
        enforceRateLimit(user.id, 'createGifts')
        enforceRateLimit(clientIp(request), 'submitIp')
        const body = await readBody(request, createSchema)
        // Resolving pregenerates accounts for new emails: only here, when a gift is really sent
        const recipients = []
        for (const recipient of body.recipients)
          recipients.push(await resolveGiftRecipient(recipient, user))
        const gifts = await createGifts({
          sender: user,
          senderWallet: requireWallet(user),
          recipients,
          items: body.items,
          message: body.message || null,
          cardTheme: body.cardTheme,
        })
        return json({ gifts })
      }),
    },
  },
})
