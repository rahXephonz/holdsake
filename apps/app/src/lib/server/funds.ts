import {
  deployments,
  encodeApprove,
  encodeContribute,
  encodeCreateFund,
  encodeTransfer,
  encodeWithdraw,
  holdsakeFundsAbi,
} from '@holdsake/sdk'
import { parseEventLogs, getAddress, isAddressEqual, type Address } from 'viem'
import {
  CASH_ADDRESS,
  cashDecimals,
  chargeableFeed,
  findStock,
  type CatalogEntry,
} from '@/lib/server/catalog'
import { chain } from '@/lib/server/chain'
import { badRequest, forbidden, HttpError, notFound } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { buildOperation, type Call, type Submitted } from '@/lib/server/operations'
import { microUsdToRaw, rawToMicroUsd } from '@/lib/server/prices'
import { db } from '@/lib/server/supabase'
import { balancesOf } from '@/lib/server/tokens'
import { treasury } from '@/lib/server/treasury'
import { buyCalls, sellCalls } from '@/lib/server/trades'
import type { UserRow } from '@/lib/server/users'
import type { FundView } from '@/lib/types'

export const MAX_FUND_STOCKS = 3
/** Same bound as the contract's MAX_FUND_LOCK, checked here first for a plain message */
const MAX_LOCK_MS = 25 * 365 * 24 * 3600 * 1000
/** The per-stock dust floor the server sets at creation: about a dollar, rounded up */
const MIN_CONTRIBUTION_MICRO_USD = 1_000_000n

export function currentFundsContract(): Address {
  const address = deployments.funds.at(-1)
  if (!address) throw new HttpError(503, 'not_open', 'Funds aren’t open yet. Try again soon.')
  return address
}

const cashToMicroUsd = (cashRaw: bigint, decimals: number) =>
  (cashRaw * 10n ** 6n) / 10n ** BigInt(decimals)

/** Fee from cash if there's enough, else from one of `stocks` the account will hold */
async function feeCall(input: {
  feeRaw: bigint
  cashAvailable: bigint
  stocks: { stock: CatalogEntry; available: bigint }[]
}): Promise<Call> {
  if (input.cashAvailable >= input.feeRaw)
    return { to: CASH_ADDRESS, data: encodeTransfer(treasury(), input.feeRaw) }
  const decimals = await cashDecimals()
  for (const { stock, available } of input.stocks) {
    // Fees taken in shares need a Chainlink price; a pool price can be pushed around
    const feed = chargeableFeed(stock)
    if (!feed) continue
    const raw = microUsdToRaw(cashToMicroUsd(input.feeRaw, decimals), stock.decimals, feed)
    if (raw < available) return { to: stock.address, data: encodeTransfer(treasury(), raw) }
  }
  throw badRequest('Not enough cash to cover the fee.', 'fee_shortfall')
}

