import {
  deployments,
  encodeApprove,
  encodeClaimGift,
  encodeCreateGift,
  encodeRefundGift,
  encodeTransfer,
  holdsakeGiftsAbi,
} from '@holdsake/sdk'
import { z } from 'zod'
import { parseEventLogs, getAddress, isAddressEqual, type Address } from 'viem'
import { FeeShortfall, planGiftFee, type PlanItem } from '@/lib/fee-plan'
import {
  CASH_ADDRESS,
  cashDecimals,
  chargeableFeed,
  findGiftAsset,
  findStock,
  isCash,
} from '@/lib/server/catalog'
import { appLink, sendEmail } from '@/lib/server/email'
import { badRequest, forbidden, HttpError, notFound } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import type { Call, Submitted } from '@/lib/server/operations'
import { buildOperation } from '@/lib/server/operations'
import { cashRawPerToken } from '@/lib/server/pools'
import { sellCalls } from '@/lib/server/trades'
import { microUsdToRaw } from '@/lib/server/prices'
import type { ResolvedRecipient } from '@/lib/server/recipients'
import { avatarUrl, db } from '@/lib/server/supabase'
import { balancesOf } from '@/lib/server/tokens'
import { treasury } from '@/lib/server/treasury'
import type { UserRow } from '@/lib/server/users'
import { cardOf, type CardTheme } from '@/lib/gift-cards'
import type { GiftItemView, GiftPreview, GiftView } from '@/lib/types'

export const MAX_GIFT_STOCKS = 3
export const MAX_RECIPIENTS = 3

/** Stocks plus at most one cash item; amounts in raw units as decimal strings */
export const giftItemsSchema = z
  .array(
    z.object({
      token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      amountRaw: z
        .string()
        .regex(/^[1-9][0-9]{0,77}$/)
        .transform(BigInt),
    }),
  )
  .min(1)
  .max(4)

export function currentGiftsContract(): Address {
  const address = deployments.gifts.at(-1)
  if (!address) throw new HttpError(503, 'not_open', 'Gifts aren’t open yet. Try again soon.')
  return address
}

export type GiftItemInput = { token: string; amountRaw: bigint }

/** Validates the mix the contract would accept, with tokens resolved through the catalog only */
export async function validateGiftItems(items: GiftItemInput[]) {
  if (items.length === 0) throw badRequest('Add something to the gift.')
  const seen = new Set<string>()
  let stocks = 0
  let cash = 0
  const resolved = []
  for (const item of items) {
    const key = item.token.toLowerCase()
    if (seen.has(key)) throw badRequest('Each stock can only be in a gift once.')
    seen.add(key)
    if (item.amountRaw <= 0n) throw badRequest('Amounts must be more than zero.')
    const asset = await findGiftAsset(item.token)
    if (!asset) throw badRequest('We don’t offer that stock.', 'unknown_token')
    if (asset.kind === 'cash') cash++
    else stocks++
    resolved.push({ ...item, asset })
  }
  if (stocks > MAX_GIFT_STOCKS) throw badRequest(`A gift can hold up to ${MAX_GIFT_STOCKS} stocks.`)
  if (cash > 1) throw badRequest('A gift can hold cash once.')
  return resolved
}

const cashToMicroUsd = (cashRaw: bigint, decimals: number) =>
  (cashRaw * 10n ** 6n) / 10n ** BigInt(decimals)

/**
 * Builds one operation per recipient: approve each item, createGift, then the fee. Fees are
 * planned in order, so later recipients see the cash earlier fees already spent.
 */
