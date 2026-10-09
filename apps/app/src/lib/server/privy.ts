import { NotFoundError, PrivyClient, type User } from '@privy-io/node'
import { getAddress, type Address } from 'viem'
import { required } from '@/lib/server/env'
import { unauthorized } from '@/lib/server/http'

let client: PrivyClient | undefined

export function privy(): PrivyClient {
  client ??= new PrivyClient({
    appId: required('VITE_PRIVY_APP_ID'),
    appSecret: required('PRIVY_APP_SECRET'),
  })
  return client
}

/** Privy user id (DID) from the `Authorization: Bearer <access token>` header */
export async function privyIdFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  try {
    return (await privy().utils().auth().verifyAccessToken(token)).user_id
  } catch {
    return null
  }
}

export async function requirePrivyId(request: Request): Promise<string> {
  const privyId = await privyIdFromRequest(request)
  if (!privyId) throw unauthorized()
  return privyId
}

/** The embedded EVM account Privy made for this person; never an external wallet they linked */
export function walletOf(user: User): Address | null {
  for (const account of user.linked_accounts) {
    if (
      account.type === 'wallet' &&
      'chain_type' in account &&
      account.chain_type === 'ethereum' &&
      'connector_type' in account &&
      account.connector_type === 'embedded'
    ) {
      return getAddress(account.address)
    }
  }
  return null
}

export function emailOf(user: User): string | null {
  for (const account of user.linked_accounts) {
    if (account.type === 'email') return account.address.toLowerCase()
  }
  for (const account of user.linked_accounts) {
    if (account.type === 'google_oauth') return account.email.toLowerCase()
    if (account.type === 'apple_oauth' && account.email) return account.email.toLowerCase()
  }
  return null
}

async function pregenerateWallet(userId: string): Promise<Address> {
  const updated = await privy()
    .users()
    .pregenerateWallets(userId, { wallets: [{ chain_type: 'ethereum' }] })
  const wallet = walletOf(updated)
  if (!wallet) throw new Error(`Privy returned no account for user ${userId}`)
  return wallet
}

/** The account for this email if Privy already has one; never creates anything */
export async function findWalletForEmail(email: string): Promise<Address | null> {
  try {
    return walletOf(await privy().users().getByEmailAddress({ address: email }))
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
}

/**
 * The account that belongs to whoever proves this email with a login code. Creates the Privy
 * user and pregenerates the account if the person has never signed in, so a gift can be locked
 * to them before they arrive. Only ever called while actually sending a gift.
 */
export async function walletForEmail(email: string): Promise<Address> {
  let user: User
  try {
    user = await privy().users().getByEmailAddress({ address: email })
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error
    user = await privy()
      .users()
      .create({
        linked_accounts: [{ type: 'email', address: email }],
        wallets: [{ chain_type: 'ethereum' }],
      })
  }
  return walletOf(user) ?? pregenerateWallet(user.id)
}
