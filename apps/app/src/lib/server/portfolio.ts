import type { Address } from 'viem'
import { CASH_ADDRESS, cashDecimals, catalog, toStock } from '@/lib/server/catalog'
import { dayChanges } from '@/lib/server/changes'
import { rawToMicroUsd } from '@/lib/server/prices'
import { balancesOf } from '@/lib/server/tokens'
import type { Portfolio } from '@/lib/types'

const microToUsd = (micro: bigint) => Number(micro) / 1e6

/** Cash and every listed stock the account holds, valued at Chainlink prices */
export async function portfolioOf(owner: Address): Promise<Portfolio> {
  const entries = await catalog()
  const [balances, decimals, changes] = await Promise.all([
    balancesOf(owner, [CASH_ADDRESS, ...entries.map((entry) => entry.address)]),
    cashDecimals(),
    dayChanges(),
  ])
  const [cashRaw = 0n, ...stockRaws] = balances
  const cashUsd = Number(cashRaw) / 10 ** decimals

  const holdings = entries.flatMap((entry, index) => {
    const amountRaw = stockRaws[index] ?? 0n
    if (amountRaw === 0n) return []
    const tokens = Number(amountRaw) / 10 ** entry.decimals
    return [
      {
        stock: { ...toStock(entry), changePct: changes.get(entry.ticker) ?? null },
        amountRaw: amountRaw.toString(),
        shares: tokens * (Number(entry.uiMultiplier) / 1e18),
        usdValue: entry.valuation
          ? microToUsd(rawToMicroUsd(amountRaw, entry.decimals, entry.valuation))
          : null,
      },
    ]
  })
  holdings.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))

  return {
    cash: { amountRaw: cashRaw.toString(), decimals, usdValue: cashUsd },
    holdings,
    totalUsd: cashUsd + holdings.reduce((sum, holding) => sum + (holding.usdValue ?? 0), 0),
  }
}
