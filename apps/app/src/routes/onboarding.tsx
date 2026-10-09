import { createFileRoute } from '@tanstack/react-router'
import OnboardingScreen from '@/components/screens/onboarding-screen'
import { validateNextSearch } from '@/lib/client/next'

export const Route = createFileRoute('/onboarding')({
  validateSearch: validateNextSearch,
  component: function Onboarding() {
    const { next } = Route.useSearch()
    return <OnboardingScreen next={next} />
  },
})
