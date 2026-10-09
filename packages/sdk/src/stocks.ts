import { CHAINLINK_FEEDS } from './deployments'
import { STOCK_TOKEN_LIST } from './stock-tokens.gen'

export { STOCK_TOKEN_LIST }

export type StockToken = (typeof STOCK_TOKEN_LIST)[number]
export type StockTicker = StockToken['ticker']

export type FeedTicker = keyof typeof CHAINLINK_FEEDS

/** Stocks with a Chainlink feed get a non-DEX price; the rest are priced from their Uniswap pool */
export const hasChainlinkFeed = (ticker: string): ticker is FeedTicker & StockTicker =>
  ticker in CHAINLINK_FEEDS && ticker !== 'ETH' && ticker !== 'USDG'
