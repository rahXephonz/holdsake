import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { ChangeText } from '@/components/change-text'
import { ListRow } from '@/components/list-row'
import { RowsSkeleton, Screen, ScreenTitle, SectionTitle } from '@/components/screen'
import { StockLogo } from '@/components/stock-logo'
import { Input } from '@/components/ui/input'
import { useStocksQuery } from '@/lib/client/queries'
import { useWatchlist } from '@/lib/client/watchlist'
import { formatUsd } from '@/lib/format'
import type { Stock } from '@/lib/types'
import { cn } from '@/lib/utils'

const MOVERS_SHOWN = 5

/** Public: anyone can browse prices before signing in */
export default function StocksScreen() {
  const stocks = useStocksQuery()
  const [query, setQuery] = useState('')
  const [moverSide, setMoverSide] = useState<'gainers' | 'losers'>('gainers')
  const { tickers: watched } = useWatchlist()
  const searching = query.trim() !== ''

  const watchlist = useMemo(() => {
    const byTicker = new Map((stocks.data ?? []).map((stock) => [stock.ticker, stock]))
    return watched.flatMap((ticker) => byTicker.get(ticker) ?? [])
  }, [stocks.data, watched])

  const movers = useMemo(() => {
    // Only stocks people can act on, with both prices known
    const moving = (stocks.data ?? []).filter(
      (stock): stock is Stock & { changePct: number } =>
        stock.tradable && stock.pricePerShare !== null && typeof stock.changePct === 'number',
    )
    return {
      gainers: moving
        .filter((stock) => stock.changePct > 0)
        .toSorted((a, b) => b.changePct - a.changePct)
        .slice(0, MOVERS_SHOWN),
      losers: moving
        .filter((stock) => stock.changePct < 0)
        .toSorted((a, b) => a.changePct - b.changePct)
        .slice(0, MOVERS_SHOWN),
    }
  }, [stocks.data])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    // Ones you can buy first, then the rest
    const list = (stocks.data ?? []).toSorted(
      (a, b) => Number(b.tradable) - Number(a.tradable) || a.name.localeCompare(b.name),
    )
    if (!needle) return list
    return list.filter(
      (stock) =>
        stock.ticker.toLowerCase().includes(needle) || stock.name.toLowerCase().includes(needle),
    )
  }, [stocks.data, query])

  return (
    <Screen tab="/stocks">
      <ScreenTitle>Stocks</ScreenTitle>
      <div className="relative mt-2 mb-4">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search stocks"
          className="h-11 rounded-full border-0 bg-secondary pl-9 text-base"
        />
      </div>
      {stocks.isError && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Prices didn’t load. Check your connection and try again.
        </p>
      )}
      {!searching && watchlist.length > 0 && (
        <>
          <SectionTitle>Watchlist</SectionTitle>
          {watchlist.map((stock) => (
            <StockRow key={stock.address} stock={stock} />
          ))}
        </>
      )}
      {!searching && (movers.gainers.length > 0 || movers.losers.length > 0) && (
        <>
          <div className="mt-8 mb-2 flex gap-2" role="tablist" aria-label="Biggest moves today">
            <MoverTab
              active={moverSide === 'gainers'}
              onClick={() => setMoverSide('gainers')}
              label="Top gainers"
            />
            <MoverTab
              active={moverSide === 'losers'}
              onClick={() => setMoverSide('losers')}
              label="Top losers"
            />
          </div>
          {movers[moverSide].length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {moverSide === 'gainers' ? 'Nothing is up today.' : 'Nothing is down today.'}
            </p>
          ) : (
            movers[moverSide].map((stock) => <StockRow key={stock.address} stock={stock} />)
          )}
          <p className="mt-1 text-xs text-muted-foreground">Change over the last 24 hours.</p>
        </>
      )}
      <div className="pb-6">
        {!searching && !stocks.isPending && <SectionTitle>All stocks</SectionTitle>}
        {stocks.isPending && <RowsSkeleton rows={8} />}
        {filtered.map((stock) => (
          <StockRow key={stock.address} stock={stock} />
        ))}
      </div>
    </Screen>
  )
}

export function StockRow({ stock }: { stock: Stock }) {
  return (
    <ListRow
      to="/stocks/$ticker"
      params={{ ticker: stock.ticker }}
      leading={<StockLogo ticker={stock.ticker} logoUrl={stock.logoUrl} />}
      title={stock.name}
      subtitle={stock.tradable ? stock.ticker : `${stock.ticker} · not trading here yet`}
      value={stock.pricePerShare === null ? '—' : formatUsd(stock.pricePerShare)}
      valueSub={<ChangeText percent={stock.changePct ?? null} className="text-sm" />}
    />
  )
}

function MoverTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'h-9 rounded-full px-4 text-sm font-medium',
        active ? 'bg-foreground text-background' : 'bg-secondary text-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
}
