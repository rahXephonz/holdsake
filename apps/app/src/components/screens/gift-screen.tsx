import { ArrowUUpLeftIcon, CheckIcon, DownloadSimpleIcon } from '@phosphor-icons/react'
import { GiftCard } from '@/components/gift-card'
import { Receipt } from '@/components/receipt'
import { ShareGiftLink } from '@/components/share-gift-link'
import { describeItems, giftStatus } from '@/components/screens/gifts-screen'
import { motion } from 'motion/react'
import { robinhoodChain } from '@holdsake/sdk'
import { Loading, Screen } from '@/components/screen'
import { Avatar, StockLogo } from '@/components/stock-logo'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/client/api'
import { useGiftQuery, useSettleGiftMutation } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatShares, formatUsd } from '@/lib/format'
import { ListRow } from '@/components/list-row'
import type { GiftView } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function GiftScreen({ id }: { id: string }) {
  const session = useSession()
  const gift = useGiftQuery(id)
  const settle = useSettleGiftMutation(id)

  if (!session.ready || gift.isPending) return <Loading />
  if (gift.isError || !gift.data)
    return (
      <Screen back="/gifts" title="">
        <p className="py-16 text-center text-muted-foreground">{errorMessage(gift.error)}</p>
      </Screen>
    )

  const data = gift.data
  const person = data.role === 'sender' ? data.recipient : data.sender
  const action = data.canClaim ? 'claim' : data.canRefund ? 'refund' : null
  const done = settle.isSuccess

  return (
    <Screen
      back="/gifts"
      title=""
      footer={
        action &&
        !done && (
          <>
            {settle.error && (
              <p className="mb-3 text-center text-sm text-destructive">
                {errorMessage(settle.error)}
              </p>
            )}
            <Button
              size="xl"
              variant={action === 'refund' ? 'secondary' : 'default'}
              disabled={settle.isPending}
              onClick={() => settle.mutate(action)}
            >
              {settle.isPending
                ? action === 'claim'
                  ? 'Opening…'
                  : 'Taking it back…'
                : action === 'claim'
                  ? 'Open gift'
                  : 'Take it back'}
            </Button>
          </>
        )
      }
    >
      {/* The card comes first, like opening an envelope; the person and amount follow */}
      <GiftCard
        theme={data.cardTheme}
        recipientName={data.recipient.name}
        senderName={data.sender.name}
        message={data.message}
        animate
        className="mt-2"
      />
      <div className="mt-3 flex justify-center">
        <a
          href={`/api/gifts/${data.id}/card.png`}
          download={`holdsake-gift-${data.id.slice(0, 8)}.png`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium"
        >
          <DownloadSimpleIcon className="size-4" />
          Save card
        </a>
      </div>

      <div className="flex flex-col items-center pt-6 text-center">
        <Avatar name={person.name} url={person.avatarUrl} size={56} />
        <p className="mt-3 text-muted-foreground">
          {data.role === 'sender' ? `To ${data.recipient.name}` : `From ${data.sender.name}`}
        </p>
        <p className="mt-1 font-number text-5xl font-bold tracking-tight tabular-nums">
          {formatUsd(data.totalUsd)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {done
            ? action === 'claim'
              ? 'It’s yours now'
              : 'It’s claimed by you'
            : giftStatus(data)}
        </p>
        {done && (
          <motion.span
            className="mt-4 flex size-12 items-center justify-center rounded-full bg-gain text-white"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          >
            <CheckIcon className="size-6" weight="bold" />
          </motion.span>
        )}
      </div>

      {!done && (data.status === 'claimed' || data.status === 'refunded') && (
        <SettledPanel gift={data} />
      )}

      {/* Still waiting: the sender can pass the link on again */}
      {data.role === 'sender' &&
        (data.status === 'pending' || data.status === 'opened') &&
        !data.expired && (
          <div className="mt-6 flex justify-center">
            <ShareGiftLink giftId={data.id} compact />
          </div>
        )}

      <div className="mt-6">
        {data.items.map((item) => (
          <ListRow
            key={item.token}
            leading={<StockLogo ticker={item.ticker ?? '$'} />}
            title={item.name}
            subtitle={[
              item.kind === 'stock' && item.shares !== null
                ? `${formatShares(item.shares)} shares`
                : 'Cash',
              // Once opened it moved; say where it is now
              data.status === 'claimed'
                ? data.role === 'sender'
                  ? 'in their account'
                  : 'in your account'
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            value={item.usdValue === null ? '—' : formatUsd(item.usdValue)}
          />
        ))}
      </div>

      {data.status !== 'claimed' && data.status !== 'refunded' && data.expiresAt && (
        <div className="mt-4 pb-6">
          <Receipt
            rows={[
              {
                label: 'Opens until',
                value: new Date(data.expiresAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                }),
              },
              ...(data.role === 'sender' ? [{ label: 'Gift', value: describeItems(data) }] : []),
            ]}
          />
          <p className="mt-4 text-sm text-muted-foreground">
            {data.role === 'sender'
              ? 'You can take it back until they open it. If they don’t open it in time, it comes back to you.'
              : 'Opening moves it into your account. The small fee to move it comes from your cash, or from what’s inside.'}
          </p>
        </div>
      )}
    </Screen>
  )
}

/** For a gift that's done: who opened it (or that it came back), when, and the receipt */
function SettledPanel({ gift }: { gift: GiftView }) {
  const opened = gift.status === 'claimed'
  const when = gift.settledAt
    ? new Date(gift.settledAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null
  const title = opened
    ? gift.role === 'sender'
      ? `${gift.recipient.name} opened it`
      : 'You opened it'
    : gift.role === 'sender'
      ? 'It came back to you'
      : 'It went back to the sender'
  return (
    <div
      className={cn(
        'mt-8 flex items-center gap-3 rounded-2xl p-4',
        opened ? 'bg-gain/10' : 'bg-secondary',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          opened ? 'bg-gain text-white' : 'bg-background text-muted-foreground',
        )}
      >
        {opened ? (
          <CheckIcon className="size-5" weight="bold" />
        ) : (
          <ArrowUUpLeftIcon className="size-5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {when && <p className="text-sm text-muted-foreground">{when}</p>}
      </div>
      {gift.settleTx && (
        <a
          href={`${robinhoodChain.blockExplorers.default.url}/tx/${gift.settleTx}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Receipt
        </a>
      )}
    </div>
  )
}
