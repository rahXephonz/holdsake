import { hasChainlinkFeed, STOCK_TOKEN_LIST, USDG, type StockTicker } from '@holdsake/sdk'
import { getAddress, isAddress, type Address } from 'viem'
import { cached } from '@/lib/server/cache'
import { HttpError } from '@/lib/server/http'
import { cashRawPerToken, livePools, type MarketPool } from '@/lib/server/pools'
import { feedToNumber, isFeedFresh, readFeeds, type FeedPrice } from '@/lib/server/prices'
import { decimalsOf, uiMultipliersOf } from '@/lib/server/tokens'
import type { Stock } from '@/lib/types'

export type CatalogEntry = Stock & {
  address: Address
  ticker: StockTicker
  /** Chainlink, when the stock has a feed: the only price fees and checks may lean on */
  feed: FeedPrice | null
  /** Live cash pools, deepest first: the stock is valued at the first, trades take the best quote */
  pools: MarketPool[]
  /** What a holding is worth: the feed if there is one, else the pool's spot price */
  valuation: FeedPrice | null
}

const ONE = 10n ** 18n
export const CASH_ADDRESS = getAddress(USDG)
export const cashDecimals = () => decimalsOf(CASH_ADDRESS)

/** A pool's spot price in the same 8-decimal shape as a feed answer */
function poolValuation(pool: MarketPool, stockDecimals: number, cashDec: number): FeedPrice {
  const raw = cashRawPerToken(pool, stockDecimals)
  return {
    answer: (raw * 10n ** 8n) / 10n ** BigInt(cashDec),
    decimals: 8,
    updatedAt: new Date(),
  }
}

const loadCatalog = cached(60_000, async (): Promise<CatalogEntry[]> => {
  const addresses = STOCK_TOKEN_LIST.map((token) => getAddress(token.address))
  const feedTickers = STOCK_TOKEN_LIST.map((token) => token.ticker).filter(hasChainlinkFeed)
  const [decimals, multipliers, feeds, pools, cashDec] = await Promise.all([
    Promise.all(addresses.map((address) => decimalsOf(address))),
    uiMultipliersOf(addresses),
    readFeeds(feedTickers),
    livePools(
      STOCK_TOKEN_LIST.map((token) => ({
        ticker: token.ticker,
        address: getAddress(token.address),
      })),
    ),
    cashDecimals(),
  ])
  // Every read failing at once means the chain is unreachable, not that nothing trades: fail
  // loudly (and leave nothing cached) instead of showing every stock as unpriced
  if (feeds.size === 0 && pools.every((stockPools) => stockPools.length === 0))
    throw new HttpError(503, 'chain_unreachable', 'Prices are catching up. Try again in a minute.')

  return STOCK_TOKEN_LIST.map((token, index) => {
    const tokenDecimals = decimals[index] ?? 18
    const feed = feeds.get(token.ticker) ?? null
    const stockPools = pools[index] ?? []
    const pool = stockPools[0] ?? null
    const valuation = feed ?? (pool ? poolValuation(pool, tokenDecimals, cashDec) : null)
    const multiplier = multipliers[index] ?? ONE
    const pricePerToken = valuation ? feedToNumber(valuation) : null
    return {
      address: addresses[index] ?? getAddress(token.address),
      ticker: token.ticker,
      name: token.name,
      decimals: tokenDecimals,
      uiMultiplier: multiplier.toString(),
      pricePerToken,
      pricePerShare:
        pricePerToken === null || multiplier === 0n
          ? null
          : pricePerToken / (Number(multiplier) / 1e18),
      priceAt: feed ? feed.updatedAt.toISOString() : pool ? new Date().toISOString() : null,
      priceSource: feed ? 'chainlink' : pool ? 'market' : null,
      tradable: pool !== null,
      logoUrl: `https://financialmodelingprep.com/image-stock/${encodeURIComponent(token.ticker)}.png`,
      feed,
      pools: stockPools,
      valuation,
    }
  })
})

export const catalog = loadCatalog

/** Public shape: no bigint internals */
export const toStock = ({
  feed: _feed,
  pools: _pools,
  valuation: _valuation,
  ...stock
}: CatalogEntry): Stock => stock

/** A Chainlink price that's fresh enough to charge against; never a pool price */
export const chargeableFeed = (entry: CatalogEntry): FeedPrice | null =>
  entry.feed && isFeedFresh(entry.feed.updatedAt) ? entry.feed : null

/** By ticker or address; only canonical Stock Tokens ever resolve */
export async function findStock(tickerOrAddress: string): Promise<CatalogEntry | null> {
  const entries = await catalog()
  if (isAddress(tickerOrAddress)) {
    const address = tickerOrAddress.toLowerCase()
    return entries.find((entry) => entry.address.toLowerCase() === address) ?? null
  }
  const ticker = tickerOrAddress.toUpperCase()
  return entries.find((entry) => entry.ticker === ticker) ?? null
}

export const isCash = (address: string) => address.toLowerCase() === USDG.toLowerCase()

/** A gift item is a stock or cash */
export async function findGiftAsset(
  address: string,
): Promise<{ kind: 'cash' } | { kind: 'stock'; stock: CatalogEntry } | null> {
  if (isCash(address)) return { kind: 'cash' }
  const stock = await findStock(address)
  return stock ? { kind: 'stock', stock } : null
}
