import { createFileRoute } from '@tanstack/react-router'
import LoginScreen from '@/components/screens/login-screen'
import { validateNextSearch } from '@/lib/client/next'

export const Route = createFileRoute('/login')({
  validateSearch: validateNextSearch,
  component: function Login() {
    const { next } = Route.useSearch()
    return <LoginScreen next={next} />
  },
})
