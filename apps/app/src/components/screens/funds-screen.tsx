import { Link } from '@tanstack/react-router'
import { ListRow } from '@/components/list-row'
import { EmptyState, Loading, Screen, RowsSkeleton } from '@/components/screen'
import { buttonVariants } from '@/components/ui/button'
import { useFundsQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { formatUsd } from '@/lib/format'

export const PURPOSES = {
  college: 'College',
  first_home: 'First home',
  wedding: 'Wedding',
  retirement: 'Retirement',
  other: 'Something else',
} as const

export const PURPOSE_KEYS = ['college', 'first_home', 'wedding', 'retirement', 'other'] as const

export const purposeLabel = (purpose: string) =>
  Object.entries(PURPOSES).find(([key]) => key === purpose)?.[1] ?? 'Fund'

export const unlockLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export default function FundsScreen() {
  const session = useSession()
  const funds = useFundsQuery()
  if (!session.ready) return <Loading />

  return (
    <Screen
      back="/profile"
      title="Goal funds"
      footer={
        <Link to="/funds/new" className={buttonVariants({ size: 'xl' })}>
          Start a fund
        </Link>
      }
    >
      <p className="pt-2 text-muted-foreground">
        A pot of stocks for one person, locked until a date. Anyone with the link can add to it.
      </p>
      {funds.data?.length === 0 && <EmptyState title="No funds yet" />}
      <div className="mt-4 pb-6">
        {funds.isPending && <RowsSkeleton rows={3} leading={false} />}
        {funds.data?.map((fund) => (
          <ListRow
            key={fund.id}
            to={`/fund/${fund.id}`}
            title={fund.name}
            subtitle={`For ${fund.beneficiaryName} · ${fund.unlocked ? 'Unlocked' : `Unlocks ${unlockLabel(fund.unlockAt)}`}`}
            value={formatUsd(fund.totalUsd)}
          />
        ))}
      </div>
    </Screen>
  )
}
