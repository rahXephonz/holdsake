import { getAddress, type Address } from 'viem'
import { z } from 'zod'
import { HANDLE_PATTERN, normalizeHandle } from '@/lib/handles'
import { badRequest } from '@/lib/server/http'
import { findWalletForEmail, walletForEmail } from '@/lib/server/privy'
import { db } from '@/lib/server/supabase'
import { toPublicProfile, USER_COLUMNS, type UserRow } from '@/lib/server/users'
import type { PublicProfile } from '@/lib/types'

export const recipientSchema = z.union([
  z.object({ handle: z.string().trim().min(1).max(21) }),
  z.object({ email: z.email().trim().toLowerCase().max(254) }),
])

export type RecipientInput = z.infer<typeof recipientSchema>

export type ResolvedRecipient = {
  wallet: Address
  user: UserRow | null
  email: string | null
  /** How the sender sees them */
  label: string
  profile: PublicProfile | null
}

export async function userByHandle(handle: string): Promise<UserRow | null> {
  const { data, error } = await db()
    .from('users')
    .select(USER_COLUMNS)
    .eq('handle', handle)
    .maybeSingle()
    .overrideTypes<UserRow | null, { merge: false }>()
  if (error) throw error
  return data
}

async function userByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await db()
    .from('users')
    .select(USER_COLUMNS)
    .eq('email', email)
    .maybeSingle()
    .overrideTypes<UserRow | null, { merge: false }>()
  if (error) throw error
  return data
}

/**
 * Read-only lookup for the recipient picker: never creates an account, so typing an email
 * doesn't pregenerate anything (that happens only when a gift is actually sent)
 */
export async function lookupRecipient(input: RecipientInput): Promise<{
  found: boolean
  profile: PublicProfile | null
  label: string
}> {
  if ('handle' in input) {
    const handle = normalizeHandle(input.handle)
    const user = HANDLE_PATTERN.test(handle) ? await userByHandle(handle) : null
    return user?.wallet_address
      ? { found: true, profile: toPublicProfile(user), label: `@${user.handle}` }
      : { found: false, profile: null, label: `@${handle}` }
  }
  const user = await userByEmail(input.email)
  if (user?.wallet_address && user.handle)
    return { found: true, profile: toPublicProfile(user), label: user.name ?? input.email }
  // An email works whether or not they've joined: they sign in with it to open the gift
  return { found: true, profile: null, label: input.email }
}

/** Resolves who a gift is locked to, pregenerating an account for a new email */
export async function resolveGiftRecipient(
  input: RecipientInput,
  sender: UserRow,
): Promise<ResolvedRecipient> {
  let resolved: ResolvedRecipient
  if ('handle' in input) {
    const handle = normalizeHandle(input.handle)
    const user = HANDLE_PATTERN.test(handle) ? await userByHandle(handle) : null
    if (!user?.wallet_address)
      throw badRequest(`We couldn’t find @${handle}.`, 'recipient_not_found')
    resolved = {
      wallet: getAddress(user.wallet_address),
      user,
      email: null,
      label: user.name ?? `@${handle}`,
      profile: toPublicProfile(user),
    }
  } else {
    const user = await userByEmail(input.email)
    const wallet = user?.wallet_address
      ? getAddress(user.wallet_address)
      : ((await findWalletForEmail(input.email)) ?? (await walletForEmail(input.email)))
    resolved = {
      wallet,
      user: user?.wallet_address ? user : null,
      email: input.email,
      label: user?.name ?? input.email,
      profile: user?.handle ? toPublicProfile(user) : null,
    }
  }
  if (
    sender.wallet_address &&
    resolved.wallet.toLowerCase() === sender.wallet_address.toLowerCase()
  )
    throw badRequest('You can’t send a gift to yourself.', 'self_gift')
  return resolved
}
