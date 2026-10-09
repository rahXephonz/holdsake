import { createFileRoute } from '@tanstack/react-router'
import StocksScreen from '@/components/screens/stocks-screen'

export const Route = createFileRoute('/stocks/')({ component: StocksScreen })
