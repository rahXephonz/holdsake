import { createFileRoute } from '@tanstack/react-router'
import TradeScreen from '@/components/screens/trade-screen'

export const Route = createFileRoute('/trade/$ticker')({
  validateSearch: (search: Record<string, unknown>): { side?: 'sell' } =>
    search.side === 'sell' ? { side: 'sell' } : {},
  component: function Trade() {
    const { ticker } = Route.useParams()
    const { side } = Route.useSearch()
    return <TradeScreen ticker={ticker.toUpperCase()} side={side ?? 'buy'} />
  },
})
