import {
  encodeApprove,
  encodePermit2Approve,
  encodeTransfer,
  encodeV4SwapExactInSingle,
  PERMIT2,
  UNISWAP_V4_QUOTER,
  UNIVERSAL_ROUTER,
  v4QuoterAbi,
} from '@holdsake/sdk'
import { erc20Abi, getAddress, isAddressEqual, parseEventLogs, type Address } from 'viem'
import { CASH_ADDRESS, cashDecimals, chargeableFeed, type CatalogEntry } from '@/lib/server/catalog'
import { chain } from '@/lib/server/chain'
import { env } from '@/lib/server/env'
import { badRequest } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { buildOperation, type Call, type Submitted } from '@/lib/server/operations'
import { cashRawPerToken, type MarketPool } from '@/lib/server/pools'
import { db } from '@/lib/server/supabase'
import { balancesOf } from '@/lib/server/tokens'
import { treasury } from '@/lib/server/treasury'
import type { UserRow } from '@/lib/server/users'
import type { TradeOutcome } from '@/lib/types'

// Buy and sell on the stock's deepest hookless Uniswap v4 pool against cash, through the
// Universal Router. Every trade is exact-input with a minimum out, and is refused before signing
// if the price it gets is far from Chainlink (when the stock has a feed) or from the pool's own
// spot price (when it doesn't, which catches thin pools and big orders).

/** Most the received amount may fall short of the quote by the time it lands */
const SLIPPAGE_BPS = 100n
/** Furthest the trade's own price may sit from the reference price */
const MAX_DEVIATION_BPS = 300n
const BPS = 10_000n
/** How long the router accepts the swap; the sponsorship expires sooner anyway */
const DEADLINE_SECONDS = 600

export type Side = 'buy' | 'sell'

const tradeFeeBps = () => BigInt(env().TRADE_FEE_BPS ?? 0)

/** Quotes every live pool and keeps the one that gives the most; refuses when none can fill it */
async function bestRoute(stock: CatalogEntry, side: Side, amountIn: bigint) {
  if (stock.pools.length === 0)
    throw badRequest(`${stock.ticker} can’t be bought or sold here right now.`, 'no_market')
  const quotes = await Promise.all(
    stock.pools.map(async (pool) => ({
      pool,
      out: await quoteSwap(pool, side, amountIn).catch(() => 0n),
    })),
  )
  const best = quotes.reduce((top, quote) => (quote.out > top.out ? quote : top))
  if (best.out === 0n)
    throw badRequest('The market can’t fill that right now. Try a smaller amount.', 'no_quote')
  return best
}

/** What `amountIn` buys or sells for right now, from the quoter (an eth_call, nothing sent) */
export async function quoteSwap(pool: MarketPool, side: Side, amountIn: bigint): Promise<bigint> {
  // Selling pays in the stock; the stock is currency0 exactly when that swap goes zero-for-one
  const zeroForOne = side === 'sell' ? pool.stockIsCurrency0 : !pool.stockIsCurrency0
  try {
    const { result } = await chain().simulateContract({
      address: UNISWAP_V4_QUOTER,
      abi: v4QuoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [{ poolKey: pool.key, zeroForOne, exactAmount: amountIn, hookData: '0x' }],
    })
    return result[0]
  } catch {
    throw badRequest('The market can’t fill that right now. Try a smaller amount.', 'no_quote')
  }
}

/** Cash raw units per whole token at this trade's price */
const impliedCashPerToken = (cashRaw: bigint, stockRaw: bigint, stockDecimals: number) =>
  stockRaw === 0n ? 0n : (cashRaw * 10n ** BigInt(stockDecimals)) / stockRaw

/** Refuses a price too far from the reference: Chainlink when there's a feed, else pool spot */
async function checkPrice(
  stock: CatalogEntry,
  pool: MarketPool,
  cashRaw: bigint,
  stockRaw: bigint,
) {
  // The pool's own fee is a known, shown cost, not a bad price: allow for it on top
  const allowedBps = MAX_DEVIATION_BPS + BigInt(pool.key.fee) / 100n
  const price = impliedCashPerToken(cashRaw, stockRaw, stock.decimals)
  const feed = chargeableFeed(stock)
  const reference = feed
    ? (feed.answer * 10n ** BigInt(await cashDecimals())) / 10n ** BigInt(feed.decimals)
    : cashRawPerToken(pool, stock.decimals)
  if (reference === 0n) throw badRequest('There’s no price for this stock right now.', 'no_price')
  const gap = price > reference ? price - reference : reference - price
  if (gap * BPS > reference * allowedBps)
    throw badRequest(
      'The price right now is too far from the market. Try a smaller amount or try later.',
      'price_out_of_range',
    )
}

