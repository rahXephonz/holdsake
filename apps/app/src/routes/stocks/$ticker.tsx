import { createFileRoute } from '@tanstack/react-router'
import StockScreen from '@/components/screens/stock-screen'

export const Route = createFileRoute('/stocks/$ticker')({
  component: function Stock() {
    const { ticker } = Route.useParams()
    return <StockScreen ticker={ticker.toUpperCase()} />
  },
})
