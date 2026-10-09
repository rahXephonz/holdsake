import { createFileRoute } from '@tanstack/react-router'
import SendOutScreen from '@/components/screens/send-out-screen'

export const Route = createFileRoute('/cash-out')({
  component: () => <SendOutScreen mode="cash" />,
})
