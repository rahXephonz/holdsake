import { createFileRoute } from '@tanstack/react-router'
import { getAddress } from 'viem'
import { z } from 'zod'
import { hexSchema } from '@/lib/hex'
import { afterEarn } from '@/lib/server/earn'
import { afterFundOperation } from '@/lib/server/funds'
import { afterGiftOperation } from '@/lib/server/gifts'
import { afterSend } from '@/lib/server/sends'
import { afterTrade } from '@/lib/server/trades'
import { json, readBody, route } from '@/lib/server/http'
import { loadOperation, submitOperation } from '@/lib/server/operations'
import { clientIp, enforceRateLimit } from '@/lib/server/rate-limit'
import { requireUser } from '@/lib/server/users'

const hex = hexSchema

const bodySchema = z.object({
  signature: hex,
  authorization: z
    .object({
      address: hex,
      chainId: z.number().int(),
      nonce: z.number().int().nonnegative(),
      r: hex,
      s: hex,
      yParity: z.number().int().min(0).max(1),
    })
    .optional(),
})

/** One submit for every flow: sends the signed draft, then lets the flow update its own rows */
export const Route = createFileRoute('/api/operations/$id/submit')({
  server: {
    handlers: {
      POST: route<{ id: string }>(async ({ request, params }) => {
        const user = await requireUser(request)
        enforceRateLimit(user.id, 'submit')
        enforceRateLimit(clientIp(request), 'submitIp')
        const body = await readBody(request, bodySchema)
        const operation = await loadOperation(params.id, user)
        const result = await submitOperation({ operation, user, ...body })

        const { context } = operation.user_op
        if (operation.kind.startsWith('gift_') && typeof context.giftId === 'string')
          await afterGiftOperation(operation.kind, context.giftId, result)
        if (operation.kind.startsWith('fund_') && typeof context.fundId === 'string')
          await afterFundOperation(operation.kind, context, result)
        const trade =
          operation.kind === 'trade'
            ? await afterTrade(context, result, getAddress(operation.sender))
            : null
        if (operation.kind.startsWith('earn_'))
          await afterEarn(operation.kind, context, result, user, getAddress(operation.sender))
        if (operation.kind === 'send' && typeof context.sendId === 'string')
          await afterSend(context.sendId, result.success, result.txHash)

        return json({ ok: result.success, txHash: result.txHash, trade })
      }),
    },
  },
})