/**
 * The calls that turn exactly `cashIn` into shares of `stock` on its best pool, price-checked,
 * landing in the caller's account. Shared by buying and by claiming Earn interest.
 */
export async function buyCalls(stock: CatalogEntry, cashIn: bigint) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)
  const { pool, out } = await bestRoute(stock, 'buy', cashIn)
  await checkPrice(stock, pool, cashIn, out)
  const minOut = (out * (BPS - SLIPPAGE_BPS)) / BPS
  const calls: Call[] = [
    { to: CASH_ADDRESS, data: encodeApprove(PERMIT2, cashIn) },
    {
      to: PERMIT2,
      data: encodePermit2Approve(CASH_ADDRESS, UNIVERSAL_ROUTER, cashIn, Number(deadline)),
    },
    {
      to: UNIVERSAL_ROUTER,
      data: encodeV4SwapExactInSingle({
        poolKey: pool.key,
        zeroForOne: !pool.stockIsCurrency0,
        amountIn: cashIn,
        minAmountOut: minOut,
        deadline,
      }),
    },
  ]
  return { calls, out, minOut, poolFee: pool.key.fee }
}

/**
 * The calls that sell exactly `stockIn` of `stock` for cash on its best pool, price-checked, cash
 * landing in the caller's account. Used to raise a fee from shares that have no Chainlink price.
 */
export async function sellCalls(stock: CatalogEntry, stockIn: bigint) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)
  const { pool, out } = await bestRoute(stock, 'sell', stockIn)
  await checkPrice(stock, pool, out, stockIn)
  const minOut = (out * (BPS - SLIPPAGE_BPS)) / BPS
  const calls: Call[] = [
    { to: stock.address, data: encodeApprove(PERMIT2, stockIn) },
    {
      to: PERMIT2,
      data: encodePermit2Approve(stock.address, UNIVERSAL_ROUTER, stockIn, Number(deadline)),
    },
    {
      to: UNIVERSAL_ROUTER,
      data: encodeV4SwapExactInSingle({
        poolKey: pool.key,
        zeroForOne: pool.stockIsCurrency0,
        amountIn: stockIn,
        minAmountOut: minOut,
        deadline,
      }),
    },
  ]
  return { calls, out, minOut, pool }
}

export type TradeQuote = {
  side: Side
  /** What leaves the account: cash for a buy, shares for a sell (raw) */
  spendRaw: bigint
  /** Expected and minimum arriving: shares for a buy, cash for a sell (raw) */
  receiveRaw: bigint
  minReceiveRaw: bigint
  /** Cash: our integrator fee and the gas fee */
  tradeFeeRaw: bigint
  gasFeeRaw: bigint
  /** The market's own fee, Uniswap units (10_000 = 1%); already inside the amounts above */
  poolFee: number
}

/**
 * Builds a trade. A buy spends exactly `amountRaw` of cash in total: the swap gets what's left
 * after the trade fee and the gas fee. A sell sells exactly `amountRaw` shares and pays both fees
 * from the cash it receives.
 */
