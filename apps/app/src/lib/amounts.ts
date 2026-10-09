// Dollar strings from the keypad to raw token units, in bigint so nothing rounds up past what
// someone typed. Display maths can use numbers; anything sent to the server can't.

export function dollarsToCents(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2))
}

/** Raw units of cash for a dollar amount (cash is $1 per whole unit) */
export const cashRawFor = (dollars: string, decimals: number) =>
  (dollarsToCents(dollars) * 10n ** BigInt(decimals)) / 100n

/** Raw units of a stock worth `dollars` at `pricePerToken`, rounded down */
export function stockRawFor(dollars: string, pricePerToken: number, decimals: number): bigint {
  const priceMicro = BigInt(Math.round(pricePerToken * 1e8))
  if (priceMicro === 0n) return 0n
  return (dollarsToCents(dollars) * 10n ** BigInt(decimals) * 10n ** 8n) / (priceMicro * 100n)
}

export const rawToDollars = (raw: bigint, decimals: number, pricePerToken = 1) =>
  (Number(raw) / 10 ** decimals) * pricePerToken
