import { createFileRoute } from '@tanstack/react-router'
import GiftsScreen from '@/components/screens/gifts-screen'

export const Route = createFileRoute('/gifts')({ component: GiftsScreen })
