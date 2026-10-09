import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { normalizeHandle } from '@/lib/handles'
import { createFund, listFunds } from '@/lib/server/funds'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { db } from '@/lib/server/supabase'
import {
  requireEligible,
  requireUser,
  requireWallet,
  USER_COLUMNS,
  type UserRow,
} from '@/lib/server/users'

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  purpose: z.enum(['college', 'first_home', 'wedding', 'retirement', 'other']),
  goalUsd: z.number().positive().max(10_000_000).nullable().default(null),
  unlockAt: z.iso.datetime().transform((value) => new Date(value)),
  // Yourself, or someone already on Holdsake: a fund never pregenerates an account
  beneficiaryHandle: z.string().trim().max(21).nullable().default(null),
  allocations: z
    .array(
      z.object({ ticker: z.string().min(1).max(10), percent: z.number().int().min(1).max(100) }),
    )
    .min(1)
    .max(3),
})

export const Route = createFileRoute('/api/funds/')({
  server: {
    handlers: {
      GET: route(async ({ request }) => json(await listFunds(await requireUser(request)))),

      POST: route(async ({ request }) => {
        const user = await requireUser(request)
        requireEligible(user, request)
        enforceRateLimit(user.id, 'build')
        const body = await readBody(request, createSchema)
        let beneficiary: { self: true } | { user: UserRow } = { self: true }
        if (body.beneficiaryHandle) {
          const { data, error } = await db()
            .from('users')
            .select(USER_COLUMNS)
            .eq('handle', normalizeHandle(body.beneficiaryHandle))
            .maybeSingle()
            .overrideTypes<UserRow | null, { merge: false }>()
          if (error) throw error
          if (!data?.wallet_address) throw badRequest('We couldn’t find that person.')
          if (data.id !== user.id) beneficiary = { user: data }
        }
        return json(
          await createFund({
            user,
            wallet: requireWallet(user),
            name: body.name,
            purpose: body.purpose,
            goalUsd: body.goalUsd,
            unlockAt: body.unlockAt,
            beneficiary,
            allocations: body.allocations,
          }),
        )
      }),
    },
  },
})
