import { getAddress } from 'viem'
import { BLOCKED_COUNTRY_CODES } from '@/lib/restrictions'
import { forbidden, unauthorized } from '@/lib/server/http'
import { emailOf, privy, privyIdFromRequest, requirePrivyId, walletOf } from '@/lib/server/privy'
import { avatarUrl, db, UNIQUE_VIOLATION } from '@/lib/server/supabase'
import type { Profile, PublicProfile } from '@/lib/types'

export type UserRow = {
  id: string
  privy_id: string
  email: string | null
  wallet_address: string | null
  handle: string | null
  name: string | null
  avatar_path: string | null
  country: string | null
  not_us_person: boolean
  terms_accepted_at: string | null
  failed_ops: number
}

export const USER_COLUMNS =
  'id, privy_id, email, wallet_address, handle, name, avatar_path, country, not_us_person, terms_accepted_at, failed_ops'

export { HANDLE_PATTERN } from '@/lib/handles'

// Every top-level page, plus names we keep for ourselves: a handle that matches one would render
// the page instead of the person's gift link
export const RESERVED_HANDLES = new Set([
  'about',
  'add-cash',
  'admin',
  'api',
  'app',
  'borrow',
  'buy',
  'cash-out',
  'fund',
  'funds',
  'gift',
  'gifts',
  'help',
  'holding',
  'holdsake',
  'login',
  'notifications',
  'offline',
  'onboarding',
  'profile',
  'send',
  'send-stocks',
  'stocks',
  'support',
  'trade',
  'trades',
])

const upsert = (values: Record<string, string>) =>
  db()
    .from('users')
    .upsert(values, { onConflict: 'privy_id' })
    .select(USER_COLUMNS)
    .single()
    .overrideTypes<UserRow, { merge: false }>()

/** Pulls email + account from Privy (never from the client) and upserts our row */
export async function syncUser(privyId: string): Promise<UserRow> {
  // Privy names its plain get-by-id `_get`
  // oxlint-disable-next-line eslint/no-underscore-dangle
  const user = await privy().users()._get(privyId)
  const patch: Record<string, string> = { privy_id: privyId }
  const email = emailOf(user)
  const wallet = walletOf(user)
  if (email) patch.email = email
  // Stored lowercase so lookups by address never miss on checksum casing
  if (wallet) patch.wallet_address = wallet.toLowerCase()

  let { data, error } = await upsert(patch)
  // Another Privy account (e.g. Google vs email code) already owns this email: keep ours without it
  if (error?.code === UNIQUE_VIOLATION && patch.email) {
    delete patch.email
    ;({ data, error } = await upsert(patch))
  }
  if (error) throw error
  if (!data) throw new Error(`No user row after upsert for ${privyId}`)
  return data
}

export async function findUserByPrivyId(privyId: string): Promise<UserRow | null> {
  const { data, error } = await db()
    .from('users')
    .select(USER_COLUMNS)
    .eq('privy_id', privyId)
    .maybeSingle()
    .overrideTypes<UserRow | null, { merge: false }>()
  if (error) throw error
  return data
}

export async function findUserByWallet(address: string): Promise<UserRow | null> {
  const { data, error } = await db()
    .from('users')
    .select(USER_COLUMNS)
    .eq('wallet_address', address.toLowerCase())
    .maybeSingle()
    .overrideTypes<UserRow | null, { merge: false }>()
  if (error) throw error
  return data
}

export async function requireUser(request: Request): Promise<UserRow> {
  const privyId = await requirePrivyId(request)
  const row = await findUserByPrivyId(privyId)
  // The embedded account is created right after first login, so re-sync until we have it
  return row?.wallet_address ? row : syncUser(privyId)
}

export async function optionalUser(request: Request): Promise<UserRow | null> {
  const privyId = await privyIdFromRequest(request)
  if (!privyId) return null
  const row = await findUserByPrivyId(privyId)
  return row?.wallet_address ? row : syncUser(privyId)
}

export function requireWallet(row: UserRow) {
  if (!row.wallet_address) throw unauthorized()
  return getAddress(row.wallet_address)
}

export function isOnboarded(row: UserRow): boolean {
  return Boolean(row.handle && row.name && row.terms_accepted_at && row.not_us_person)
}

/**
 * Every money route calls this: onboarded, a country we can serve, and not connecting from a
 * restricted one (Vercel's geo header; absent locally)
 */
export function requireEligible(row: UserRow, request: Request): void {
  if (!isOnboarded(row)) throw forbidden('Finish setting up your account first.', 'not_onboarded')
  const connectingFrom = request.headers.get('x-vercel-ip-country')?.toUpperCase()
  if (
    !row.country ||
    BLOCKED_COUNTRY_CODES.has(row.country) ||
    (connectingFrom && BLOCKED_COUNTRY_CODES.has(connectingFrom))
  )
    throw forbidden('Holdsake isn’t available where you are.', 'restricted')
}

export function toProfile(row: UserRow): Profile {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    email: row.email,
    avatarUrl: avatarUrl(row.avatar_path),
    address: row.wallet_address ? getAddress(row.wallet_address) : null,
    country: row.country,
    onboarded: isOnboarded(row),
  }
}

export function toPublicProfile(
  row: Pick<UserRow, 'handle' | 'name' | 'avatar_path'>,
): PublicProfile {
  return {
    handle: row.handle ?? '',
    name: row.name ?? row.handle ?? 'Someone',
    avatarUrl: avatarUrl(row.avatar_path),
  }
}
