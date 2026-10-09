// Who pays a gift's fee, in order (AGENT.md "Money rules"). Pure so the send screen can mirror it;
// the server's run is the one that counts.
//   1. cash the sender keeps after the gift
//   2. the shortfall from the gift's own cash item, as long as some cash still arrives
//   3. one of the gifted stocks, at its Chainlink price per raw unit
//   4. otherwise refuse before anything is signed

export type PlanItem = {
  token: string
  amountRaw: bigint
  kind: 'cash' | 'stock'
  /** Stocks only: raw units worth `feeRaw` of cash, or null with no usable price */
  rawForCash?: (cashRaw: bigint) => bigint | null
}

export type FeePlan = {
  items: PlanItem[]
  /** What leaves the sender's account for the fee, in which token */
  fee: { token: string; amountRaw: bigint; source: 'kept_cash' | 'gift_cash' | 'stock' }
}

export class FeeShortfall extends Error {
  constructor() {
    super('Not enough cash to cover the fee.')
  }
}

export function planGiftFee(input: {
  feeRaw: bigint
  cashToken: string
  /** Cash the sender keeps after every gift in this send, and every fee planned before this one */
  keptCashRaw: bigint
  items: PlanItem[]
}): FeePlan {
  const { feeRaw, cashToken, keptCashRaw } = input
  const items = input.items.map((item) => ({ ...item }))

  if (keptCashRaw >= feeRaw)
    return { items, fee: { token: cashToken, amountRaw: feeRaw, source: 'kept_cash' } }

  // Whatever kept cash there is goes first; the gift's cash covers only the rest
  const cashItem = items.find((item) => item.kind === 'cash')
  const shortfall = feeRaw - (keptCashRaw > 0n ? keptCashRaw : 0n)
  if (cashItem && cashItem.amountRaw > shortfall) {
    cashItem.amountRaw -= shortfall
    return { items, fee: { token: cashToken, amountRaw: feeRaw, source: 'gift_cash' } }
  }

  for (const item of items) {
    if (item.kind !== 'stock' || !item.rawForCash) continue
    const raw = item.rawForCash(feeRaw)
    if (raw === null || raw <= 0n || raw >= item.amountRaw) continue
    item.amountRaw -= raw
    return { items, fee: { token: item.token, amountRaw: raw, source: 'stock' } }
  }

  throw new FeeShortfall()
}