export async function createFund(input: {
  user: UserRow
  wallet: Address
  name: string
  purpose: string
  goalUsd: number | null
  unlockAt: Date
  beneficiary: { self: true } | { user: UserRow }
  allocations: { ticker: string; percent: number }[]
}) {
  const { user, wallet } = input
  const contract = currentFundsContract()
  const now = Date.now()
  if (input.unlockAt.getTime() <= now + 24 * 3600 * 1000)
    throw badRequest('Pick an unlock date at least a day away.')
  if (input.unlockAt.getTime() > now + MAX_LOCK_MS) throw badRequest('Pick a date within 25 years.')
  if (input.allocations.length === 0 || input.allocations.length > MAX_FUND_STOCKS)
    throw badRequest(`Pick 1 to ${MAX_FUND_STOCKS} stocks.`)
  if (input.allocations.reduce((sum, item) => sum + item.percent, 0) !== 100)
    throw badRequest('The mix has to add up to 100%.')

  const mix: { stock: CatalogEntry; percent: number; minRaw: bigint }[] = []
  for (const allocation of input.allocations) {
    const stock = await findStock(allocation.ticker)
    // The floor is a dust limit, not a dollar promise, so a market price is good enough for it
    if (!stock?.valuation) throw badRequest(`${allocation.ticker} can’t go in a fund right now.`)
    if (mix.some((entry) => entry.stock.address === stock.address))
      throw badRequest('Each stock can only be in the mix once.')
    mix.push({
      stock,
      percent: allocation.percent,
      minRaw: microUsdToRaw(MIN_CONTRIBUTION_MICRO_USD, stock.decimals, stock.valuation),
    })
  }

  const beneficiaryWallet =
    'self' in input.beneficiary ? wallet : getAddress(input.beneficiary.user.wallet_address!)
  const beneficiaryName =
    'self' in input.beneficiary ? (user.name ?? 'Me') : (input.beneficiary.user.name ?? 'Them')
  const unlockAt = BigInt(Math.floor(input.unlockAt.getTime() / 1000))
  const [cashBalance = 0n] = await balancesOf(wallet, [CASH_ADDRESS])

  const fundId = crypto.randomUUID()
  const built = await buildOperation({
    user,
    sender: wallet,
    kind: 'fund_create',
    context: { fundId },
    callsWithFee: async (feeRaw) => [
      {
        to: contract,
        data: encodeCreateFund(
          beneficiaryWallet,
          unlockAt,
          mix.map((entry) => ({ token: entry.stock.address, minRaw: entry.minRaw })),
        ),
      },
      await feeCall({ feeRaw, cashAvailable: cashBalance, stocks: [] }),
    ],
  })

  const { error } = await db()
    .from('funds')
    .insert({
      id: fundId,
      contract: contract.toLowerCase(),
      name: input.name,
      creator_id: user.id,
      creator_wallet: wallet.toLowerCase(),
      beneficiary_name: beneficiaryName,
      beneficiary_id: 'self' in input.beneficiary ? user.id : input.beneficiary.user.id,
      beneficiary_wallet: beneficiaryWallet.toLowerCase(),
      purpose: input.purpose,
      goal_usd: input.goalUsd,
      unlock_at: input.unlockAt.toISOString(),
      allocations: Object.fromEntries(
        mix.map((entry) => [entry.stock.address.toLowerCase(), entry.percent]),
      ),
      min_raw: Object.fromEntries(
        mix.map((entry) => [entry.stock.address.toLowerCase(), entry.minRaw.toString()]),
      ),
      create_operation_id: built.operationId,
    })
  if (error) throw error
  return { fundId, ...built }
}

type FundRow = {
  id: string
  contract: string
  onchain_id: string | null
  name: string
  creator_id: string
  beneficiary_id: string | null
  beneficiary_name: string
  beneficiary_wallet: string
  purpose: string
  goal_usd: string | null
  unlock_at: string
  allocations: Record<string, number>
  min_raw: Record<string, string>
  status: 'draft' | 'active' | 'withdrawn'
  created_at: string
}

const FUND_COLUMNS =
  'id, contract, onchain_id, name, creator_id, beneficiary_id, beneficiary_name, beneficiary_wallet, purpose, goal_usd, unlock_at, allocations, min_raw, status, created_at'

export async function loadFund(id: string): Promise<FundRow> {
  const { data, error } = await db().from('funds').select(FUND_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data || data.status === 'draft') throw notFound('We couldn’t find that fund.')
  return data
}

/** Balances come from the contract, never from our rows */
export async function toFundView(row: FundRow, viewer: UserRow | null): Promise<FundView> {
  const balances = row.onchain_id
    ? await chain().readContract({
        address: getAddress(row.contract),
        abi: holdsakeFundsAbi,
        functionName: 'getFund',
        args: [BigInt(row.onchain_id)],
      })
    : null
  const mix = await Promise.all(
    Object.entries(row.allocations).map(async ([token, percent]) => {
      const stock = await findStock(token)
      const index = balances
        ? balances[1].findIndex((entry) => isAddressEqual(entry.token, getAddress(token)))
        : -1
      const balanceRaw = balances && index >= 0 ? (balances[2][index] ?? 0n) : 0n
      const usdValue = stock?.valuation
        ? Number(rawToMicroUsd(balanceRaw, stock.decimals, stock.valuation)) / 1e6
        : null
      return {
        token: getAddress(token),
        ticker: stock?.ticker ?? '',
        name: stock?.name ?? 'Stock',
        percent,
        balanceRaw: balanceRaw.toString(),
        shares: stock
          ? (Number(balanceRaw) / 10 ** stock.decimals) * (Number(stock.uiMultiplier) / 1e18)
          : 0,
        usdValue,
        minRaw: row.min_raw[token] ?? '0',
      }
    }),
  )
  const isBeneficiary = viewer?.wallet_address?.toLowerCase() === row.beneficiary_wallet
  const unlocked = new Date(row.unlock_at).getTime() <= Date.now()
  const totalUsd = mix.reduce((sum, entry) => sum + (entry.usdValue ?? 0), 0)
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    beneficiaryName: row.beneficiary_name,
    goalUsd: row.goal_usd === null ? null : Number(row.goal_usd),
    unlockAt: row.unlock_at,
    unlocked,
    isCreator: viewer?.id === row.creator_id,
    isBeneficiary,
    canWithdraw: isBeneficiary && unlocked && mix.some((entry) => entry.balanceRaw !== '0'),
    mix,
    totalUsd,
    createdAt: row.created_at,
  }
}

