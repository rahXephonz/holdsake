import { CHAINLINK_FEEDS, chainlinkFeedAbi } from '@holdsake/sdk'
import { cashDecimals } from '@/lib/server/catalog'
import { chain } from '@/lib/server/chain'
import { cached } from '@/lib/server/cache'
import { HttpError } from '@/lib/server/http'

// Gas is charged at cost, quoted with a small buffer (AGENT.md "Money rules"): 15% headroom on
// the gas price and 15% on the ETH price, paid in cash as one transfer inside the same batch and
// not refunded after.

const BUFFER_BPS = 11_500n
const BPS = 10_000n

/** USD per ETH, 8 decimals. ETH trades all week, so a day-old answer means the feed is broken */
const ethUsd = cached(30_000, async () => {
  const [, answer, , updatedAt] = await chain().readContract({
    address: CHAINLINK_FEEDS.ETH,
    abi: chainlinkFeedAbi,
    functionName: 'latestRoundData',
  })
  const age = Date.now() / 1000 - Number(updatedAt)
  if (answer <= 0n || age > 26 * 3600)
    throw new HttpError(503, 'price_unavailable', 'Prices are catching up. Try again in a minute.')
  return answer
})

/**
 * Share of an operation's gas limits it actually burns. Limits come from the bundler's estimate
 * and run high; charging on them billed about 1.6× the real cost. Measured on mainnet
 * 2026-10-09: a first gift used 394k of 472k (83%). 85% leaves a little room; the two 15%
 * buffers below cover the rest. Re-measure when a flow changes and lower it if real use drops.
 */
const USED_OF_LIMIT_BPS = 8_500n

/** Gas an operation with these limits is expected to burn, for pricing its fee */
export const expectedGasUsed = (gasLimits: bigint) => (gasLimits * USED_OF_LIMIT_BPS) / BPS

export type GasQuote = {
  /** Gas units the operation may use, across validation, execution and L1 data */
  gasUnits: bigint
  /** Wei per gas the operation will offer */
  maxFeePerGas: bigint
}

/**
 * The fee in raw cash units for an operation of this size, rounded up to a tenth of a cent.
 * Pass today's gas price, not the operation's maxFeePerGas: that one already carries headroom
 * for the next block, and stacking it under these buffers charged about twice the real cost
 * (measured 2026-10-09: gift $0.021 real, $0.04 charged).
 */
export async function gasFeeInCash(quote: GasQuote): Promise<bigint> {
  const [ethPrice, decimals] = await Promise.all([ethUsd(), cashDecimals()])
  const weiCost = (quote.gasUnits * quote.maxFeePerGas * BUFFER_BPS) / BPS
  // wei × (USD/ETH · 1e8) × buffer → cash units: ÷ 1e18 wei, ÷ 1e8 feed decimals, × 10^decimals
  const numerator = weiCost * ethPrice * BUFFER_BPS * 10n ** BigInt(decimals)
  const denominator = BPS * 10n ** 18n * 10n ** 8n
  const raw = (numerator + denominator - 1n) / denominator
  // A whole cent would add up to half again on a two-cent fee
  const step = 10n ** BigInt(Math.max(decimals - 3, 0))
  return ((raw + step - 1n) / step) * step
}
