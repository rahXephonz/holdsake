import { CheckIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ListRow } from '@/components/list-row'
import { EmptyState, Loading, Screen, ScreenTitle, RowsSkeleton } from '@/components/screen'
import { Avatar } from '@/components/stock-logo'
import { buttonVariants } from '@/components/ui/button'
import { useGiftsQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd, relativeTime } from '@/lib/format'
import type { GiftView } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function GiftsScreen() {
  const session = useSession()
  const gifts = useGiftsQuery()
  const [tab, setTab] = useState<'received' | 'sent'>('received')

  if (!session.ready) return <Loading />
  const list =
    gifts.data?.filter((gift) =>
      tab === 'received' ? gift.role === 'recipient' : gift.role === 'sender',
    ) ?? []

  return (
    <Screen tab="/gifts">
      <div className="flex items-end justify-between">
        <ScreenTitle>Gifts</ScreenTitle>
        <Link
          to="/send"
          className={buttonVariants({ size: 'lg', className: 'mb-3 rounded-full px-4' })}
        >
          Send
        </Link>
      </div>
      <div className="mt-2 mb-2 flex gap-1 rounded-full bg-secondary p-1" role="tablist">
        {(['received', 'sent'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'h-9 flex-1 rounded-full text-sm font-medium capitalize',
              tab === value ? 'bg-background shadow-xs' : 'text-muted-foreground',
            )}
          >
            {value}
          </button>
        ))}
      </div>
      {gifts.isPending ? (
        <RowsSkeleton rows={4} />
      ) : list.length === 0 ? (
        <EmptyState
          title={tab === 'received' ? 'No gifts yet' : 'You haven’t sent a gift'}
          body={
            tab === 'received'
              ? 'When someone sends you shares or cash, it shows up here.'
              : 'Give someone a piece of a company they love.'
          }
        />
      ) : (
        <div className="pb-6">
          {list.map((gift) => (
            <GiftRow key={gift.id} gift={gift} />
          ))}
        </div>
      )}
    </Screen>
  )
}

/** Activity reads like a sentence, never like a ledger */
export function giftSentence(gift: GiftView): string {
  const what = describeItems(gift)
  return gift.role === 'sender'
    ? `You sent ${gift.recipient.name} ${what}`
    : `${gift.sender.name} sent you ${what}`
}

export function describeItems(gift: GiftView): string {
  const total = formatUsd(gift.totalUsd)
  const stocks = gift.items.filter((item) => item.kind === 'stock').map((item) => item.name)
  if (stocks.length === 0) return total
  if (stocks.length === 1) return `${total} of ${stocks[0]}`
  return `${total} of ${stocks.slice(0, -1).join(', ')} and ${stocks.at(-1)}`
}

export function giftStatus(gift: GiftView): string {
  if (gift.status === 'claimed') return 'Opened'
  if (gift.status === 'refunded') return 'Returned'
  if (gift.expired) return gift.role === 'sender' ? 'Take it back' : 'Expired'
  return gift.role === 'sender' ? 'Waiting' : 'Ready to open'
}

function GiftRow({ gift }: { gift: GiftView }) {
  const person = gift.role === 'sender' ? gift.recipient : gift.sender
  return (
    <ListRow
      to={`/gift/${gift.id}`}
      leading={<Avatar name={person.name} url={person.avatarUrl} />}
      title={giftSentence(gift)}
      subtitle={relativeTime(gift.createdAt)}
      value={<GiftStatusBadge gift={gift} />}
    />
  )
}

/** Where a gift stands at a glance: green once it's opened, quiet otherwise */
export function GiftStatusBadge({ gift }: { gift: GiftView }) {
  const opened = gift.status === 'claimed'
  return (
    <span
      className={cn(
        // The row's value slot sets the number face; a status is words
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-sans text-xs font-medium',
        opened ? 'bg-gain/10 text-gain' : 'bg-secondary text-muted-foreground',
      )}
    >
      {opened && <CheckIcon className="size-3.5" weight="bold" />}
      {giftStatus(gift)}
    </span>
  )
}
