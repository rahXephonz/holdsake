import { createFileRoute } from '@tanstack/react-router'
import HomeScreen from '@/components/screens/home-screen'

export const Route = createFileRoute('/')({ component: HomeScreen })