export async function listFunds(viewer: UserRow) {
  const wallet = viewer.wallet_address?.toLowerCase() ?? ''
  const { data, error } = await db()
    .from('funds')
    .select(FUND_COLUMNS)
    .neq('status', 'draft')
    .or(`creator_id.eq.${viewer.id},beneficiary_wallet.eq.${wallet}`)
    .order('created_at', { ascending: false })
    .overrideTypes<FundRow[], { merge: false }>()
  if (error) throw error
  return Promise.all(data.map((row) => toFundView(row, viewer)))
}

/** Anyone with the link can add shares they hold of the fund's own stocks */
export async function buildContribute(input: {
  fund: FundRow
  user: UserRow
  wallet: Address
  amounts: { token: string; amountRaw: bigint }[]
  note: string | null
}) {
  const { fund, user, wallet } = input
  if (!fund.onchain_id) throw badRequest('This fund is still being set up.')
  const contract = getAddress(fund.contract)
  const id = BigInt(fund.onchain_id)
  const entries: { stock: CatalogEntry; amountRaw: bigint }[] = []
  for (const amount of input.amounts) {
    const key = amount.token.toLowerCase()
    if (!(key in fund.allocations)) throw badRequest('That stock isn’t in this fund.')
    if (BigInt(fund.min_raw[key] ?? '0') > amount.amountRaw)
      throw badRequest('Add at least about $1 of each stock.')
    const stock = await findStock(amount.token)
    if (!stock) throw badRequest('That stock isn’t in this fund.')
    entries.push({ stock, amountRaw: amount.amountRaw })
  }
  if (entries.length === 0) throw badRequest('Add something to the fund.')
  const tokens = [CASH_ADDRESS, ...entries.map((entry) => entry.stock.address)]
  const [cashBalance = 0n, ...stockBalances] = await balancesOf(wallet, tokens)
  entries.forEach((entry, index) => {
    if (entry.amountRaw > (stockBalances[index] ?? 0n))
      throw badRequest(`You don’t have that many ${entry.stock.ticker} shares.`)
  })

  const groupId = crypto.randomUUID()
  const built = await buildOperation({
    user,
    sender: wallet,
    kind: 'fund_contribute',
    context: { fundId: fund.id, groupId },
    callsWithFee: async (feeRaw) => [
      ...entries.flatMap((entry): Call[] => [
        { to: entry.stock.address, data: encodeApprove(contract, entry.amountRaw) },
        { to: contract, data: encodeContribute(id, entry.stock.address, entry.amountRaw) },
      ]),
      await feeCall({
        feeRaw,
        cashAvailable: cashBalance,
        stocks: entries.map((entry, index) => ({
          stock: entry.stock,
          available: (stockBalances[index] ?? 0n) - entry.amountRaw,
        })),
      }),
    ],
  })

  const { error } = await db()
    .from('fund_contributions')
    .insert(
      entries.map((entry) => ({
        fund_id: fund.id,
        group_id: groupId,
        contributor_id: user.id,
        contributor_name: user.name ?? 'Someone',
        contributor_wallet: wallet.toLowerCase(),
        token: entry.stock.address.toLowerCase(),
        amount_raw: entry.amountRaw.toString(),
        usd_value: entry.stock.valuation
          ? Number(rawToMicroUsd(entry.amountRaw, entry.stock.decimals, entry.stock.valuation)) /
            1e6
          : null,
        note: input.note,
        operation_id: built.operationId,
      })),
    )
  if (error) throw error
  return built
}

/**
 * Adds cash to a fund: it's split by the fund's mix, each part buys its stock, and what the
 * swaps are guaranteed to deliver (their minimum out) goes into the fund, all in one signature.
 * A swap that does better than its minimum leaves the small extra in the person's account. The
 * fee comes from cash left over, or out of the amount when that's short.
 *
 * With `sell`, the cash comes from selling shares the person holds outside the mix first, in the
 * same batch: what the sale is guaranteed to bring (its minimum out) is what buys the mix. Two
 * trades means two pool fees; the screen says so before anyone confirms.
 */
