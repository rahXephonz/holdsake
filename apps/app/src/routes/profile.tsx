import { createFileRoute } from '@tanstack/react-router'
import ProfileScreen from '@/components/screens/profile-screen'

export const Route = createFileRoute('/profile')({ component: ProfileScreen })
