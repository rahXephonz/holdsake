import { createFileRoute } from '@tanstack/react-router'
import SendGiftScreen from '@/components/screens/send-gift-screen'

export const Route = createFileRoute('/send')({
  validateSearch: (search: Record<string, unknown>): { stock?: string } =>
    typeof search.stock === 'string' ? { stock: search.stock.toUpperCase() } : {},
  component: function Send() {
    const { stock } = Route.useSearch()
    return <SendGiftScreen stock={stock} />
  },
})