export async function createGifts(input: {
  sender: UserRow
  senderWallet: Address
  recipients: ResolvedRecipient[]
  items: GiftItemInput[]
  message: string | null
  cardTheme: CardTheme
}) {
  const { sender, senderWallet, recipients, message } = input
  const contract = currentGiftsContract()
  const feeRecipient = treasury()
  const items = await validateGiftItems(input.items)
  const decimals = await cashDecimals()

  // Balances: the whole send must be covered before any fee is planned
  const tokens = [...new Set([CASH_ADDRESS, ...items.map((item) => getAddress(item.token))])]
  const balances = await balancesOf(senderWallet, tokens)
  const balanceOf = (token: string) =>
    balances[tokens.findIndex((candidate) => isAddressEqual(candidate, getAddress(token)))] ?? 0n
  for (const item of items) {
    if (item.amountRaw * BigInt(recipients.length) > balanceOf(item.token))
      throw badRequest(
        item.asset.kind === 'cash'
          ? 'You don’t have that much cash.'
          : `You don’t have that many ${item.asset.stock.ticker} shares.`,
        'insufficient_balance',
      )
  }
  const cashItem = items.find((item) => item.asset.kind === 'cash')
  let keptCash = balanceOf(CASH_ADDRESS) - (cashItem?.amountRaw ?? 0n) * BigInt(recipients.length)

  const results = []
  for (const recipient of recipients) {
    const giftId = crypto.randomUUID()
    let planned: ReturnType<typeof planGiftFee> | undefined

    const built = await buildOperation({
      user: sender,
      sender: senderWallet,
      kind: 'gift_create',
      context: { giftId },
      callsWithFee: (feeRaw) => {
        const planItems = items.map((item): PlanItem => {
          const token = getAddress(item.token)
          if (item.asset.kind === 'cash') return { token, amountRaw: item.amountRaw, kind: 'cash' }
          const { stock } = item.asset
          const feed = chargeableFeed(stock)
          return {
            token,
            amountRaw: item.amountRaw,
            kind: 'stock',
            rawForCash: feed
              ? (cashRaw) => microUsdToRaw(cashToMicroUsd(cashRaw, decimals), stock.decimals, feed)
              : undefined,
          }
        })
        try {
          planned = planGiftFee({
            feeRaw,
            cashToken: CASH_ADDRESS,
            keptCashRaw: keptCash,
            items: planItems,
          })
        } catch (error) {
          if (error instanceof FeeShortfall) throw badRequest(error.message, 'fee_shortfall')
          throw error
        }
        const calls: Call[] = planned.items.map((item) => ({
          to: getAddress(item.token),
          data: encodeApprove(contract, item.amountRaw),
        }))
        calls.push({
          to: contract,
          data: encodeCreateGift(
            recipient.wallet,
            planned.items.map((item) => ({
              token: getAddress(item.token),
              amount: item.amountRaw,
            })),
          ),
        })
        calls.push({
          to: getAddress(planned.fee.token),
          data: encodeTransfer(feeRecipient, planned.fee.amountRaw),
        })
        return calls
      },
    })
    if (!planned) throw new Error('fee plan missing')
    if (planned.fee.source === 'kept_cash') keptCash -= planned.fee.amountRaw
    else if (planned.fee.source === 'gift_cash') keptCash = 0n

    const { error } = await db()
      .from('gifts')
      .insert({
        id: giftId,
        contract: contract.toLowerCase(),
        sender_id: sender.id,
        sender_wallet: senderWallet.toLowerCase(),
        recipient_id: recipient.user?.id ?? null,
        recipient_email: recipient.email,
        recipient_wallet: recipient.wallet.toLowerCase(),
        message,
        card_theme: input.cardTheme,
        status: 'draft',
        fee_raw: isCash(planned.fee.token) ? planned.fee.amountRaw.toString() : '0',
        create_operation_id: built.operationId,
      })
    if (error) throw error
    const { error: itemsError } = await db()
      .from('gift_items')
      .insert(
        planned.items.map((item, index) => ({
          gift_id: giftId,
          index,
          token: item.token.toLowerCase(),
          amount_raw: item.amountRaw.toString(),
        })),
      )
    if (itemsError) throw itemsError

    results.push({ giftId, recipient: recipient.label, feeSource: planned.fee.source, ...built })
  }
  return results
}

type GiftRow = {
  id: string
  contract: string
  onchain_id: string | null
  sender_id: string
  sender_wallet: string
  recipient_id: string | null
  recipient_email: string | null
  recipient_wallet: string
  message: string | null
  status: 'draft' | 'pending' | 'opened' | 'claimed' | 'refunded'
  expires_at: string | null
  created_at: string
  settled_at: string | null
  settle_tx: string | null
  card_theme: string
  gift_items: { index: number; token: string; amount_raw: string; settled: boolean }[]
  sender: { name: string | null; handle: string | null; avatar_path: string | null } | null
  recipient: { name: string | null; handle: string | null; avatar_path: string | null } | null
}

