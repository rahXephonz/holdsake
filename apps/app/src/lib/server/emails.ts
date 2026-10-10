import { formatShares, formatUsd } from '@/lib/format'
import { cardOf } from '@/lib/gift-cards'
import type { EmailAsset, EmailContent } from '@/lib/server/email-template'
import type { GiftItemView } from '@/lib/types'

// Every email we send, written here so the copy reads as one voice. Each is the inbox version of
// a feed line, for something that happened while the person was away. No crypto words, and no
// promise the chain can't keep: a gift that isn't opened can be taken back, not "comes back".

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const plural = (shares: number) => (shares === 1 ? 'share' : 'shares')

/** What's inside a gift, as rows with logos, and what it's worth now */
export function giftAssets(items: GiftItemView[]): { assets: EmailAsset[]; total: number } {
  const assets = items.map((item) =>
    item.kind === 'cash'
      ? { ticker: null, title: 'Cash', value: formatUsd(item.usdValue ?? 0) }
      : {
          ticker: item.ticker,
          title: item.name,
          detail:
            item.shares === null
              ? undefined
              : `${formatShares(item.shares)} ${plural(item.shares)}`,
          value: item.usdValue === null ? undefined : formatUsd(item.usdValue),
        },
  )
  const total = items.reduce((sum, item) => sum + (item.usdValue ?? 0), 0)
  return { assets, total }
}

type GiftFacts = {
  giftId: string
  senderName: string
  cardTheme: string
  items: GiftItemView[]
  message: string | null
  expiresAt: string
}

/** To the recipient. `newcomerEmail` is set when they have no account yet */
export function giftReceivedEmail(gift: GiftFacts, newcomerEmail?: string): EmailContent {
  const { assets, total } = giftAssets(gift.items)
  const { label } = cardOf(gift.cardTheme)
  return {
    subject: `${gift.senderName} sent you a gift`,
    preview: `${formatUsd(total)} of real shares and cash, wrapped in a ${label.toLowerCase()} card. Only you can open it.`,
    card: {
      path: `/api/gifts/${gift.giftId}/card.png`,
      alt: `${label} card from ${gift.senderName}`,
    },
    eyebrow: `${gift.senderName} sent you a gift`,
    hero: formatUsd(total),
    subhero: 'Only you can open it.',
    assets,
    rows: [
      { label: 'From', value: gift.senderName },
      { label: 'Open before', value: day(gift.expiresAt) },
    ],
    note: gift.message ? { from: gift.senderName, text: gift.message } : null,
    cta: { label: 'Open your gift', path: `/gift/${gift.giftId}` },
    footnote: newcomerEmail
      ? `Sign in to Holdsake with ${newcomerEmail} to open it. Until you do, ${gift.senderName} can take it back.`
      : `Until you open it, ${gift.senderName} can take it back.`,
    reason: newcomerEmail
      ? `You’re getting this because ${gift.senderName} sent a gift to this address.`
      : undefined,
  }
}

/** To the sender, once the recipient has opened it */
export function giftOpenedEmail(
  gift: Pick<GiftFacts, 'giftId' | 'cardTheme' | 'items'>,
  recipientName: string,
): EmailContent {
  const { assets, total } = giftAssets(gift.items)
  const { label } = cardOf(gift.cardTheme)
  return {
    subject: `${recipientName} opened your gift`,
    preview: 'The shares are theirs now.',
    card: { path: `/api/gifts/${gift.giftId}/card.png`, alt: `${label} card for ${recipientName}` },
    eyebrow: `${recipientName} opened your gift`,
    hero: formatUsd(total),
    subhero: 'It’s theirs now.',
    assets,
    cta: { label: 'See the gift', path: `/gift/${gift.giftId}` },
  }
}

/** To the recipient, when the sender took back a gift they hadn't opened */
export function giftReturnedEmail(
  gift: Pick<GiftFacts, 'giftId' | 'items'>,
  senderName: string,
): EmailContent {
  const { assets, total } = giftAssets(gift.items)
  return {
    subject: `${senderName} took back a gift`,
    preview: 'It hadn’t been opened, so it went back to them.',
    eyebrow: 'A gift went back',
    hero: formatUsd(total),
    subhero: `${senderName} took back a gift you hadn’t opened.`,
    assets,
    cta: { label: 'Open Holdsake', path: '/' },
  }
}

/** To the beneficiary, and to whoever started the fund if that's someone else */
export function fundContributionEmail(input: {
  fundId: string
  fundName: string
  contributorName: string
  usd: number
  assets: EmailAsset[]
  unlockAt: string
  note: string | null
  forBeneficiary: boolean
}): EmailContent {
  return {
    subject: `${input.contributorName} added ${formatUsd(input.usd)} to ${input.fundName}`,
    preview: `Locked until ${day(input.unlockAt)}.`,
    eyebrow: `${input.contributorName} added to ${input.fundName}`,
    hero: formatUsd(input.usd),
    subhero: input.forBeneficiary ? 'Your fund just grew.' : 'The fund you started just grew.',
    assets: input.assets,
    rows: [
      { label: 'From', value: input.contributorName },
      { label: 'Locked until', value: day(input.unlockAt) },
    ],
    note: input.note ? { from: input.contributorName, text: input.note } : null,
    cta: { label: 'See the fund', path: `/fund/${input.fundId}` },
  }
}

/** Cash that arrived from outside the app's own flows; `from` is a Holdsake name when known */
export function cashReceivedEmail(amount: number, from: string | null): EmailContent {
  return {
    subject: from ? `${from} sent you ${formatUsd(amount)}` : `${formatUsd(amount)} cash arrived`,
    preview: 'It’s ready to buy stocks or send as a gift.',
    eyebrow: from ? `${from} sent you cash` : 'Cash arrived',
    hero: formatUsd(amount),
    subhero: 'It’s in your account now.',
    rows: [{ label: 'Added', value: `+${formatUsd(amount)}`, tone: 'gain' }],
    cta: { label: 'Open Holdsake', path: '/' },
  }
}

/** Shares that arrived from outside the app's own flows */
export function stockReceivedEmail(input: {
  ticker: string
  name: string
  shares: number
  usd: number | null
  from: string | null
}): EmailContent {
  const amount = `${formatShares(input.shares)} ${plural(input.shares)}`
  return {
    subject: input.from
      ? `${input.from} sent you ${amount} of ${input.name}`
      : `${amount} of ${input.name} arrived`,
    preview: 'They’re already in your account. Nothing to open.',
    eyebrow: input.from ? `${input.from} sent you shares` : 'Shares arrived',
    hero: input.usd === null ? amount : formatUsd(input.usd),
    subhero: 'They’re in your account now.',
    assets: [
      {
        ticker: input.ticker,
        title: input.name,
        detail: amount,
        value: input.usd === null ? undefined : formatUsd(input.usd),
      },
    ],
    cta: { label: 'See your shares', path: `/stocks/${input.ticker}` },
  }
}
