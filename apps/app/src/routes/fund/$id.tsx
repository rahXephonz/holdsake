import { createFileRoute } from '@tanstack/react-router'
import FundScreen from '@/components/screens/fund-screen'

export const Route = createFileRoute('/fund/$id')({
  component: function Fund() {
    const { id } = Route.useParams()
    return <FundScreen id={id} />
  },
})
