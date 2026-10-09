import { appLink, sendEmail } from '@/lib/server/email'
import { logError } from '@/lib/server/http'
import { db } from '@/lib/server/supabase'

export type NotificationKind =
  | 'gift_sent'
  | 'gift_received'
  | 'gift_opened'
  | 'gift_returned'
  | 'gift_expiring'
  | 'fund_contribution'
  | 'fund_unlocked'
  | 'trade_bought'
  | 'trade_sold'
  | 'cash_received'
  | 'stock_received'
  | 'earn_claimed'

const CATEGORY: Record<NotificationKind, 'gifts' | 'funds' | 'trades'> = {
  gift_sent: 'gifts',
  gift_received: 'gifts',
  gift_opened: 'gifts',
  gift_returned: 'gifts',
  gift_expiring: 'gifts',
  fund_contribution: 'funds',
  fund_unlocked: 'funds',
  trade_bought: 'trades',
  trade_sold: 'trades',
  cash_received: 'trades',
  stock_received: 'trades',
  earn_claimed: 'trades',
}

// Worth an email: things that happen to you while you're away. What you did yourself (sent,
// bought, sold) stays in the feed.
const EMAILED = new Set<NotificationKind>([
  'gift_received',
  'gift_opened',
  'gift_returned',
  'gift_expiring',
  'fund_contribution',
  'fund_unlocked',
  'cash_received',
  'stock_received',
])

/**
 * The only way into the feed: respects the person's settings, inserts the row, then emails it
 * when it's worth one (inert with no key). Never throws: a missed notification mustn't fail the
 * money flow that triggered it.
 */
export async function notify(input: {
  userId: string
  kind: NotificationKind
  title: string
  body: string
  href?: string
  /** Same key for the same person inserts once; for events more than one request can see */
  dedupeKey?: string
}): Promise<void> {
  try {
    const { data: settings } = await db()
      .from('notification_settings')
      .select('gifts, funds, trades, email')
      .eq('user_id', input.userId)
      .maybeSingle()
    if (settings && settings[CATEGORY[input.kind]] === false) return
    const row = {
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      dedupe_key: input.dedupeKey ?? null,
    }
    const { data: inserted, error } = input.dedupeKey
      ? await db()
          .from('notifications')
          .upsert(row, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
          .select('id')
      : await db().from('notifications').insert(row).select('id')
    if (error) throw error
    // An empty result means the dedupe key was already there: someone else sent this one
    if (!inserted?.length) return

    if (!EMAILED.has(input.kind) || settings?.email === false) return
    const { data: user } = await db()
      .from('users')
      .select('email')
      .eq('id', input.userId)
      .maybeSingle()
    if (!user?.email) return
    await sendEmail({
      to: user.email,
      subject: input.title,
      heading: input.title,
      paragraphs: [input.body],
      action: { label: 'Open Holdsake', href: appLink(input.href ?? '/') },
    })
  } catch (error) {
    logError(`notify failed (${input.kind})`, error)
  }
}
