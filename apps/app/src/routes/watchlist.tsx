import { createFileRoute } from '@tanstack/react-router'
import WatchlistScreen from '@/components/screens/watchlist-screen'

export const Route = createFileRoute('/watchlist')({ component: WatchlistScreen })
