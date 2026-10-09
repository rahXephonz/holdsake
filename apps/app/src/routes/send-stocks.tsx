import { createFileRoute } from '@tanstack/react-router'
import SendOutScreen from '@/components/screens/send-out-screen'

export const Route = createFileRoute('/send-stocks')({
  validateSearch: (search: Record<string, unknown>): { stock?: string } =>
    typeof search.stock === 'string' ? { stock: search.stock.toUpperCase() } : {},
  component: function SendStocks() {
    const { stock } = Route.useSearch()
    return <SendOutScreen mode="stock" ticker={stock} />
  },
})
