import type { CardTheme } from '@/lib/gift-cards'
// Shapes the API returns. Amounts the browser does maths on travel as decimal strings of raw
// units, with the token's decimals alongside; USD values are plain numbers for display.

export type Profile = {
  id: string
  handle: string | null
  name: string | null
  email: string | null
  avatarUrl: string | null
  /** The person's account address; shown only on the deposit screen */
  address: string | null
  country: string | null
  onboarded: boolean
}

export type PublicProfile = {
  handle: string
  name: string
  avatarUrl: string | null
}

export type Stock = {
  address: string
  ticker: string
  name: string
  decimals: number
  /** Underlying shares per token × 1e18 (ERC-8056); "1000000000000000000" when there's none */
  uiMultiplier: string
  /** USD per whole token from Chainlink (multiplier already in it); maths on raw amounts uses this */
  pricePerToken: number | null
  /** USD per underlying share, what people expect to see as "the price" */
  pricePerShare: number | null
  /** When the price last updated, ISO; stock prices pause over the weekend */
  priceAt: string | null
  /** Chainlink where the stock has a feed, otherwise the live market price of its pool */
  priceSource: 'chainlink' | 'market' | null
  /** Has a market to buy and sell in */
  tradable: boolean
  /** Percent move over the last 24 hours; absent or null when either price is unknown */
  changePct?: number | null
  logoUrl: string | null
}

export type Holding = {
  stock: Stock
  amountRaw: string
  /** Underlying shares, multiplier applied */
  shares: number
  usdValue: number | null
}

export type Portfolio = {
  cash: { amountRaw: string; decimals: number; usdValue: number }
  holdings: Holding[]
  totalUsd: number
}

export type Notification = {
  id: string
  kind: string
  title: string
  body: string
  href: string | null
  read: boolean
  createdAt: string
}

export type GiftItemView = {
  kind: 'cash' | 'stock'
  token: string
  ticker: string | null
  name: string
  amountRaw: string
  /** Underlying shares, stocks only */
  shares: number | null
  usdValue: number | null
  settled: boolean
}

export type GiftView = {
  id: string
  role: 'sender' | 'recipient'
  status: 'draft' | 'pending' | 'opened' | 'claimed' | 'refunded'
  message: string | null
  createdAt: string
  expiresAt: string | null
  expired: boolean
  /** When it was opened or taken back, and that transaction's hash for the receipt link */
  settledAt: string | null
  settleTx: string | null
  /** The greeting card it's wrapped in */
  cardTheme: CardTheme
  sender: { name: string; handle: string | null; avatarUrl: string | null }
  recipient: { name: string; handle: string | null; avatarUrl: string | null }
  items: GiftItemView[]
  totalUsd: number
  canClaim: boolean
  canRefund: boolean
}

/** A gift as seen through its link before signing in: what's inside, never the note */
export type GiftPreview = {
  senderName: string
  senderAvatarUrl: string | null
  recipientName: string | null
  /** Still there to be opened */
  waiting: boolean
  cardTheme: CardTheme
  /** What's inside, never the note */
  items: Pick<GiftItemView, 'kind' | 'ticker' | 'name' | 'shares' | 'usdValue'>[]
}

/** What the browser signs for any on-chain action (see lib/server/operations.ts) */
export type SignRequest = {
  operationId: string
  userOperation: Record<string, string>
  authorization: { contractAddress: `0x${string}`; chainId: number; nonce: number } | null
  feeRaw: string
}

/** Earn: cash lent out through a vault, its interest claimable as shares (raw cash units) */
export type EarnView = {
  /** What the vault holds for them now: principal plus interest */
  valueRaw: string
  principalRaw: string
  interestRaw: string
  /** All interest ever claimed */
  claimedRaw: string
  /** Cash in the account, available to put in */
  cashRaw: string
  decimals: number
  targetTicker: string
  tickers: string[]
  /** Yearly rate after the vault's fee; null when it couldn't be read */
  apy: number | null
  /** Cash that can leave the vault right now, USD; null when unknown */
  liquidityUsd: number | null
  minClaimUsd: number
}

/** A stock that can be borrowed against, as the borrow screen lists it */
export type BorrowMarketView = {
  ticker: string
  name: string
  logoUrl: string | null
  /** Variable yearly rate; null when it couldn't be read */
  apy: number | null
  /** Cash the market can lend right now */
  liquidityUsd: number
  /** Shares of it the person holds, unlocked */
  heldShares: number
  /** What they could borrow now, at our safe line, if they locked all they hold */
  canBorrowUsd: number
  /** Extra taken from the shares when a loan is sold off, percent */
  penaltyPct: number
}

/** An open loan, read back from Morpho */
export type LoanView = {
  ticker: string
  name: string
  logoUrl: string | null
  borrowedUsd: number
  borrowedRaw: string
  lockedShares: number
  lockedRaw: string
  lockedUsd: number
  /** How far the stock can fall before the shares are sold; null with nothing borrowed */
  fallPct: number | null
  liquidationPricePerShare: number | null
  apy: number | null
}

export type BorrowView = { markets: BorrowMarketView[]; loans: LoanView[]; decimals: number }

/** What a confirmed trade actually moved, read from its own transfers (raw token units) */
export type TradeOutcome = { side: 'buy' | 'sell'; spentRaw: string; receivedRaw: string }

/** What `submit` answers once an operation has landed */
export type SubmitResult = { ok: boolean; txHash: string; trade: TradeOutcome | null }

export type FundView = {
  id: string
  name: string
  purpose: string
  beneficiaryName: string
  goalUsd: number | null
  unlockAt: string
  unlocked: boolean
  isCreator: boolean
  isBeneficiary: boolean
  canWithdraw: boolean
  mix: {
    token: string
    ticker: string
    name: string
    percent: number
    balanceRaw: string
    shares: number
    usdValue: number | null
    /** Smallest amount the fund accepts of this stock, raw */
    minRaw: string
  }[]
  totalUsd: number
  createdAt: string
}

export type CompanyProfile = {
  description: string
  sector: string | null
  industry: string | null
  website: string | null
}

export const CHART_RANGES = ['1D', '1W', '1M', '1Y', '5Y'] as const
export type ChartRange = (typeof CHART_RANGES)[number]

export type PricePoint = { t: number; price: number }

export type PriceChart = {
  points: PricePoint[]
  /** 'market' = the listed stock's daily closes; 'recorded' = our own hourly record of our price */
  source: 'market' | 'recorded'
  changePct: number | null
}
