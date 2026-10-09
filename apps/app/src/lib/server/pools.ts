import {
  MAX_POOL_FEE,
  STOCK_POOL_CANDIDATES,
  UNISWAP_V4_STATE_VIEW,
  USDG,
  type PoolKey,
} from '@holdsake/sdk'
import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem'
import { chain } from '@/lib/server/chain'

// Each stock's market: its deepest Uniswap v4 pool against cash, among the candidates found by
// scanning the PoolManager (packages/sdk/src/stock-pools.gen.ts). Only hookless pools at a fee of
// 1% or less: a hook runs its own code on every swap, and lookalike pools charge up to 96%.

const stateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)',
])

export type MarketPool = {
  key: PoolKey
  id: Hex
  /** True when the stock is currency0, so selling it is a zeroForOne swap */
  stockIsCurrency0: boolean
  sqrtPriceX96: bigint
  liquidity: bigint
}

const CASH = getAddress(USDG)

export function poolKeyFor(stock: Address, fee: number, tickSpacing: number): PoolKey {
  const stockIsCurrency0 = stock.toLowerCase() < CASH.toLowerCase()
  return {
    currency0: stockIsCurrency0 ? stock : CASH,
    currency1: stockIsCurrency0 ? CASH : stock,
    fee,
    tickSpacing,
    hooks: zeroAddress,
  }
}

export const poolIdOf = (key: PoolKey): Hex =>
  keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint24' },
        { type: 'int24' },
        { type: 'address' },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  )

/** Each stock's candidate pools with liquidity in range, deepest first */
export async function livePools(
  stocks: readonly { ticker: string; address: Address }[],
): Promise<MarketPool[][]> {
  const candidates = stocks.flatMap(({ ticker, address }) =>
    (STOCK_POOL_CANDIDATES[ticker] ?? [])
      // The generated list already holds this; checked again so a bad edit can't route through a trap
      .filter(({ fee }) => fee <= MAX_POOL_FEE)
      .map(({ fee, tickSpacing }) => {
        const key = poolKeyFor(address, fee, tickSpacing)
        return { stock: address, key, id: poolIdOf(key) }
      }),
  )
  // The client batches these reads into multicalls
  const reads = await Promise.all(
    candidates.map(async ({ id }) => {
      const [slot0, liquidity] = await Promise.all([
        chain()
          .readContract({
            address: UNISWAP_V4_STATE_VIEW,
            abi: stateViewAbi,
            functionName: 'getSlot0',
            args: [id],
          })
          .catch(() => null),
        chain()
          .readContract({
            address: UNISWAP_V4_STATE_VIEW,
            abi: stateViewAbi,
            functionName: 'getLiquidity',
            args: [id],
          })
          .catch(() => 0n),
      ])
      return { sqrtPriceX96: slot0?.[0] ?? 0n, liquidity }
    }),
  )
  return stocks.map(({ address: stock }) => {
    const live: MarketPool[] = []
    for (const [index, candidate] of candidates.entries()) {
      const read = reads[index]
      if (candidate.stock !== stock || !read) continue
      if (read.sqrtPriceX96 === 0n || read.liquidity === 0n) continue
      live.push({
        key: candidate.key,
        id: candidate.id,
        stockIsCurrency0: candidate.key.currency0 === stock,
        sqrtPriceX96: read.sqrtPriceX96,
        liquidity: read.liquidity,
      })
    }
    return live.toSorted((a, b) =>
      b.liquidity > a.liquidity ? 1 : b.liquidity < a.liquidity ? -1 : 0,
    )
  })
}

const Q192 = 2n ** 192n

/**
 * Spot price as cash raw units per whole stock token, from sqrtPriceX96 (currency1 per currency0
 * in raw units, squared). Display and sanity checks only; trades use the quoter.
 */
export function cashRawPerToken(pool: MarketPool, stockDecimals: number): bigint {
  const ratioX192 = pool.sqrtPriceX96 * pool.sqrtPriceX96
  const oneToken = 10n ** BigInt(stockDecimals)
  if (pool.stockIsCurrency0) return (ratioX192 * oneToken) / Q192
  return ratioX192 === 0n ? 0n : (Q192 * oneToken) / ratioX192
}
