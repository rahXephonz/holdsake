import {
  CHAINLINK_FEEDS,
  EARN_VAULT,
  encodeApprove,
  encodeTransfer,
  encodeVaultDeposit,
  encodeVaultRedeem,
  encodeVaultWithdraw,
  vaultAbi,
} from '@holdsake/sdk'
import { erc20Abi, getAddress, isAddressEqual, parseEventLogs, type Address } from 'viem'
import { z } from 'zod'
import { cached } from '@/lib/server/cache'
import { CASH_ADDRESS, cashDecimals, findStock } from '@/lib/server/catalog'
import { chain } from '@/lib/server/chain'
import { badRequest, logError } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { buildOperation, type Call, type Submitted } from '@/lib/server/operations'
import { db } from '@/lib/server/supabase'
import { balancesOf } from '@/lib/server/tokens'
import { buyCalls } from '@/lib/server/trades'
import { treasury } from '@/lib/server/treasury'
import type { UserRow } from '@/lib/server/users'
import type { EarnView } from '@/lib/types'
import { formatShares, formatUsd } from '@/lib/format'

// Earn (like apys.co, on Morpho): cash goes into one lending vault and stays the person's; what
// the vault grows by above what they put in is interest, which they claim as shares of a stock.
// Nothing moves without their signature, so claiming is a button, not a background job.

const VAULT = getAddress(EARN_VAULT)
const VAULT_KEY = VAULT.toLowerCase()

/**
 * Stocks interest can turn into: ones with a Chainlink feed, so the claim's price check runs
 * against a real reference rather than the pool itself.
 */
export const EARN_TICKERS = Object.keys(CHAINLINK_FEEDS).filter(
  (ticker) => ticker !== 'ETH' && ticker !== 'USDG',
)

/** Below this a claim is mostly fee; the button waits until there's at least this much */
const MIN_CLAIM_USD = 0.25

type PositionRow = { principal_raw: string; target_ticker: string; claimed_raw: string }

async function positionRow(userId: string): Promise<PositionRow> {
  const { data, error } = await db()
    .from('earn_positions')
    .select('principal_raw, target_ticker, claimed_raw')
    .eq('user_id', userId)
    .eq('vault', VAULT_KEY)
    .maybeSingle<PositionRow>()
  if (error) throw error
  return data ?? { principal_raw: '0', target_ticker: 'NVDA', claimed_raw: '0' }
}

async function savePosition(userId: string, patch: Partial<PositionRow>) {
  const { error } = await db()
    .from('earn_positions')
    .upsert({ user_id: userId, vault: VAULT_KEY, ...patch }, { onConflict: 'user_id,vault' })
  if (error) throw error
}

/**
 * The vault's rate and how much cash can leave it right now, from Morpho's API (Vault V2's
 * maxWithdraw always says 0). Display only: a withdrawal that can't be filled fails its estimate
 * before anything is signed.
 */
const marketResponse = z.object({
  data: z
    .object({
      vaultV2ByAddress: z
        .object({ netApy: z.number().nullable(), liquidityUsd: z.number().nullable() })
        .nullable(),
    })
    .optional(),
})

const vaultMarket = cached(5 * 60_000, async () => {
  try {
    const response = await fetch('https://blue-api.morpho.org/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{ vaultV2ByAddress(address: "${VAULT}", chainId: 4663) { netApy liquidityUsd } }`,
      }),
    })
    const body = marketResponse.parse(await response.json())
    const vault = body.data?.vaultV2ByAddress
    return { apy: vault?.netApy ?? null, liquidityUsd: vault?.liquidityUsd ?? null }
  } catch (error) {
    logError('earn rate unavailable', error)
    return { apy: null, liquidityUsd: null }
  }
})

async function sharesAndValue(wallet: Address) {
  const shares = await chain().readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: 'balanceOf',
    args: [wallet],
  })
  const valueRaw =
    shares === 0n
      ? 0n
      : await chain().readContract({
          address: VAULT,
          abi: vaultAbi,
          functionName: 'convertToAssets',
          args: [shares],
        })
  return { shares, valueRaw }
}