const GIFT_SELECT =
  'id, contract, onchain_id, sender_id, sender_wallet, recipient_id, recipient_email, recipient_wallet, message, status, card_theme, expires_at, created_at, settled_at, settle_tx, gift_items(index, token, amount_raw, settled), sender:users!gifts_sender_id_fkey(name, handle, avatar_path), recipient:users!gifts_recipient_id_fkey(name, handle, avatar_path)'

export async function loadGift(id: string): Promise<GiftRow> {
  const { data, error } = await db()
    .from('gifts')
    .select(GIFT_SELECT)
    .eq('id', id)
    .maybeSingle()
    .overrideTypes<GiftRow | null, { merge: false }>()
  if (error) throw error
  if (!data) throw notFound('We couldn’t find that gift.')
  return data
}

/** What's inside a gift, valued now; shared by the gift page and the link preview */
async function toItemViews(items: GiftRow['gift_items']): Promise<GiftItemView[]> {
  const decimals = await cashDecimals()
  return Promise.all(
    items
      .toSorted((a, b) => a.index - b.index)
      .map(async (item) => {
        if (isCash(item.token)) {
          const usd = Number(item.amount_raw) / 10 ** decimals
          return {
            kind: 'cash' as const,
            token: item.token,
            ticker: null,
            name: 'Cash',
            amountRaw: item.amount_raw,
            shares: null,
            usdValue: usd,
            settled: item.settled,
          }
        }
        const stock = await findStock(item.token)
        const tokens = stock ? Number(item.amount_raw) / 10 ** stock.decimals : 0
        return {
          kind: 'stock' as const,
          token: item.token,
          ticker: stock?.ticker ?? null,
          name: stock?.name ?? 'Stock',
          amountRaw: item.amount_raw,
          shares: stock ? tokens * (Number(stock.uiMultiplier) / 1e18) : null,
          usdValue: stock?.pricePerToken ? tokens * stock.pricePerToken : null,
          settled: item.settled,
        }
      }),
  )
}

export async function toGiftView(row: GiftRow, viewer: UserRow): Promise<GiftView> {
  const viewerWallet = viewer.wallet_address?.toLowerCase()
  const role =
    row.sender_id === viewer.id
      ? 'sender'
      : row.recipient_wallet === viewerWallet
        ? 'recipient'
        : null
  if (!role) throw forbidden('This gift isn’t for you.')
  const items = await toItemViews(row.gift_items)
  const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false
  return {
    id: row.id,
    role,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    expired,
    settledAt: row.settled_at,
    settleTx: row.settle_tx,
    cardTheme: cardOf(row.card_theme).theme,
    sender: {
      name: row.sender?.name ?? 'Someone',
      handle: row.sender?.handle ?? null,
      avatarUrl: avatarUrl(row.sender?.avatar_path ?? null),
    },
    recipient: {
      name: row.recipient?.name ?? row.recipient_email ?? 'Someone',
      handle: row.recipient?.handle ?? null,
      avatarUrl: avatarUrl(row.recipient?.avatar_path ?? null),
    },
    items,
    totalUsd: items.reduce((sum, item) => sum + (item.usdValue ?? 0), 0),
    canClaim:
      role === 'recipient' && (row.status === 'pending' || row.status === 'opened') && !expired,
    canRefund:
      role === 'sender' && (row.status === 'pending' || (row.status === 'opened' && expired)),
  }
}

export async function listGifts(viewer: UserRow) {
  const wallet = viewer.wallet_address?.toLowerCase() ?? ''
  const { data, error } = await db()
    .from('gifts')
    .select(GIFT_SELECT)
    .neq('status', 'draft')
    .or(`sender_id.eq.${viewer.id},recipient_wallet.eq.${wallet}`)
    .order('created_at', { ascending: false })
    .limit(100)
    .overrideTypes<GiftRow[], { merge: false }>()
  if (error) throw error
  return Promise.all(data.map((row) => toGiftView(row, viewer)))
}

/**
 * Claim or take back: the escrow pays out first, then the fee leaves from what just arrived,
 * cash before stock, so opening a gift never needs money the person doesn't have
 */
