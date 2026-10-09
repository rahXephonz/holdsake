import {
  BORROW_MARKETS,
  encodeApprove,
  encodeBorrow,
  encodeRepay,
  encodeSupplyCollateral,
  encodeTransfer,
  encodeWithdrawCollateral,
  MORPHO_BLUE,
  morphoBlueAbi,
  morphoOracleAbi,
  type MorphoMarketParams,
} from '@holdsake/sdk'
import { getAddress, type Address, type Hex } from 'viem'
import { z } from 'zod'
import { cached } from '@/lib/server/cache'
import {
  CASH_ADDRESS,
  cashDecimals,
  chargeableFeed,
  findStock,
  type CatalogEntry,
} from '@/lib/server/catalog'
import { chain } from '@/lib/server/chain'
import { badRequest, logError } from '@/lib/server/http'
import { buildOperation, type Call } from '@/lib/server/operations'
import { microUsdToRaw } from '@/lib/server/prices'
import { balancesOf } from '@/lib/server/tokens'
import { treasury } from '@/lib/server/treasury'
import type { UserRow } from '@/lib/server/users'
import type { BorrowMarketView, BorrowView, LoanView } from '@/lib/types'
import { formatUsd } from '@/lib/format'

// Borrow cash against shares on Morpho Blue (AGENT.md "Borrow on Morpho"): the shares go in as
// collateral, cash comes out to the person's own account, and Morpho is the book. We build what
// they sign and read positions back from Morpho; nothing about a loan is stored on our side.

const MORPHO = getAddress(MORPHO_BLUE)
const WAD = 10n ** 18n
const ORACLE_SCALE = 10n ** 36n
// Morpho's share accounting adds these so empty markets price shares sanely
const VIRTUAL_SHARES = 10n ** 6n
const VIRTUAL_ASSETS = 1n

/**
 * The most we let anyone borrow against their shares, as a share of what they're worth. Morpho
 * would allow the market's LLTV (62.5%); stopping at 50% means the stock has to fall about 20%
 * from the most-borrowed point before anything is sold, and a weekend gap is less likely to do it.
 */
const SAFE_LTV_BPS = 5_000n
const BPS = 10_000n

type Ticker = keyof typeof BORROW_MARKETS
const isTicker = (value: string): value is Ticker => value in BORROW_MARKETS
const TICKERS = Object.keys(BORROW_MARKETS).filter(isTicker)

/** Market parameters never change for a market id: read once */
const marketParams = cached(24 * 3600_000, async () => {
  const entries = await Promise.all(
    TICKERS.map(async (ticker) => {
      const [loanToken, collateralToken, oracle, irm, lltv] = await chain().readContract({
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: 'idToMarketParams',
        args: [BORROW_MARKETS[ticker]],
      })
      const params: MorphoMarketParams = { loanToken, collateralToken, oracle, irm, lltv }
      return [ticker, params] as const
    }),
  )
  return new Map(entries)
})

const apiResponse = z.object({
  data: z
    .object({
      markets: z.object({
        items: z.array(
          z.object({
            marketId: z.string(),
            state: z.object({ borrowApy: z.number().nullable() }).nullable(),
          }),
        ),
      }),
    })
    .optional(),
})

/** Each market's borrow rate from Morpho's API, for display; null when it can't be read */
const borrowRates = cached(5 * 60_000, async (): Promise<Map<string, number>> => {
  try {
    const ids = TICKERS.map((ticker) => `"${BORROW_MARKETS[ticker]}"`).join(',')
    const response = await fetch('https://blue-api.morpho.org/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{ markets(where: { chainId_in: [4663], uniqueKey_in: [${ids}] }) { items { marketId state { borrowApy } } } }`,
      }),
    })
    const body = apiResponse.parse(await response.json())
    const rates = new Map<string, number>()
    for (const item of body.data?.markets.items ?? [])
      if (item.state?.borrowApy != null)
        rates.set(item.marketId.toLowerCase(), item.state.borrowApy)
    return rates
  } catch (error) {
    logError('borrow rates unavailable', error)
    return new Map()
  }
})

const toAssetsUp = (shares: bigint, totalAssets: bigint, totalShares: bigint) => {
  const numerator = shares * (totalAssets + VIRTUAL_ASSETS)
  const denominator = totalShares + VIRTUAL_SHARES
  return (numerator + denominator - 1n) / denominator
}

