import { CHAINLINK_FEEDS, chainlinkFeedAbi, hasChainlinkFeed } from '@holdsake/sdk'
import { chain } from '@/lib/server/chain'

// Chainlink stock feeds report USD per whole token with the ERC-8056 multiplier already in it
// (AGENT.md "Stock Tokens"), so the multiplier is never applied to a feed price again:
//   pricePerToken  USD per 1e18 raw (what the feed says)
//   pricePerRaw    USD per raw unit = pricePerToken / 10^decimals; anything in raw amounts uses this
//   pricePerShare  USD per underlying share = pricePerToken / (uiMultiplier / 1e18); display only

export type FeedPrice = {
  /** USD per whole token, 8 decimals as the feed reports it */
  answer: bigint
  decimals: number
  updatedAt: Date
}

const FEED_DECIMALS = 8

/** Every feed in one multicall */
export async function readFeeds(
  tickers: readonly (keyof typeof CHAINLINK_FEEDS)[],
): Promise<Map<string, FeedPrice>> {
  // The client batches these reads into one multicall
  const rounds = await Promise.all(
    tickers.map((ticker) =>
      chain()
        .readContract({
          address: CHAINLINK_FEEDS[ticker],
          abi: chainlinkFeedAbi,
          functionName: 'latestRoundData',
        })
        .catch(() => null),
    ),
  )
  const prices = new Map<string, FeedPrice>()
  rounds.forEach((round, index) => {
    const ticker = tickers[index]
    if (!round || !ticker) return
    const [, answer, , updatedAt] = round
    if (answer <= 0n) return
    prices.set(ticker, {
      answer,
      decimals: FEED_DECIMALS,
      updatedAt: new Date(Number(updatedAt) * 1000),
    })
  })
  return prices
}

export const feedToNumber = (price: FeedPrice) => Number(price.answer) / 10 ** price.decimals

/** USD value of a raw amount, in integer micro-dollars to keep the maths in bigint */
export function rawToMicroUsd(amountRaw: bigint, tokenDecimals: number, price: FeedPrice): bigint {
  return (
    (amountRaw * price.answer * 10n ** 6n) /
    (10n ** BigInt(tokenDecimals) * 10n ** BigInt(price.decimals))
  )
}

/** Raw amount worth `microUsd`, rounded up so a floor computed with it is never under the value */
export function microUsdToRaw(microUsd: bigint, tokenDecimals: number, price: FeedPrice): bigint {
  const numerator = microUsd * 10n ** BigInt(tokenDecimals) * 10n ** BigInt(price.decimals)
  const denominator = price.answer * 10n ** 6n
  return (numerator + denominator - 1n) / denominator
}

const HOUR = 3_600_000

/**
 * Stock feeds update 24/5 and stop from Friday evening to Monday 00:00 UTC (gaps of 52–53 h,
 * 78 h over a US holiday weekend; "Verify first" step 7). A plain 24 h heartbeat check fails
 * every weekend, so allow the weekend gap only while we're inside it.
 */
export function isFeedFresh(updatedAt: Date, now = new Date()): boolean {
  const age = now.getTime() - updatedAt.getTime()
  if (age < 0) return false
  if (age <= 26 * HOUR) return true
  const day = now.getUTCDay()
  const inWeekendGap = day === 6 || day === 0 || (day === 1 && now.getUTCHours() < 6)
  return inWeekendGap && age <= 80 * HOUR
}

/** Most rounds read back for a chart: about a day and a half at the feeds' usual pace */
const MAX_HISTORY_ROUNDS = 120n

/**
 * A stock's Chainlink rounds since `sinceSeconds`, as USD per underlying share, oldest first.
 * Rounds are walked back within the current phase (the low 64 bits of the round id), batched
 * into one multicall. Empty for a stock without a feed.
 */
export async function feedHistory(
  stock: { ticker: string; uiMultiplier: string },
  sinceSeconds: number,
): Promise<{ t: number; price: number }[]> {
  if (!hasChainlinkFeed(stock.ticker)) return []
  const feed = CHAINLINK_FEEDS[stock.ticker]
  const [latestId] = await chain().readContract({
    address: feed,
    abi: chainlinkFeedAbi,
    functionName: 'latestRoundData',
  })
  const phaseRound = latestId & ((1n << 64n) - 1n)
  const count = phaseRound < MAX_HISTORY_ROUNDS ? phaseRound : MAX_HISTORY_ROUNDS
  const ids = Array.from({ length: Number(count) }, (_, index) => latestId - BigInt(index))
  const rounds = await Promise.all(
    ids.map((id) =>
      chain()
        .readContract({
          address: feed,
          abi: chainlinkFeedAbi,
          functionName: 'getRoundData',
          args: [id],
        })
        .catch(() => null),
    ),
  )
  const sharesPerToken = Number(stock.uiMultiplier) / 1e18 || 1
  return rounds
    .filter((round) => round !== null)
    .map(([, answer, , updatedAt]) => ({
      t: Number(updatedAt),
      price: Number(answer) / 10 ** FEED_DECIMALS / sharesPerToken,
    }))
    .filter((point) => point.t >= sinceSeconds && point.price > 0)
    .toSorted((a, b) => a.t - b.t)
}
