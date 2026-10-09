import { stockTokenAbi } from '@holdsake/sdk'
import { erc20Abi, type Address } from 'viem'
import { chain } from '@/lib/server/chain'

const decimalsCache = new Map<string, number>()

/** Read once per token per instance: decimals never change, and are never hard-coded */
export async function decimalsOf(token: Address): Promise<number> {
  const key = token.toLowerCase()
  const known = decimalsCache.get(key)
  if (known !== undefined) return known
  const value = await chain().readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'decimals',
  })
  decimalsCache.set(key, value)
  return value
}

/** 18-decimal fixed point: underlying shares per token. Can change on a corporate action */
export function uiMultipliersOf(tokens: readonly Address[]): Promise<bigint[]> {
  // The client batches these reads into one multicall
  return Promise.all(
    tokens.map((address) =>
      chain()
        .readContract({ address, abi: stockTokenAbi, functionName: 'uiMultiplier' })
        .catch(() => 10n ** 18n),
    ),
  )
}

export function balancesOf(owner: Address, tokens: readonly Address[]): Promise<bigint[]> {
  return Promise.all(
    tokens.map((address) =>
      chain().readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
    ),
  )
}
