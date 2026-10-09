import { useRouter } from '@tanstack/react-router'
import { CaretLeftIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { TabBar, type Tab } from '@/components/tab-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * Every screen's frame: phone-width column, optional back header, content, then either the tab
 * bar (top-level places) or a pinned footer holding the one primary action.
 */
export function Screen({
  title,
  back,
  tab,
  action,
  footer,
  className,
  children,
}: {
  title?: ReactNode
  /** Shows a back arrow; history back when there is history, otherwise this path */
  back?: string
  tab?: Tab
  /** Right side of the header */
  action?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else void router.navigate({ to: back ?? '/' })
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      {(title !== undefined || back !== undefined || action) && (
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
          {back !== undefined ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
            >
              <CaretLeftIcon className="size-6" />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <div className="min-w-0 flex-1 truncate text-base font-medium">{title}</div>
          <div className="flex items-center pr-2">{action}</div>
        </header>
      )}
      <main className={cn('flex flex-1 flex-col px-5', className)}>{children}</main>
      {footer && (
        <div className="sticky bottom-0 bg-background px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
      {tab && <TabBar active={tab} />}
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner size={28} />
    </div>
  )
}

/** Stand-in for a list of ListRows while it loads, same height so nothing jumps */
export function RowsSkeleton({ rows = 4, leading = true }: { rows?: number; leading?: boolean }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-3">
          {leading && <Skeleton className="size-10 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className="pt-4 pb-2 text-3xl font-bold tracking-tight">{children}</h1>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-8 mb-2 flex items-center justify-between">
      <h2 className="font-sans text-lg font-medium">{children}</h2>
      {action}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
