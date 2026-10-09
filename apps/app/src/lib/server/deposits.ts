import { deployments } from '@holdsake/sdk'
import { getAddress, isAddressEqual, isHex, toHex, type Address, type Hex } from 'viem'
import { z } from 'zod'
import { cashDecimals, findGiftAsset } from '@/lib/server/catalog'
import { chain } from '@/lib/server/chain'
import { required } from '@/lib/server/env'
import { logError } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { db } from '@/lib/server/supabase'
import { findUserByWallet, type UserRow } from '@/lib/server/users'
import { formatShares, formatUsd } from '@/lib/format'

// Both the portfolio and the feed poll every 30s; one scan per person per window is plenty
const MIN_INTERVAL_MS = 20_000
const MAX_PAGES = 5

const hex = z.string().refine(isHex)

const scanResponse = z.object({
  error: z.object({ message: z.string() }).optional(),
  result: z
    .object({
      pageKey: z.string().optional(),
      transfers: z.array(
        z.object({
          from: z.string(),
          hash: hex,
          rawContract: z.object({ address: z.string().nullable(), value: z.string().nullable() }),
        }),
      ),
    })
    .optional(),
})

type Transfer = {
  from: Address
  hash: Hex
  token: Address
  amountRaw: bigint
}

/**
 * Tells people about cash and shares that arrived from outside the app ("Maya sent you $25").
 * Reads incoming transfers since the last scan, keeps only canonical cash and stock tokens, and
 * skips anything the app already told them about: their own operations (a trade, a claimed
 * gift, a fund withdrawal) and payouts from our contracts. Never throws.
 */
export async function syncDeposits(user: UserRow): Promise<void> {
  if (!user.wallet_address) return
  try {
    const { data: state, error } = await db()
      .from('users')
      .select('deposits_block, deposits_checked_at')
      .eq('id', user.id)
      .single<{ deposits_block: string | null; deposits_checked_at: string | null }>()
    if (error) throw error
    if (
      state.deposits_checked_at &&
      Date.now() - Date.parse(state.deposits_checked_at) < MIN_INTERVAL_MS
    )
      return

    const latest = await chain().getBlockNumber()
    // First scan starts now: nobody wants their whole history replayed as notifications
    const from = state.deposits_block === null ? null : BigInt(state.deposits_block) + 1n
    const transfers =
      from !== null && from <= latest
        ? await incomingTransfers(getAddress(user.wallet_address), from, latest)
        : []

    for (const transfer of await unexplained(user.id, transfers)) await tell(user.id, transfer)

    await db()
      .from('users')
      .update({ deposits_block: latest.toString(), deposits_checked_at: new Date().toISOString() })
      .eq('id', user.id)
  } catch (error) {
    logError('deposit sync failed', error)
  }
}

/** Alchemy's transfer index; plain eth_getLogs is capped at 10 blocks on their free tier */
async function incomingTransfers(to: Address, from: bigint, toBlock: bigint): Promise<Transfer[]> {
  const transfers: Transfer[] = []
  let pageKey: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetch(required('ROBINHOOD_RPC_URL'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getAssetTransfers',
        params: [
          {
            fromBlock: toHex(from),
            toBlock: toHex(toBlock),
            toAddress: to,
            category: ['erc20'],
            excludeZeroValue: true,
            withMetadata: false,
            maxCount: '0x64',
            ...(pageKey ? { pageKey } : {}),
          },
        ],
      }),
    })
    const body = scanResponse.parse(await response.json())
    if (body.error || !body.result)
      throw new Error(`transfer scan: ${body.error?.message ?? 'no result'}`)
    for (const item of body.result.transfers) {
      if (!item.rawContract.address || !item.rawContract.value) continue
      transfers.push({
        from: getAddress(item.from),
        hash: item.hash,
        token: getAddress(item.rawContract.address),
        amountRaw: BigInt(item.rawContract.value),
      })
    }
    pageKey = body.result.pageKey
    if (!pageKey) break
  }
  return transfers
}

/** Drops what the app already announced, and merges same-token transfers in one transaction */
async function unexplained(userId: string, transfers: Transfer[]): Promise<Transfer[]> {
  if (!transfers.length) return []
  const hashes = [...new Set(transfers.map((transfer) => transfer.hash.toLowerCase()))]
  const { data: own, error } = await db()
    .from('operations')
    .select('tx_hash')
    .eq('user_id', userId)
    .in('tx_hash', hashes)
  if (error) throw error
  const ownHashes = new Set(own.map((row) => String(row.tx_hash).toLowerCase()))
  const contracts = [...deployments.gifts, ...deployments.funds]

  const merged = new Map<string, Transfer>()
  for (const transfer of transfers) {
    if (ownHashes.has(transfer.hash.toLowerCase())) continue
    if (contracts.some((contract) => isAddressEqual(contract, transfer.from))) continue
    const key = `${transfer.hash.toLowerCase()}:${transfer.token.toLowerCase()}`
    const existing = merged.get(key)
    merged.set(
      key,
      existing ? { ...existing, amountRaw: existing.amountRaw + transfer.amountRaw } : transfer,
    )
  }
  return [...merged.values()]
}

async function tell(userId: string, transfer: Transfer): Promise<void> {
  // Canonical tokens only: lookalike tokens are sent to people as bait
  const asset = await findGiftAsset(transfer.token)
  if (!asset) return
  const sender = await findUserByWallet(transfer.from)
  const who = sender?.name ?? (sender?.handle ? `@${sender.handle}` : null)
  const dedupeKey = `deposit:${transfer.hash.toLowerCase()}:${transfer.token.toLowerCase()}`

  if (asset.kind === 'cash') {
    const amount = formatUsd(Number(transfer.amountRaw) / 10 ** (await cashDecimals()))
    await notify({
      userId,
      kind: 'cash_received',
      title: who ? `${who} sent you ${amount}` : `You received ${amount} cash`,
      body: 'It’s in your account now.',
      href: '/',
      dedupeKey,
    })
    return
  }

  const { stock } = asset
  const shares =
    (Number(transfer.amountRaw) / 10 ** stock.decimals) * (Number(stock.uiMultiplier) / 1e18)
  const amount = `${formatShares(shares)} ${shares === 1 ? 'share' : 'shares'} of ${stock.name}`
  await notify({
    userId,
    kind: 'stock_received',
    title: who ? `${who} sent you ${amount}` : `You received ${amount}`,
    body: 'They’re in your account now.',
    href: `/stocks/${stock.ticker}`,
    dedupeKey,
  })
}
