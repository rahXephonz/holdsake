import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { cashDecimals } from '@/lib/server/catalog'
import { expectedGasUsed, gasFeeInCash } from '@/lib/server/fees'
import { giftItemsSchema, validateGiftItems } from '@/lib/server/gifts'
import { json, readBody, route } from '@/lib/server/http'
import { chain } from '@/lib/server/chain'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { requireUser } from '@/lib/server/users'

/**
 * A fee estimate per recipient before sending. Never resolves recipients (so nothing is
 * pregenerated); the exact fee is fixed when the gift is built, from that operation's own gas.
 * Sized from the gas limits of a real one-item gift (first send, delegation included, about
 * 472k with L1 data; 394k actually used, 2026-10-09), so the quote errs a little high, scaled by
 * item count.
 */
const BASE_GAS = 420_000n
const PER_ITEM_GAS = 60_000n
// Arbitrum counts L1 data in the same gas units, already inside the figures above
const L1_GAS = 0n

export const Route = createFileRoute('/api/gifts/quote')({
  server: {
    handlers: {
      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        enforceRateLimit(user.id, 'giftQuote')
        const body = await readBody(
          request,
          z.object({ items: giftItemsSchema, recipients: z.number().int().min(1).max(5) }),
        )
        await validateGiftItems(body.items)
        const gasPrice = await chain().getGasPrice()
        const feeRaw = await gasFeeInCash({
          gasUnits: expectedGasUsed(BASE_GAS + PER_ITEM_GAS * BigInt(body.items.length) + L1_GAS),
          maxFeePerGas: gasPrice,
        })
        return json({
          feeRaw: feeRaw.toString(),
          perRecipient: true,
          decimals: await cashDecimals(),
        })
      }),
    },
  },
})
