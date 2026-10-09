import { createFileRoute } from '@tanstack/react-router'
import FundsScreen from '@/components/screens/funds-screen'

export const Route = createFileRoute('/funds/')({ component: FundsScreen })
