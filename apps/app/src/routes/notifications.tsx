import { createFileRoute } from '@tanstack/react-router'
import NotificationsScreen from '@/components/screens/notifications-screen'

export const Route = createFileRoute('/notifications')({ component: NotificationsScreen })