type MarketState = {
  ticker: Ticker
  id: Hex
  params: MorphoMarketParams
  stock: CatalogEntry
  /** Loan units per collateral unit, ×1e36 (Morpho oracle) */
  price: bigint
  liquidityRaw: bigint
  totalBorrowAssets: bigint
  totalBorrowShares: bigint
}

async function marketState(ticker: Ticker): Promise<MarketState> {
  const id = BORROW_MARKETS[ticker]
  const params = (await marketParams()).get(ticker)
  const stock = await findStock(ticker)
  if (!params || !stock) throw badRequest('That stock can’t be borrowed against.')
  const [market, price] = await Promise.all([
    chain().readContract({
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: 'market',
      args: [id],
    }),
    chain().readContract({ address: params.oracle, abi: morphoOracleAbi, functionName: 'price' }),
  ])
  const [totalSupplyAssets, , totalBorrowAssets, totalBorrowShares] = market
  return {
    ticker,
    id,
    params,
    stock,
    price,
    liquidityRaw:
      totalSupplyAssets > totalBorrowAssets ? totalSupplyAssets - totalBorrowAssets : 0n,
    totalBorrowAssets,
    totalBorrowShares,
  }
}

async function positionOf(state: MarketState, wallet: Address) {
  const [, borrowShares, collateral] = await chain().readContract({
    address: MORPHO,
    abi: morphoBlueAbi,
    functionName: 'position',
    args: [state.id, wallet],
  })
  const borrowedRaw =
    borrowShares === 0n
      ? 0n
      : toAssetsUp(borrowShares, state.totalBorrowAssets, state.totalBorrowShares)
  return { borrowShares, collateral, borrowedRaw }
}

/** Cash value of `collateralRaw` shares at the market's own oracle price */
const valueOf = (state: MarketState, collateralRaw: bigint) =>
  (collateralRaw * state.price) / ORACLE_SCALE

/** Underlying shares in `raw` token units (the multiplier applied once) */
const sharesOf = (stock: CatalogEntry, raw: bigint) =>
  (Number(raw) / 10 ** stock.decimals) * (Number(stock.uiMultiplier) / 1e18)

/** Liquidation numbers for a loan: how far the stock can fall, and the price that sells it */
function risk(state: MarketState, collateralRaw: bigint, borrowedRaw: bigint, decimals: number) {
  const value = valueOf(state, collateralRaw)
  const limit = (value * state.params.lltv) / WAD
  if (borrowedRaw === 0n || limit === 0n) return { fallPct: null, liquidationPricePerShare: null }
  const fallPct = Math.max(0, (1 - Number(borrowedRaw) / Number(limit)) * 100)
  // The stock's price per share today, from the same oracle, scaled down by the fall
  const pricePerToken = Number(valueOf(state, 10n ** BigInt(state.stock.decimals))) / 10 ** decimals
  const pricePerShare = pricePerToken / (Number(state.stock.uiMultiplier) / 1e18)
  return { fallPct, liquidationPricePerShare: pricePerShare * (1 - fallPct / 100) }
}

/** What Morpho takes on top when a loan is sold off: 1/(0.3·LLTV + 0.7), capped at 15% */
const penaltyPct = (lltv: bigint) =>
  Math.min(15, (1 / (0.3 * (Number(lltv) / 1e18) + 0.7) - 1) * 100)

