import { Link } from '@tanstack/react-router'
import { ArrowsLeftRightIcon, HeartIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react'
import { usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'
import { Screen, SectionTitle } from '@/components/screen'
import { StockLogo } from '@/components/stock-logo'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePortfolioQuery, useStockProfileQuery, useStockQuery } from '@/lib/client/queries'
import { useWatchlist } from '@/lib/client/watchlist'
import { formatShares, formatUsd, relativeTime } from '@/lib/format'
import type { CompanyProfile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { PriceChart } from '@/components/price-chart'

export default function StockScreen({ ticker }: { ticker: string }) {
  const stock = useStockQuery(ticker)
  const { authenticated } = usePrivy()
  const portfolio = usePortfolioQuery()
  const holding = portfolio.data?.holdings.find((item) => item.stock.ticker === ticker)
  const profile = useStockProfileQuery(ticker)

  if (stock.isPending) return <StockSkeleton />
  if (!stock.data)
    return (
      <Screen back="/stocks" title="">
        <p className="py-16 text-center text-muted-foreground">We don’t offer that stock.</p>
      </Screen>
    )

  const { data } = stock
  return (
    <Screen
      back="/stocks"
      title=""
      action={<WatchButton ticker={data.ticker} name={data.name} />}
      footer={
        authenticated &&
        (holding || data.tradable) && (
          <div className="flex gap-3">
            {holding && (
              <Link
                to="/send"
                search={{ stock: data.ticker }}
                className={buttonVariants({
                  variant: data.tradable ? 'secondary' : 'default',
                  size: 'xl',
                  className: 'flex-1',
                })}
              >
                Gift
              </Link>
            )}
            {data.tradable && (
              <Link
                to="/trade/$ticker"
                params={{ ticker: data.ticker }}
                className={buttonVariants({ size: 'xl', className: 'flex-1' })}
              >
                Buy
              </Link>
            )}
          </div>
        )
      }
    >
      <div className="flex items-center gap-3 pt-2">
        <StockLogo ticker={data.ticker} logoUrl={data.logoUrl} size={44} />
        <div className="min-w-0">
          <h1 className="truncate font-sans text-lg leading-tight font-medium">{data.name}</h1>
          <p className="text-sm text-muted-foreground">{data.ticker}</p>
        </div>
      </div>
      <PriceChart stock={data} />
      {data.priceSource === 'chainlink' && data.priceAt && (
        <p className="mt-3 text-xs text-muted-foreground">
          Price updated {relativeTime(data.priceAt)}. It pauses from Friday evening until Monday.
        </p>
      )}
      {!data.tradable && (
        <p className="mt-6 rounded-2xl bg-secondary p-4 text-sm">
          This one can’t be bought or sold here yet. You can still receive it and gift it.
        </p>
      )}

      {authenticated && portfolio.isPending && (
        <>
          <SectionTitle>You own</SectionTitle>
          <Skeleton className="h-[8.5rem] rounded-3xl" />
        </>
      )}

      {holding && (
        <>
          <SectionTitle>You own</SectionTitle>
          <div className="rounded-3xl bg-secondary p-4">
            <div className="grid grid-cols-2 gap-3 px-1">
              <div>
                <p className="text-sm text-muted-foreground">Shares</p>
                <p className="mt-0.5 font-number text-xl font-medium tabular-nums">
                  {formatShares(holding.shares)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Worth</p>
                <p className="mt-0.5 font-number text-xl font-medium tabular-nums">
                  {holding.usdValue === null ? '—' : formatUsd(holding.usdValue)}
                </p>
              </div>
            </div>
            {/* Secondary moves on what you hold; the screen's one primary action stays Buy */}
            <div className={cn('mt-4 grid gap-2', data.tradable ? 'grid-cols-2' : 'grid-cols-1')}>
              {data.tradable && (
                <HoldingAction
                  to="/trade/$ticker"
                  params={{ ticker: data.ticker }}
                  search={{ side: 'sell' }}
                  Icon={ArrowsLeftRightIcon}
                  label="Sell"
                />
              )}
              <HoldingAction
                to="/send-stocks"
                search={{ stock: data.ticker }}
                Icon={PaperPlaneTiltIcon}
                label="Send out"
              />
            </div>
          </div>
        </>
      )}

      {profile.isPending ? (
        <>
          <SectionTitle>About {data.name}</SectionTitle>
          <div className="space-y-2.5" aria-hidden="true">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </>
      ) : (
        profile.data && <About name={data.name} profile={profile.data} />
      )}

      <SectionTitle>About these shares</SectionTitle>
      <p className="pb-8 text-sm leading-relaxed text-muted-foreground">
        Each share here tracks one share of {data.name}, held by Robinhood. Dividends and splits are
        reflected in the number of shares you see. You can gift, sell or send them any time.
      </p>
    </Screen>
  )
}

function WatchButton({ ticker, name }: { ticker: string; name: string }) {
  const { tickers, toggle } = useWatchlist()
  const watching = tickers.includes(ticker)
  return (
    <button
      type="button"
      onClick={() => toggle(ticker)}
      aria-pressed={watching}
      aria-label={watching ? `Remove ${name} from your watchlist` : `Add ${name} to your watchlist`}
      className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
    >
      {/* Filled, not red: colour is kept for gain/loss and the one action */}
      <HeartIcon weight={watching ? 'fill' : 'regular'} className="size-6" />
    </button>
  )
}

function About({ name, profile }: { name: string; profile: CompanyProfile }) {
  const [open, setOpen] = useState(false)
  // Short descriptions show whole; only long ones get folded
  const long = profile.description.length > 240
  const facts = [
    ['Sector', profile.sector],
    ['Industry', profile.industry],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]))

  return (
    <>
      <SectionTitle>About {name}</SectionTitle>
      <p className={cn('leading-relaxed', long && !open && 'line-clamp-4')}>
        {profile.description}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-1 text-sm font-medium"
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
      {facts.length > 0 && (
        <dl className="mt-4">
          {facts.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

/** Same shape as the loaded page, so it settles in place instead of jumping */
function StockSkeleton() {
  return (
    <Screen back="/stocks" title="">
      <div aria-hidden="true">
        <div className="flex items-center gap-3 pt-2">
          <Skeleton className="size-11 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
        <Skeleton className="mt-6 h-12 w-48" />
        <Skeleton className="mt-3 h-4 w-40" />
        <Skeleton className="mt-4 h-[200px] rounded-2xl bg-muted/50" />
        <Skeleton className="mt-4 h-9 w-full rounded-full bg-muted/50" />
        <Skeleton className="mt-8 h-5 w-36" />
        <div className="mt-3 space-y-2.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </Screen>
  )
}

function HoldingAction({
  to,
  params,
  search,
  Icon,
  label,
}: {
  to: string
  params?: Record<string, string>
  search?: Record<string, string>
  Icon: typeof HeartIcon
  label: string
}) {
  return (
    <Link
      to={to}
      params={params}
      search={search}
      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-background text-sm font-medium hover:bg-muted"
    >
      <Icon className="size-4" />
      {label}
    </Link>
  )
}
