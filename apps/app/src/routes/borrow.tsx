import { createFileRoute } from '@tanstack/react-router'
import BorrowScreen from '@/components/screens/borrow-screen'

export const Route = createFileRoute('/borrow')({ component: BorrowScreen })
