import { Link, useNavigate } from '@tanstack/react-router'
import { CaretRightIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Loading, Screen, ScreenTitle, SectionTitle } from '@/components/screen'
import { Avatar } from '@/components/stock-logo'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/client/session'

export default function ProfileScreen() {
  const session = useSession()
  const navigate = useNavigate()
  if (!session.ready || !session.profile) return <Loading />
  const { profile } = session

  const signOut = async () => {
    await session.logout()
    void navigate({ to: '/login', replace: true })
  }

  return (
    <Screen tab="/profile">
      <ScreenTitle>Profile</ScreenTitle>
      <div className="mt-4 flex items-center gap-4">
        <Avatar name={profile.name ?? ''} url={profile.avatarUrl} size={64} />
        <div className="min-w-0">
          <p className="truncate text-xl font-medium">{profile.name}</p>
          <p className="truncate text-muted-foreground">@{profile.handle}</p>
        </div>
      </div>

      <SectionTitle>Money</SectionTitle>
      <MenuLink to="/add-cash">Add cash</MenuLink>
      <MenuLink to="/cash-out">Cash out</MenuLink>
      <MenuLink to="/funds">Goal funds</MenuLink>
      <MenuLink to="/earn">Earn</MenuLink>
      <MenuLink to="/borrow">Borrow</MenuLink>

      <SectionTitle>Account</SectionTitle>
      <MenuRow label="Email" value={profile.email ?? '—'} />
      <MenuLink to="/notifications">Activity</MenuLink>

      <div className="mt-10 pb-8">
        <Button variant="destructive" size="xl" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </Screen>
  )
}

function MenuLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="-mx-2 flex items-center rounded-2xl px-2 py-3.5 hover:bg-muted/60">
      <span className="flex-1">{children}</span>
      <CaretRightIcon className="size-4 text-muted-foreground" />
    </Link>
  )
}

function MenuRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center py-3.5">
      <span className="flex-1">{label}</span>
      <span className="truncate text-muted-foreground">{value}</span>
    </div>
  )
}
