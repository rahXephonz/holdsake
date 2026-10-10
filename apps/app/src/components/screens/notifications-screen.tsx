import {
  ArrowDownLeftIcon,
  ArrowsLeftRightIcon,
  ArrowUUpLeftIcon,
  BellIcon,
  ChartLineUpIcon,
  EnvelopeOpenIcon,
  GiftIcon,
  HourglassIcon,
  LockOpenIcon,
  PaperPlaneTiltIcon,
  PiggyBankIcon,
  PlantIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useEffect } from 'react'
import { ListRow } from '@/components/list-row'
import { EmptyState, Loading, Screen, RowsSkeleton } from '@/components/screen'
import { useMarkNotificationsRead, useNotificationsQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function NotificationsScreen() {
  const session = useSession()
  const notifications = useNotificationsQuery()
  const markRead = useMarkNotificationsRead()
  const hasUnread = notifications.data?.some((item) => !item.read) ?? false

  useEffect(() => {
    if (hasUnread && !markRead.isPending) markRead.mutate()
    // Once per visit with something unread
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread])

  if (!session.ready) return <Loading />

  return (
    <Screen back="/" title="Activity">
      {notifications.data?.length === 0 && (
        <EmptyState title="Nothing yet" body="Gifts, trades and fund updates show up here." />
      )}
      <div className="pb-6">
        {notifications.isPending && <RowsSkeleton rows={5} />}
        {notifications.data?.map((item) => (
          <ListRow
            key={item.id}
            to={item.href ?? undefined}
            leading={<KindIcon kind={item.kind} unread={!item.read} />}
            title={item.title}
            subtitle={item.body}
            valueSub={<span className="text-muted-foreground">{relativeTime(item.createdAt)}</span>}
            className={item.read ? undefined : 'bg-secondary/60'}
          />
        ))}
      </div>
    </Screen>
  )
}

// One picture per kind of event, so the feed scans at a glance. Neutral on purpose: colour is
// for gain/loss and the one action, and a received gift isn't a gain on a chart.
const KIND_ICONS: Record<string, Icon> = {
  gift_sent: PaperPlaneTiltIcon,
  gift_received: GiftIcon,
  gift_opened: EnvelopeOpenIcon,
  gift_returned: ArrowUUpLeftIcon,
  gift_expiring: HourglassIcon,
  fund_contribution: PiggyBankIcon,
  fund_unlocked: LockOpenIcon,
  trade_bought: ChartLineUpIcon,
  trade_sold: ArrowsLeftRightIcon,
  cash_received: ArrowDownLeftIcon,
  stock_received: ArrowDownLeftIcon,
  earn_claimed: PlantIcon,
}

function KindIcon({ kind, unread }: { kind: string; unread: boolean }) {
  const Glyph = KIND_ICONS[kind] ?? BellIcon
  return (
    // Unread rows are tinted grey, so their icon sits on white to stay visible
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full',
        unread ? 'bg-background' : 'bg-secondary',
      )}
    >
      <Glyph className="size-5" />
    </span>
  )
}