export async function buildSettle(input: {
  gift: GiftRow
  user: UserRow
  wallet: Address
  action: 'claim' | 'refund'
}) {
  const { gift, user, wallet, action } = input
  if (!gift.onchain_id) throw badRequest('This gift is still on its way.')
  const contract = getAddress(gift.contract)
  const id = BigInt(gift.onchain_id)
  const decimals = await cashDecimals()
  const open = gift.gift_items.filter((item) => !item.settled)
  const cash = open.find((item) => isCash(item.token))
  const [cashBalance] = await balancesOf(wallet, [CASH_ADDRESS])

  return buildOperation({
    user,
    sender: wallet,
    kind: action === 'claim' ? 'gift_claim' : 'gift_refund',
    context: { giftId: gift.id, action },
    callsWithFee: async (feeRaw) => {
      const settle: Call = {
        to: contract,
        data: action === 'claim' ? encodeClaimGift(id, wallet) : encodeRefundGift(id),
      }
      const available = (cashBalance ?? 0n) + (cash ? BigInt(cash.amount_raw) : 0n)
      if (available >= feeRaw)
        return [settle, { to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) }]
      for (const item of open) {
        if (isCash(item.token)) continue
        const stock = await findStock(item.token)
        const feed = stock ? chargeableFeed(stock) : null
        if (!stock || !feed) continue
        const raw = microUsdToRaw(cashToMicroUsd(feeRaw, decimals), stock.decimals, feed)
        if (raw < BigInt(item.amount_raw))
          return [settle, { to: stock.address, data: encodeTransfer(treasury(), raw) }]
      }
      // No cash and no Chainlink price to charge shares at: sell a sliver of the gift for cash
      // in the same batch and pay the fee from that. The swap is price-checked and has a minimum
      // out, so a pushed pool price can't shortchange the fee; whatever is left over stays theirs.
      const shortfall = feeRaw - available
      for (const item of open) {
        if (isCash(item.token)) continue
        const stock = await findStock(item.token)
        const pool = stock?.pools[0]
        if (!stock || !pool) continue
        const perToken = cashRawPerToken(pool, stock.decimals)
        if (perToken === 0n) continue
        // A quarter over the spot amount covers the pool's fee and slippage
        const sell = (shortfall * 10n ** BigInt(stock.decimals) * 125n) / (perToken * 100n) + 1n
        if (sell >= BigInt(item.amount_raw)) continue
        const swap = await sellCalls(stock, sell).catch(() => null)
        if (!swap || swap.minOut + available < feeRaw) continue
        return [
          settle,
          ...swap.calls,
          { to: CASH_ADDRESS, data: encodeTransfer(treasury(), feeRaw) },
        ]
      }
      throw badRequest('Not enough cash to cover the fee.', 'fee_shortfall')
    },
  })
}

