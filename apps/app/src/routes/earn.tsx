import { createFileRoute } from '@tanstack/react-router'
import EarnScreen from '@/components/screens/earn-screen'

export const Route = createFileRoute('/earn')({ component: EarnScreen })
