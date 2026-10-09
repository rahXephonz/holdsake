import { createFileRoute } from '@tanstack/react-router'
import CreateFundScreen from '@/components/screens/create-fund-screen'

export const Route = createFileRoute('/funds/new')({ component: CreateFundScreen })