export async function buildCashContribute(input: {
  fund: FundRow
  user: UserRow
  wallet: Address
  cashRaw?: bigint
  sell?: { token: string; amountRaw: bigint }
  note: string | null
}) {
  const { fund, user, wallet } = input
  if (!fund.onchain_id) throw badRequest('This fund is still being set up.')
  const contract = getAddress(fund.contract)
  const id = BigInt(fund.onchain_id)
  const mix: { stock: CatalogEntry; percent: number }[] = []
  for (const [token, percent] of Object.entries(fund.allocations)) {
    const stock = await findStock(token)
    if (!stock?.tradable)
      throw badRequest(`${stock?.ticker ?? 'A stock'} in this fund can’t be bought right now.`)
    mix.push({ stock, percent })
  }
  if (mix.length === 0) throw badRequest('This fund has nothing to buy.')
  const [cashBalance = 0n] = await balancesOf(wallet, [CASH_ADDRESS])

  let sold: { stock: CatalogEntry; amountRaw: bigint; cashRaw: bigint; calls: Call[] } | null = null
  if (input.sell) {
    const stock = await findStock(input.sell.token)
    if (!stock) throw badRequest('We don’t offer that stock.', 'unknown_token')
    if (stock.address.toLowerCase() in fund.allocations)
      throw badRequest(`${stock.ticker} is in this fund: add it straight in instead.`)
    if (!stock.tradable) throw badRequest(`${stock.ticker} can’t be sold here yet.`)
    const [held = 0n] = await balancesOf(wallet, [stock.address])
    if (input.sell.amountRaw <= 0n || input.sell.amountRaw > held)
      throw badRequest(`You don’t have that many ${stock.ticker} shares.`, 'insufficient_balance')
    // Quoted once: the sale doesn't change with the fee, only how much of it buys the mix
    const swap = await sellCalls(stock, input.sell.amountRaw)
    sold = { stock, amountRaw: input.sell.amountRaw, cashRaw: swap.minOut, calls: swap.calls }
  }
  const cashRaw = sold ? sold.cashRaw : (input.cashRaw ?? 0n)
  if (cashRaw <= 0n) throw badRequest('Enter an amount.')
  if (!sold && cashRaw > cashBalance)
    throw badRequest('You don’t have that much cash.', 'insufficient_balance')
  // Cash in the account once the sale (if any) lands
  const cash = cashBalance + (sold ? sold.cashRaw : 0n)

  const groupId = crypto.randomUUID()
  let bought: { stock: CatalogEntry; sharesRaw: bigint; cashRaw: bigint }[] = []
  let spentRaw = cashRaw
  let feePaidRaw = 0n
  const built = await buildOperation({
    user,
    sender: wallet,
    kind: 'fund_contribute',
    context: { fundId: fund.id, groupId },
    callsWithFee: async (feeRaw) => {
      feePaidRaw = feeRaw
      const cashLeft = cash - cashRaw
      spentRaw = cashLeft >= feeRaw ? cashRaw : cashRaw - (feeRaw - cashLeft)
      if (spentRaw <= 0n) throw badRequest('That’s less than the fee. Try a bigger amount.')
      const calls: Call[] = sold ? [...sold.calls] : []
      bought = []
      let assigned = 0n
      for (const [index, { stock, percent }] of mix.entries()) {
        // The last part takes the rounding remainder, so every cent is spent
        const part =
          index === mix.length - 1 ? spentRaw - assigned : (spentRaw * BigInt(percent)) / 100n
        assigned += part
        const swap = await buyCalls(stock, part)
        const minRaw = BigInt(fund.min_raw[stock.address.toLowerCase()] ?? '0')
        if (swap.minOut < minRaw)
          throw badRequest(
            `Add a little more: each stock needs at least about $1, and ${stock.ticker} gets ${percent}%.`,
            'below_minimum',
          )
        calls.push(
          ...swap.calls,
          { to: stock.address, data: encodeApprove(contract, swap.minOut) },
          { to: contract, data: encodeContribute(id, stock.address, swap.minOut) },
        )
        bought.push({ stock, sharesRaw: swap.minOut, cashRaw: part })
      }
      calls.push({ to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) })
      return calls
    },
  })

  const decimals = await cashDecimals()
  const { error } = await db()
    .from('fund_contributions')
    .insert(
      bought.map((entry) => ({
        fund_id: fund.id,
        group_id: groupId,
        contributor_id: user.id,
        contributor_name: user.name ?? 'Someone',
        contributor_wallet: wallet.toLowerCase(),
        token: entry.stock.address.toLowerCase(),
        amount_raw: entry.sharesRaw.toString(),
        usd_value: Number(entry.cashRaw) / 10 ** decimals,
        note: input.note,
        operation_id: built.operationId,
      })),
    )
  if (error) throw error
  return {
    ...built,
    contribution: {
      sold: sold && {
        ticker: sold.stock.ticker,
        shares:
          (Number(sold.amountRaw) / 10 ** sold.stock.decimals) *
          (Number(sold.stock.uiMultiplier) / 1e18),
        cashRaw: sold.cashRaw.toString(),
      },
      spentRaw: spentRaw.toString(),
      feeRaw: feePaidRaw.toString(),
      buys: bought.map((entry) => ({
        ticker: entry.stock.ticker,
        cashRaw: entry.cashRaw.toString(),
        shares:
          (Number(entry.sharesRaw) / 10 ** entry.stock.decimals) *
          (Number(entry.stock.uiMultiplier) / 1e18),
      })),
    },
  }
}