export async function earnView(user: UserRow, wallet: Address): Promise<EarnView> {
  const [{ valueRaw }, row, market, decimals, [cashRaw = 0n]] = await Promise.all([
    sharesAndValue(wallet),
    positionRow(user.id),
    vaultMarket(),
    cashDecimals(),
    balancesOf(wallet, [CASH_ADDRESS]),
  ])
  const principal = BigInt(row.principal_raw)
  // Below what they put in only if the vault lost money; then there's nothing to claim
  const interest = valueRaw > principal ? valueRaw - principal : 0n
  return {
    valueRaw: valueRaw.toString(),
    principalRaw: principal.toString(),
    interestRaw: interest.toString(),
    claimedRaw: row.claimed_raw,
    cashRaw: cashRaw.toString(),
    decimals,
    targetTicker: row.target_ticker,
    tickers: EARN_TICKERS,
    apy: market.apy,
    liquidityUsd: market.liquidityUsd,
    minClaimUsd: MIN_CLAIM_USD,
  }
}

export async function setTarget(user: UserRow, ticker: string) {
  if (!EARN_TICKERS.includes(ticker))
    throw badRequest('Pick one of the stocks shown.', 'bad_ticker')
  await savePosition(user.id, { target_ticker: ticker })
}

/** The fee from cash the batch leaves behind, or a plain refusal */
function feeFromCash(feeRaw: bigint, cashLeft: bigint): Call {
  if (cashLeft < feeRaw) throw badRequest('Not enough cash to cover the fee.', 'fee_shortfall')
  return { to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) }
}

/** Puts `amountRaw` of cash to work; the fee comes from the cash that stays */
export async function buildEarnDeposit(input: {
  user: UserRow
  wallet: Address
  amountRaw: bigint
}) {
  const { user, wallet, amountRaw } = input
  if (amountRaw <= 0n) throw badRequest('Enter an amount.')
  const [cash = 0n] = await balancesOf(wallet, [CASH_ADDRESS])
  if (amountRaw > cash) throw badRequest('You don’t have that much cash.', 'insufficient_balance')
  // What actually goes in; less than asked when the fee has to come out of it
  let depositRaw = amountRaw
  let feePaidRaw = 0n
  const built = await buildOperation({
    user,
    sender: wallet,
    kind: 'earn_deposit',
    context: {},
    callsWithFee: (feeRaw) => {
      feePaidRaw = feeRaw
      const cashLeft = cash - amountRaw
      // Putting in everything (or nearly): the fee comes out of what goes in, so "all" works
      depositRaw = cashLeft >= feeRaw ? amountRaw : amountRaw - (feeRaw - cashLeft)
      if (depositRaw <= 0n) throw badRequest('That’s less than the fee. Try a bigger amount.')
      return [
        { to: CASH_ADDRESS, data: encodeApprove(VAULT, depositRaw) },
        { to: VAULT, data: encodeVaultDeposit(depositRaw, wallet) },
        { to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) },
      ]
    },
  })
  return {
    ...built,
    deposit: { depositRaw: depositRaw.toString(), feeRaw: feePaidRaw.toString() },
  }
}

/** Takes `amountRaw` back out, or everything; the fee comes from the cash that arrives */
export async function buildEarnWithdraw(input: {
  user: UserRow
  wallet: Address
  amountRaw: bigint | 'all'
}) {
  const { user, wallet } = input
  const [{ shares, valueRaw }, [cash = 0n], market, decimals] = await Promise.all([
    sharesAndValue(wallet),
    balancesOf(wallet, [CASH_ADDRESS]),
    vaultMarket(),
    cashDecimals(),
  ])
  const all = input.amountRaw === 'all' || input.amountRaw >= valueRaw
  const amountRaw = input.amountRaw === 'all' || all ? valueRaw : input.amountRaw
  if (amountRaw <= 0n) throw badRequest('There’s nothing in Earn to take out.', 'empty')
  const amountUsd = Number(amountRaw) / 10 ** decimals
  if (market.liquidityUsd !== null && amountUsd > market.liquidityUsd)
    throw badRequest(
      `Only ${formatUsd(Math.max(0, market.liquidityUsd))} can come out right now. The rest frees up as borrowers repay.`,
      'not_liquid',
    )
  return buildOperation({
    user,
    sender: wallet,
    kind: 'earn_withdraw',
    context: {},
    callsWithFee: (feeRaw) => [
      // Everything: redeem every share, so no dust is left behind
      {
        to: VAULT,
        data: all ? encodeVaultRedeem(shares, wallet) : encodeVaultWithdraw(amountRaw, wallet),
      },
      feeFromCash(feeRaw, cash + amountRaw),
    ],
  })
}

