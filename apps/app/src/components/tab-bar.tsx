import { Link, type ToPathOption } from '@tanstack/react-router'
import { BasketIcon, GiftIcon, HouseIcon, UserIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/', label: 'Home', Icon: HouseIcon },
  { to: '/stocks', label: 'Stocks', Icon: BasketIcon },
  { to: '/gifts', label: 'Gifts', Icon: GiftIcon },
  { to: '/profile', label: 'Profile', Icon: UserIcon },
] as const

export type Tab = (typeof TABS)[number]['to']

export function TabBar({ active }: { active: Tab }) {
  return (
    <nav className="sticky bottom-0 z-20 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {TABS.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to as ToPathOption}
            aria-current={active === to ? 'page' : undefined}
            className={cn(
              'flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium',
              active === to ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-5" weight={active === to ? 'fill' : 'regular'} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