export async function borrowView(wallet: Address): Promise<BorrowView> {
  const [states, rates, decimals] = await Promise.all([
    Promise.all(TICKERS.map((ticker) => marketState(ticker))),
    borrowRates(),
    cashDecimals(),
  ])
  const balances = await balancesOf(
    wallet,
    states.map((state) => state.stock.address),
  )
  const cash = (raw: bigint) => Number(raw) / 10 ** decimals

  const markets: BorrowMarketView[] = []
  const loans: LoanView[] = []
  for (const [index, state] of states.entries()) {
    const position = await positionOf(state, wallet)
    const heldRaw = balances[index] ?? 0n
    const lockedValue = valueOf(state, position.collateral)
    const heldValue = valueOf(state, heldRaw)
    // What more could be borrowed if every share held were locked too, at the safe line
    const room = ((lockedValue + heldValue) * SAFE_LTV_BPS) / BPS - position.borrowedRaw
    const canBorrowRaw = room > 0n ? (room < state.liquidityRaw ? room : state.liquidityRaw) : 0n
    markets.push({
      ticker: state.ticker,
      name: state.stock.name,
      logoUrl: state.stock.logoUrl,
      apy: rates.get(state.id.toLowerCase()) ?? null,
      liquidityUsd: cash(state.liquidityRaw),
      heldShares: sharesOf(state.stock, heldRaw),
      canBorrowUsd: cash(canBorrowRaw),
      penaltyPct: penaltyPct(state.params.lltv),
    })
    if (position.collateral > 0n || position.borrowedRaw > 0n) {
      const { fallPct, liquidationPricePerShare } = risk(
        state,
        position.collateral,
        position.borrowedRaw,
        decimals,
      )
      loans.push({
        ticker: state.ticker,
        name: state.stock.name,
        logoUrl: state.stock.logoUrl,
        borrowedUsd: cash(position.borrowedRaw),
        borrowedRaw: position.borrowedRaw.toString(),
        lockedShares: sharesOf(state.stock, position.collateral),
        lockedRaw: position.collateral.toString(),
        lockedUsd: cash(lockedValue),
        fallPct,
        liquidationPricePerShare,
        apy: rates.get(state.id.toLowerCase()) ?? null,
      })
    }
  }
  return { markets, loans, decimals }
}

function toTicker(value: string): Ticker {
  if (!isTicker(value)) throw badRequest('That stock can’t be borrowed against.')
  return value
}

/**
 * Locks as many of the person's shares as the loan needs (never more than they hold), borrows,
 * and pays the fee from the cash that arrives, in one signature.
 */
export async function buildBorrow(input: {
  user: UserRow
  wallet: Address
  ticker: string
  borrowRaw: bigint
}) {
  const { user, wallet, borrowRaw } = input
  if (borrowRaw <= 0n) throw badRequest('Enter an amount.')
  const state = await marketState(toTicker(input.ticker))
  const [position, [heldRaw = 0n, cashRaw = 0n], decimals] = await Promise.all([
    positionOf(state, wallet),
    balancesOf(wallet, [state.stock.address, CASH_ADDRESS]),
    cashDecimals(),
  ])
  if (borrowRaw > state.liquidityRaw)
    throw badRequest(
      `Only ${formatUsd(Number(state.liquidityRaw) / 10 ** decimals)} can be borrowed against ${state.ticker} right now.`,
      'not_liquid',
    )

  // Shares needed so the whole loan sits at the safe line, less what's already locked
  const owed = position.borrowedRaw + borrowRaw
  const valueNeeded = (owed * BPS + SAFE_LTV_BPS - 1n) / SAFE_LTV_BPS
  const perUnit = state.price
  const collateralNeeded = (valueNeeded * ORACLE_SCALE + perUnit - 1n) / perUnit
  const lockRaw =
    collateralNeeded > position.collateral ? collateralNeeded - position.collateral : 0n
  if (lockRaw > heldRaw) {
    const max =
      (valueOf(state, position.collateral + heldRaw) * SAFE_LTV_BPS) / BPS - position.borrowedRaw
    throw badRequest(
      `You can borrow up to ${formatUsd(Math.max(0, Number(max) / 10 ** decimals))} against your ${state.ticker}.`,
      'over_limit',
    )
  }

  const built = await buildOperation({
    user,
    sender: wallet,
    kind: 'borrow_open',
    context: { ticker: state.ticker },
    callsWithFee: (feeRaw) => {
      if (cashRaw + borrowRaw < feeRaw)
        throw badRequest('That’s less than the fee. Borrow a bit more.')
      const calls: Call[] = []
      if (lockRaw > 0n)
        calls.push(
          { to: state.stock.address, data: encodeApprove(MORPHO, lockRaw) },
          { to: MORPHO, data: encodeSupplyCollateral(state.params, lockRaw, wallet) },
        )
      calls.push(
        { to: MORPHO, data: encodeBorrow(state.params, borrowRaw, wallet) },
        { to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) },
      )
      return calls
    },
  })
  const after = risk(state, position.collateral + lockRaw, owed, decimals)
  return {
    ...built,
    loan: {
      ticker: state.ticker,
      borrowRaw: borrowRaw.toString(),
      lockShares: sharesOf(state.stock, lockRaw),
      lockUsd: Number(valueOf(state, lockRaw)) / 10 ** decimals,
      fallPct: after.fallPct,
      liquidationPricePerShare: after.liquidationPricePerShare,
      penaltyPct: penaltyPct(state.params.lltv),
      apy: (await borrowRates()).get(state.id.toLowerCase()) ?? null,
    },
  }
}