/** Takes the interest out and buys the person's chosen stock with it, in one signature */
export async function buildEarnClaim(input: { user: UserRow; wallet: Address }) {
  const { user, wallet } = input
  const [{ valueRaw }, row, decimals] = await Promise.all([
    sharesAndValue(wallet),
    positionRow(user.id),
    cashDecimals(),
  ])
  const principal = BigInt(row.principal_raw)
  const interest = valueRaw > principal ? valueRaw - principal : 0n
  if (Number(interest) / 10 ** decimals < MIN_CLAIM_USD)
    throw badRequest(
      `Interest can be claimed once it reaches ${formatUsd(MIN_CLAIM_USD)}.`,
      'below_minimum',
    )
  const stock = await findStock(row.target_ticker)
  if (!stock?.tradable) throw badRequest('That stock can’t be bought right now. Pick another.')

  let expectedShares = 0
  const built = await buildOperation({
    user,
    sender: wallet,
    kind: 'earn_claim',
    context: { ticker: stock.ticker },
    callsWithFee: async (feeRaw) => {
      const swapIn = interest - feeRaw
      if (swapIn <= 0n) throw badRequest('That’s less than the fee. Wait for a little more.')
      const swap = await buyCalls(stock, swapIn)
      expectedShares =
        (Number(swap.out) / 10 ** stock.decimals) * (Number(stock.uiMultiplier) / 1e18)
      return [
        { to: VAULT, data: encodeVaultWithdraw(interest, wallet) },
        ...swap.calls,
        { to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) },
      ]
    },
  })
  return {
    ...built,
    claim: { ticker: stock.ticker, interestRaw: interest.toString(), expectedShares },
  }
}

/** Cash that went from the account into the vault, and back out of it, in this transaction */
function cashFlows(logs: Submitted['logs'], wallet: Address) {
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs }).filter((log) =>
    isAddressEqual(log.address, CASH_ADDRESS),
  )
  const sum = (from: Address, to: Address) =>
    transfers
      .filter((log) => isAddressEqual(log.args.from, from) && isAddressEqual(log.args.to, to))
      .reduce((total, log) => total + log.args.value, 0n)
  return { intoVault: sum(wallet, VAULT), outOfVault: sum(VAULT, wallet) }
}

/** After `submit`: move the person's principal by what actually moved, then tell them */
export async function afterEarn(
  kind: string,
  context: Record<string, unknown>,
  result: Submitted,
  user: { id: string },
  wallet: Address,
) {
  if (!result.success) return
  const row = await positionRow(user.id)
  const principal = BigInt(row.principal_raw)
  const { intoVault, outOfVault } = cashFlows(result.logs, wallet)

  if (kind === 'earn_deposit') {
    await savePosition(user.id, { principal_raw: (principal + intoVault).toString() })
    return
  }
  if (kind === 'earn_withdraw') {
    // Taking out eats into what they put in first; past that it was interest
    const left = principal > outOfVault ? principal - outOfVault : 0n
    await savePosition(user.id, { principal_raw: left.toString() })
    return
  }
  if (kind === 'earn_claim') {
    await savePosition(user.id, {
      claimed_raw: (BigInt(row.claimed_raw) + outOfVault).toString(),
    })
    const ticker = typeof context.ticker === 'string' ? context.ticker : row.target_ticker
    const stock = await findStock(ticker)
    const received = stock
      ? parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: result.logs })
          .filter(
            (log) =>
              isAddressEqual(log.address, stock.address) && isAddressEqual(log.args.to, wallet),
          )
          .reduce((total, log) => total + log.args.value, 0n)
      : 0n
    const shares = stock
      ? (Number(received) / 10 ** stock.decimals) * (Number(stock.uiMultiplier) / 1e18)
      : 0
    await notify({
      userId: user.id,
      kind: 'earn_claimed',
      title: `Your interest bought ${formatShares(shares)} ${ticker}`,
      body: 'The cash you put in is still earning.',
      href: '/earn',
    })
  }
}
