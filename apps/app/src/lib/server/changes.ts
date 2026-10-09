import {
  CHAINLINK_FEEDS,
  chainlinkFeedAbi,
  hasChainlinkFeed,
  UNISWAP_V4_STATE_VIEW,
} from '@holdsake/sdk'
import { parseAbi } from 'viem'
import { cached } from '@/lib/server/cache'
import { catalog, cashDecimals, type CatalogEntry } from '@/lib/server/catalog'
import { chain } from '@/lib/server/chain'
import { logError } from '@/lib/server/http'
import { cashRawPerToken } from '@/lib/server/pools'

// How much each stock moved over the last 24 hours, for the green/red line under its price.
// The price then is read the same way as the price now (Chainlink where there's a feed, else the
// deepest pool's spot), just at the block from a day ago, so the two always compare like for
// like. No candle store or cron needed: one multicall at an old block, cached for ten minutes.

const DAY_SECONDS = 86_400n
// Far enough back to average out block-time jitter when estimating the block a day ago
const SAMPLE_BLOCKS = 1_000_000n

const slot0Abi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
])

/** The block about 24 hours before the latest one, from the chain's recent block rate */
async function blockADayAgo(): Promise<bigint> {
  const latest = await chain().getBlock()
  const sample = await chain().getBlock({ blockNumber: latest.number - SAMPLE_BLOCKS })
  const elapsed = latest.timestamp - sample.timestamp
  if (elapsed <= 0n) throw new Error('block timestamps out of order')
  return latest.number - (DAY_SECONDS * SAMPLE_BLOCKS) / elapsed
}

/** Price per whole token a day ago, in the same units as `pricePerToken` (USD) */
async function priceThen(entry: CatalogEntry, blockNumber: bigint, cashDec: number) {
  if (entry.feed && hasChainlinkFeed(entry.ticker)) {
    const round = await chain()
      .readContract({
        address: CHAINLINK_FEEDS[entry.ticker],
        abi: chainlinkFeedAbi,
        functionName: 'latestRoundData',
        blockNumber,
      })
      .catch(() => null)
    return round && round[1] > 0n ? Number(round[1]) / 1e8 : null
  }
  const pool = entry.pools[0]
  if (!pool) return null
  const slot0 = await chain()
    .readContract({
      address: UNISWAP_V4_STATE_VIEW,
      abi: slot0Abi,
      functionName: 'getSlot0',
      args: [pool.id],
      blockNumber,
    })
    .catch(() => null)
  if (!slot0 || slot0[0] === 0n) return null
  const raw = cashRawPerToken({ ...pool, sqrtPriceX96: slot0[0] }, entry.decimals)
  return Number(raw) / 10 ** cashDec
}

/** Ticker → percent change over 24 hours; a stock is missing when either price is unknown */
export const dayChanges = cached(10 * 60_000, async (): Promise<Map<string, number>> => {
  const changes = new Map<string, number>()
  try {
    const [entries, blockNumber, cashDec] = await Promise.all([
      catalog(),
      blockADayAgo(),
      cashDecimals(),
    ])
    // The client batches these into multicalls at that block
    const then = await Promise.all(entries.map((entry) => priceThen(entry, blockNumber, cashDec)))
    entries.forEach((entry, index) => {
      const before = then[index]
      const now = entry.pricePerToken
      if (!before || now === null) return
      changes.set(entry.ticker, ((now - before) / before) * 100)
    })
  } catch (error) {
    // A missing day-change is cosmetic: log it, show prices without it
    logError('day changes unavailable', error)
  }
  return changes
})