export async function buildTrade(input: {
  user: UserRow
  wallet: Address
  stock: CatalogEntry
  side: Side
  amountRaw: bigint
}) {
  const { user, wallet, stock, side, amountRaw } = input
  if (amountRaw <= 0n) throw badRequest('Enter an amount.')
  const [cashBalance = 0n, stockBalance = 0n] = await balancesOf(wallet, [
    CASH_ADDRESS,
    stock.address,
  ])
  if (side === 'buy' && amountRaw > cashBalance)
    throw badRequest('You don’t have that much cash.', 'insufficient_balance')
  if (side === 'sell' && amountRaw > stockBalance)
    throw badRequest(`You don’t have that many ${stock.ticker} shares.`, 'insufficient_balance')

  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)
  const feeTo = treasury()
  let quote: TradeQuote | undefined
  const tradeId = crypto.randomUUID()

  const built = await buildOperation({
    user,
    sender: wallet,
    kind: 'trade',
    context: { tradeId },
    callsWithFee: async (gasFeeRaw) => {
      const calls: Call[] = []
      if (side === 'buy') {
        const tradeFeeRaw = (amountRaw * tradeFeeBps()) / BPS
        const swapIn = amountRaw - tradeFeeRaw - gasFeeRaw
        if (swapIn <= 0n)
          throw badRequest('That’s less than the fee. Try a bigger amount.', 'too_small')
        const swap = await buyCalls(stock, swapIn)
        quote = {
          side,
          spendRaw: amountRaw,
          receiveRaw: swap.out,
          minReceiveRaw: swap.minOut,
          tradeFeeRaw,
          gasFeeRaw,
          poolFee: swap.poolFee,
        }
        calls.push(...swap.calls)
        if (tradeFeeRaw + gasFeeRaw > 0n)
          calls.push({ to: CASH_ADDRESS, data: encodeTransfer(feeTo, tradeFeeRaw + gasFeeRaw) })
        return calls
      }

      const { pool, out } = await bestRoute(stock, 'sell', amountRaw)
      await checkPrice(stock, pool, out, amountRaw)
      const minOut = (out * (BPS - SLIPPAGE_BPS)) / BPS
      const tradeFeeRaw = (minOut * tradeFeeBps()) / BPS
      // Fees leave from the cash this sale brings in, so they must fit inside the minimum
      if (tradeFeeRaw + gasFeeRaw >= minOut)
        throw badRequest('That’s less than the fee. Try a bigger amount.', 'too_small')
      quote = {
        side,
        spendRaw: amountRaw,
        receiveRaw: out,
        minReceiveRaw: minOut,
        tradeFeeRaw,
        gasFeeRaw,
        poolFee: pool.key.fee,
      }
      calls.push(
        { to: stock.address, data: encodeApprove(PERMIT2, amountRaw) },
        {
          to: PERMIT2,
          data: encodePermit2Approve(stock.address, UNIVERSAL_ROUTER, amountRaw, Number(deadline)),
        },
        {
          to: UNIVERSAL_ROUTER,
          data: encodeV4SwapExactInSingle({
            poolKey: pool.key,
            zeroForOne: pool.stockIsCurrency0,
            amountIn: amountRaw,
            minAmountOut: minOut,
            deadline,
          }),
        },
        { to: CASH_ADDRESS, data: encodeTransfer(feeTo, tradeFeeRaw + gasFeeRaw) },
      )
      return calls
    },
  })
  if (!quote) throw new Error('trade quote missing')

  const { error } = await db()
    .from('trades')
    .insert({
      id: tradeId,
      user_id: user.id,
      side,
      token: stock.address.toLowerCase(),
      amount_raw: (side === 'buy' ? quote.receiveRaw : quote.spendRaw).toString(),
      cash_raw: (side === 'buy' ? quote.spendRaw : quote.receiveRaw).toString(),
      fee_raw: (quote.tradeFeeRaw + quote.gasFeeRaw).toString(),
      operation_id: built.operationId,
    })
  if (error) throw error

  return {
    ...built,
    quote: {
      side,
      spendRaw: quote.spendRaw.toString(),
      receiveRaw: quote.receiveRaw.toString(),
      minReceiveRaw: quote.minReceiveRaw.toString(),
      tradeFeeRaw: quote.tradeFeeRaw.toString(),
      gasFeeRaw: quote.gasFeeRaw.toString(),
      poolFee: quote.poolFee,
    },
  }
}

export async function afterTrade(
  context: Record<string, unknown>,
  result: Submitted,
  account: Address,
): Promise<TradeOutcome | null> {
  const tradeId = context.tradeId
  if (typeof tradeId !== 'string') return null
  const { data: trade, error } = await db()
    .from('trades')
    .update({ status: result.success ? 'confirmed' : 'failed', tx_hash: result.txHash })
    .eq('id', tradeId)
    .select('user_id, side, token, amount_raw, cash_raw')
    .single()
    .overrideTypes<
      { user_id: string; side: Side; token: string; amount_raw: string; cash_raw: string },
      { merge: false }
    >()
  if (error || !result.success) return null

  // Exact input, so what was spent is what was quoted; what arrived is whatever the pool paid
  const received = getAddress(trade.side === 'buy' ? trade.token : CASH_ADDRESS)
  const receivedRaw = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: result.logs })
    .filter((log) => isAddressEqual(log.address, received) && isAddressEqual(log.args.to, account))
    .reduce((sum, log) => sum + log.args.value, 0n)
  const outcome: TradeOutcome = {
    side: trade.side,
    spentRaw: trade.side === 'buy' ? trade.cash_raw : trade.amount_raw,
    receivedRaw: receivedRaw.toString(),
  }
  await db()
    .from('trades')
    .update(
      trade.side === 'buy'
        ? { amount_raw: outcome.receivedRaw }
        : { cash_raw: outcome.receivedRaw },
    )
    .eq('id', tradeId)

  await notify({
    userId: trade.user_id,
    kind: trade.side === 'buy' ? 'trade_bought' : 'trade_sold',
    title: trade.side === 'buy' ? 'You bought shares' : 'You sold shares',
    body:
      trade.side === 'buy' ? 'They’re in your account now.' : 'The cash is in your account now.',
    href: '/',
  })
  return outcome
}