/** Pays back part of a loan, or all of it (by shares, so no dust of debt is left) */
export async function buildRepay(input: {
  user: UserRow
  wallet: Address
  ticker: string
  amountRaw: bigint | 'all'
}) {
  const { user, wallet } = input
  const state = await marketState(toTicker(input.ticker))
  const [position, [cashRaw = 0n]] = await Promise.all([
    positionOf(state, wallet),
    balancesOf(wallet, [CASH_ADDRESS]),
  ])
  if (position.borrowShares === 0n) throw badRequest('There’s nothing to pay back.', 'no_loan')
  const all = input.amountRaw === 'all' || input.amountRaw >= position.borrowedRaw
  // Interest keeps accruing until it lands: allow a little over today's figure when closing
  const pull =
    input.amountRaw === 'all' || all
      ? position.borrowedRaw + position.borrowedRaw / 1000n + 10n
      : input.amountRaw
  return buildOperation({
    user,
    sender: wallet,
    kind: 'borrow_repay',
    context: { ticker: state.ticker },
    callsWithFee: (feeRaw) => {
      if (cashRaw < pull + feeRaw)
        throw badRequest(
          all
            ? 'You need a little more cash to pay it all back, fee included.'
            : 'You don’t have that much cash, fee included.',
          'insufficient_balance',
        )
      return [
        { to: CASH_ADDRESS, data: encodeApprove(MORPHO, pull) },
        {
          to: MORPHO,
          data: encodeRepay(
            state.params,
            all ? { shares: position.borrowShares } : { assets: pull },
            wallet,
          ),
        },
        // Closing approves a small margin for interest; take any unused allowance back to zero
        ...(all ? [{ to: CASH_ADDRESS, data: encodeApprove(MORPHO, 0n) }] : []),
        { to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) },
      ]
    },
  })
}

/** Takes locked shares back, as long as what stays locked still covers the loan safely */
export async function buildTakeBack(input: {
  user: UserRow
  wallet: Address
  ticker: string
  amountRaw: bigint | 'all'
}) {
  const { user, wallet } = input
  const state = await marketState(toTicker(input.ticker))
  const [position, [cashRaw = 0n]] = await Promise.all([
    positionOf(state, wallet),
    balancesOf(wallet, [CASH_ADDRESS]),
  ])
  const amountRaw =
    input.amountRaw === 'all' || input.amountRaw > position.collateral
      ? position.collateral
      : input.amountRaw
  if (amountRaw <= 0n) throw badRequest('There are no shares to take back.', 'no_collateral')
  const left = position.collateral - amountRaw
  if (position.borrowedRaw > (valueOf(state, left) * SAFE_LTV_BPS) / BPS)
    throw badRequest(
      'Pay some back first: that would leave too little behind the loan.',
      'would_be_unsafe',
    )
  return buildOperation({
    user,
    sender: wallet,
    kind: 'borrow_withdraw',
    context: { ticker: state.ticker },
    callsWithFee: (feeRaw) => {
      const calls: Call[] = [
        { to: MORPHO, data: encodeWithdrawCollateral(state.params, amountRaw, wallet) },
      ]
      if (cashRaw >= feeRaw) {
        calls.push({ to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) })
        return calls
      }
      // No cash: the fee comes out of the shares coming back, at their Chainlink price
      const feed = chargeableFeed(state.stock)
      if (!feed) throw badRequest('Not enough cash to cover the fee.', 'fee_shortfall')
      const feeShares = microUsdToRaw(feeRaw, state.stock.decimals, feed)
      if (feeShares >= amountRaw)
        throw badRequest('Not enough cash to cover the fee.', 'fee_shortfall')
      calls.push({ to: state.stock.address, data: encodeTransfer(treasury(), feeShares) })
      return calls
    },
  })
}
