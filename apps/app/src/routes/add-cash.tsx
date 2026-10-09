import { createFileRoute } from '@tanstack/react-router'
import AddCashScreen from '@/components/screens/add-cash-screen'

export const Route = createFileRoute('/add-cash')({ component: AddCashScreen })
