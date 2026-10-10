import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  ArrowDownLeftIcon,
  BellIcon,
  GiftIcon,
  PiggyBankIcon,
  PlusIcon,
} from '@phosphor-icons/react'
import { ChangeText } from '@/components/change-text'
import { GiftsWaiting } from '@/components/gifts-waiting'
import { ListRow } from '@/components/list-row'
import { EmptyState, Loading, Screen, SectionTitle, RowsSkeleton } from '@/components/screen'
import { Skeleton } from '@/components/ui/skeleton'
import { BorrowHomeCard } from '@/components/screens/borrow-screen'
import { EarnHomeCard } from '@/components/screens/earn-screen'
import { unlockLabel } from '@/components/screens/funds-screen'
import { StockRow } from '@/components/screens/stocks-screen'
import { StockLogo } from '@/components/stock-logo'
import { buttonVariants } from '@/components/ui/button'
import {
  useBorrowQuery,
  useEarnQuery,
  useGiftsQuery,
  useFundsQuery,
  useNotificationsQuery,
  usePortfolioQuery,
  useStocksQuery,
} from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { useWatchlist } from '@/lib/client/watchlist'
import { formatShares, formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function HomeScreen() {
  const session = useSession()
  const portfolio = usePortfolioQuery()
  const notifications = useNotificationsQuery()
  const funds = useFundsQuery()
  const earn = useEarnQuery()
  const borrow = useBorrowQuery()
  const gifts = useGiftsQuery()
  // Read the clock once for "days left"; the list refetches often enough to stay close
  const [now] = useState(() => Date.now())
  const unread = notifications.data?.filter((item) => !item.read).length ?? 0

  if (!session.ready) return <Loading />

  return (
    <Screen
      tab="/"
      title={<span className="font-heading text-xl font-bold">Holdsake</span>}
      action={
        <Link
          to="/notifications"
          aria-label={unread ? `${unread} new notifications` : 'Notifications'}
          className="relative flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <BellIcon className="size-5" />
          {unread > 0 && (
            <span className="absolute top-2 right-2 size-2 rounded-full bg-foreground" />
          )}
        </Link>
      }
    >
      <GiftsWaiting gifts={gifts.data} now={now} />

      <section className="pt-6 pb-2 text-center">
        <p className="text-sm text-muted-foreground">Total Balance</p>
        {portfolio.isPending ? (
          <div className="flex justify-center pt-2" aria-hidden="true">
            <Skeleton className="h-12 w-48" />
          </div>
        ) : (
          <p className="mt-1 font-number text-5xl font-bold tracking-tight tabular-nums">
            {portfolio.data ? formatUsd(portfolio.data.totalUsd) : '—'}
          </p>
        )}
        <p className="mt-2 font-number text-sm text-muted-foreground tabular-nums">
          {portfolio.data ? `${formatUsd(portfolio.data.cash.usdValue)} cash` : ' '}
        </p>
      </section>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <QuickAction to="/send" label="Send a gift" Icon={GiftIcon} primary />
        <QuickAction to="/add-cash" label="Add cash" Icon={PlusIcon} />
        <QuickAction to="/gifts" label="Received" Icon={ArrowDownLeftIcon} />
      </div>

      <EarnHomeCard data={earn.data} />
      <BorrowHomeCard data={borrow.data} />

      <SectionTitle
        action={
          <Link to="/stocks" className="text-sm text-muted-foreground">
            Browse
          </Link>
        }
      >
        Your stocks
      </SectionTitle>
      {portfolio.isPending ? (
        <RowsSkeleton rows={3} />
      ) : !portfolio.data?.holdings.length ? (
        <EmptyState
          title="No stocks yet"
          body="Buy a few shares, or wait for someone to send you some."
          action={
            <Link to="/stocks" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              Browse stocks
            </Link>
          }
        />
      ) : (
        <div>
          {portfolio.data.holdings.map((holding) => (
            <ListRow
              key={holding.stock.address}
              to="/stocks/$ticker"
              params={{ ticker: holding.stock.ticker }}
              leading={<StockLogo ticker={holding.stock.ticker} logoUrl={holding.stock.logoUrl} />}
              title={holding.stock.name}
              subtitle={`${formatShares(holding.shares)} shares`}
              value={holding.usdValue === null ? '—' : formatUsd(holding.usdValue)}
              valueSub={
                <ChangeText percent={holding.stock.changePct ?? null} className="text-sm" />
              }
            />
          ))}
        </div>
      )}

      <WatchlistSection />

      <SectionTitle
        action={
          funds.data?.length ? (
            <Link to="/funds" className="text-sm text-muted-foreground">
              See all
            </Link>
          ) : undefined
        }
      >
        Your funds
      </SectionTitle>
      <div className="pb-6">
        {funds.isPending ? (
          <RowsSkeleton rows={2} />
        ) : !funds.data?.length ? (
          <ListRow
            to="/funds/new"
            leading={<FundBadge />}
            title="Start a goal fund"
            subtitle="Shares for someone, locked until a date"
          />
        ) : (
          // The few newest; the rest are a tap away
          funds.data
            .slice(0, 3)
            .map((fund) => (
              <ListRow
                key={fund.id}
                to={`/fund/${fund.id}`}
                leading={<FundBadge />}
                title={fund.name}
                subtitle={
                  fund.unlocked
                    ? `For ${fund.beneficiaryName} · Unlocked`
                    : `For ${fund.beneficiaryName} · Unlocks ${unlockLabel(fund.unlockAt)}`
                }
                value={formatUsd(fund.totalUsd)}
              />
            ))
        )}
      </div>
    </Screen>
  )
}

const WATCHLIST_ON_HOME = 5

/** Hidden until something is hearted; the full list has its own screen */
function WatchlistSection() {
  const { tickers } = useWatchlist()
  const stocks = useStocksQuery()
  if (!tickers.length) return null
  const byTicker = new Map((stocks.data ?? []).map((stock) => [stock.ticker, stock]))
  const watched = tickers.flatMap((ticker) => byTicker.get(ticker) ?? [])
  return (
    <>
      <SectionTitle
        action={
          watched.length > WATCHLIST_ON_HOME ? (
            <Link to="/watchlist" className="text-sm text-muted-foreground">
              View all
            </Link>
          ) : undefined
        }
      >
        Watchlist
      </SectionTitle>
      {stocks.isPending ? (
        <RowsSkeleton rows={Math.min(tickers.length, WATCHLIST_ON_HOME)} />
      ) : (
        watched
          .slice(0, WATCHLIST_ON_HOME)
          .map((stock) => <StockRow key={stock.address} stock={stock} />)
      )}
    </>
  )
}

function QuickAction({
  to,
  label,
  Icon,
  primary,
}: {
  to: string
  label: string
  Icon: typeof GiftIcon
  primary?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-sm font-medium',
        primary ? 'bg-primary text-primary-foreground' : 'bg-secondary',
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  )
}

/** Same size as a stock logo, so fund rows line up with the stocks above */
function FundBadge() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
      <PiggyBankIcon className="size-5" />
    </span>
  )
}