/** After `submit`: fix the row from what the chain says, then tell the people involved */
export async function afterGiftOperation(kind: string, giftId: string, result: Submitted) {
  const gift = await loadGift(giftId)
  if (!result.success) {
    if (kind === 'gift_create')
      await db().from('gifts').delete().eq('id', giftId).eq('status', 'draft')
    return
  }
  const contract = getAddress(gift.contract)
  const ours = result.logs.filter((log) => isAddressEqual(log.address, contract))

  if (kind === 'gift_create') {
    const [created] = parseEventLogs({
      abi: holdsakeGiftsAbi,
      eventName: 'GiftCreated',
      logs: ours,
    })
    if (!created) throw new Error(`no GiftCreated for ${giftId}`)
    await db()
      .from('gifts')
      .update({
        onchain_id: created.args.id.toString(),
        status: 'pending',
        expires_at: new Date(Number(created.args.expiresAt) * 1000).toISOString(),
        create_tx: result.txHash,
      })
      .eq('id', giftId)
    // Amounts recorded are what arrived, which is what the contract owes
    for (const [index, amount] of created.args.amounts.entries())
      await db()
        .from('gift_items')
        .update({ amount_raw: amount.toString() })
        .eq('gift_id', giftId)
        .eq('index', index)

    const senderName = gift.sender?.name ?? 'Someone'
    await notify({
      userId: gift.sender_id,
      kind: 'gift_sent',
      title: 'Gift sent',
      body: `Your gift to ${gift.recipient?.name ?? gift.recipient_email ?? 'them'} is on its way.`,
      href: `/gift/${giftId}`,
    })
    if (gift.recipient_id)
      await notify({
        userId: gift.recipient_id,
        kind: 'gift_received',
        title: `${senderName} sent you a gift`,
        body: gift.message ?? 'Open it to see what’s inside.',
        href: `/gift/${giftId}`,
      })
    // Not on Holdsake yet: email is the only way they'll hear about it
    else if (gift.recipient_email) {
      // The contract sets the expiry; read it rather than assume 30 days
      const days = Math.round((Number(created.args.expiresAt) * 1000 - Date.now()) / 86_400_000)
      await sendEmail({
        to: gift.recipient_email,
        subject: `${senderName} sent you a gift`,
        heading: `${senderName} sent you a gift`,
        quote: gift.message ?? undefined,
        paragraphs: [
          'Sign in to Holdsake with this email address to open it. Only you can.',
          `If it isn’t opened within ${days} days, it goes back to ${senderName}.`,
        ],
        action: { label: 'Open your gift', href: appLink(`/gift/${giftId}`) },
      })
    }
    return
  }

  const settledIndexes = parseEventLogs({
    abi: holdsakeGiftsAbi,
    eventName: ['ItemClaimed', 'ItemRefunded'],
    logs: ours,
  }).map((event) => Number(event.args.index))
  for (const index of settledIndexes)
    await db().from('gift_items').update({ settled: true }).eq('gift_id', giftId).eq('index', index)

  const claimed = kind === 'gift_claim'
  await db()
    .from('gifts')
    .update({
      status: claimed ? 'claimed' : 'refunded',
      settle_tx: result.txHash,
      settled_at: new Date().toISOString(),
      ...(claimed ? { opened_at: new Date().toISOString() } : {}),
    })
    .eq('id', giftId)
  if (claimed)
    await notify({
      userId: gift.sender_id,
      kind: 'gift_opened',
      title: `${gift.recipient?.name ?? 'They'} opened your gift`,
      body: 'It’s theirs now.',
      href: `/gift/${giftId}`,
    })
  else if (gift.recipient_id)
    await notify({
      userId: gift.recipient_id,
      kind: 'gift_returned',
      title: 'A gift went back',
      body: `${gift.sender?.name ?? 'The sender'} took back a gift you hadn’t opened.`,
      href: `/gift/${giftId}`,
    })
}

/**
 * What anyone holding a gift's link may see before signing in: who it's from, the card, what's
 * inside and whether it's still waiting. What's inside is public on-chain anyway; the note isn't
 * (it lives only in our database), so it stays behind sign-in. The unfurled card image still
 * shows neither, since that one lands in group chats.
 */
export async function giftPreview(id: string): Promise<GiftPreview | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data, error } = await db()
    .from('gifts')
    .select(
      'status, expires_at, card_theme, gift_items(index, token, amount_raw, settled), sender:users!gifts_sender_id_fkey(name, avatar_path), recipient:users!gifts_recipient_id_fkey(name)',
    )
    .eq('id', id)
    .neq('status', 'draft')
    .maybeSingle()
    .overrideTypes<
      {
        status: GiftView['status']
        expires_at: string | null
        card_theme: string
        gift_items: GiftRow['gift_items']
        sender: { name: string | null; avatar_path: string | null } | null
        recipient: { name: string | null } | null
      } | null,
      { merge: false }
    >()
  if (error || !data) return null
  return {
    senderName: data.sender?.name ?? 'Someone',
    senderAvatarUrl: avatarUrl(data.sender?.avatar_path ?? null),
    // Recipients by email have no name yet; the card says "for you" rather than the address
    recipientName: data.recipient?.name ?? null,
    cardTheme: cardOf(data.card_theme).theme,
    items: (await toItemViews(data.gift_items)).map(({ kind, ticker, name, shares, usdValue }) => ({
      kind,
      ticker,
      name,
      shares,
      usdValue,
    })),
    waiting:
      (data.status === 'pending' || data.status === 'opened') &&
      (!data.expires_at || Date.parse(data.expires_at) > Date.now()),
  }
}