export async function buildWithdraw(input: { fund: FundRow; user: UserRow; wallet: Address }) {
  const { fund, user, wallet } = input
  const view = await toFundView(fund, user)
  if (!view.isBeneficiary) throw forbidden('Only the person this fund is for can take it out.')
  if (!view.canWithdraw)
    throw badRequest(
      view.unlocked ? 'There’s nothing in this fund yet.' : 'This fund is still locked.',
    )
  const [cashBalance = 0n] = await balancesOf(wallet, [CASH_ADDRESS])
  const stocks = await Promise.all(
    view.mix.map(async (entry) => ({
      stock: (await findStock(entry.token))!,
      available: BigInt(entry.balanceRaw),
    })),
  )
  return buildOperation({
    user,
    sender: wallet,
    kind: 'fund_withdraw',
    context: { fundId: fund.id },
    callsWithFee: async (feeRaw) => [
      { to: getAddress(fund.contract), data: encodeWithdraw(BigInt(fund.onchain_id!), wallet) },
      await feeCall({ feeRaw, cashAvailable: cashBalance, stocks }),
    ],
  })
}

export async function afterFundOperation(
  kind: string,
  context: Record<string, unknown>,
  result: Submitted,
) {
  const fundId = context.fundId
  if (typeof fundId !== 'string') return
  const { data: fund } = await db()
    .from('funds')
    .select(FUND_COLUMNS)
    .eq('id', fundId)
    .maybeSingle()
  if (!fund) return
  const row = fund

  if (kind === 'fund_create') {
    if (!result.success) {
      await db().from('funds').delete().eq('id', fundId).eq('status', 'draft')
      return
    }
    const created = parseEventLogs({
      abi: holdsakeFundsAbi,
      eventName: 'FundCreated',
      logs: result.logs.filter((log) => isAddressEqual(log.address, getAddress(row.contract))),
    })[0]
    if (!created) throw new Error(`no FundCreated for ${fundId}`)
    await db()
      .from('funds')
      .update({
        onchain_id: created.args.id.toString(),
        status: 'active',
        create_tx: result.txHash,
      })
      .eq('id', fundId)
    return
  }

  if (kind === 'fund_contribute') {
    const groupId = context.groupId
    if (typeof groupId !== 'string') return
    if (!result.success) {
      await db().from('fund_contributions').delete().eq('group_id', groupId).eq('status', 'draft')
      return
    }
    await db()
      .from('fund_contributions')
      .update({ status: 'confirmed', tx_hash: result.txHash })
      .eq('group_id', groupId)
    if (row.beneficiary_id)
      await notify({
        userId: row.beneficiary_id,
        kind: 'fund_contribution',
        title: `Someone added to ${row.name}`,
        body: 'Your fund just grew.',
        href: `/fund/${fundId}`,
      })
    if (row.creator_id !== row.beneficiary_id)
      await notify({
        userId: row.creator_id,
        kind: 'fund_contribution',
        title: `${row.name} grew`,
        body: 'Someone added to the fund you started.',
        href: `/fund/${fundId}`,
      })
    return
  }
  // A withdrawal leaves the fund open: anything added later can be taken out again
}
