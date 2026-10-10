import { Link } from '@tanstack/react-router'
import { EmptyState, RowsSkeleton, Screen } from '@/components/screen'
import { StockRow } from '@/components/screens/stocks-screen'
import { buttonVariants } from '@/components/ui/button'
import { useStocksQuery } from '@/lib/client/queries'
import { useWatchlist } from '@/lib/client/watchlist'

export default function WatchlistScreen() {
  const { tickers } = useWatchlist()
  const stocks = useStocksQuery()
  const byTicker = new Map((stocks.data ?? []).map((stock) => [stock.ticker, stock]))
  const watched = tickers.flatMap((ticker) => byTicker.get(ticker) ?? [])

  return (
    <Screen back="/" title="Watchlist">
      <div className="pb-6">
        {stocks.isPending && tickers.length > 0 ? (
          <RowsSkeleton rows={Math.min(tickers.length, 8)} />
        ) : !watched.length ? (
          <EmptyState
            title="Nothing here yet"
            body="Tap the heart on any stock to keep an eye on it."
            action={
              <Link to="/stocks" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
                Browse stocks
              </Link>
            }
          />
        ) : (
          watched.map((stock) => <StockRow key={stock.address} stock={stock} />)
        )}
      </div>
    </Screen>
  )
}
