import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { ChangeText } from '@/components/change-text'
import { ListRow } from '@/components/list-row'
import { RowsSkeleton, Screen, ScreenTitle } from '@/components/screen'
import { StockLogo } from '@/components/stock-logo'
import { Input } from '@/components/ui/input'
import { useStocksQuery } from '@/lib/client/queries'
import { formatUsd } from '@/lib/format'

/** Public: anyone can browse prices before signing in */
export default function StocksScreen() {
  const stocks = useStocksQuery()
  const [query, setQuery] = useState('')
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
      <div className="pb-6">
        {stocks.isPending && <RowsSkeleton rows={8} />}
        {filtered.map((stock) => (
          <ListRow
            key={stock.address}
            to="/stocks/$ticker"
            params={{ ticker: stock.ticker }}
            leading={<StockLogo ticker={stock.ticker} logoUrl={stock.logoUrl} />}
            title={stock.name}
            subtitle={stock.tradable ? stock.ticker : `${stock.ticker} · not trading here yet`}
            value={stock.pricePerShare === null ? '—' : formatUsd(stock.pricePerShare)}
            valueSub={<ChangeText percent={stock.changePct ?? null} className="text-sm" />}
          />
        ))}
      </div>
    </Screen>
  )
}
