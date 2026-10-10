import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Plain row: leading avatar or logo, name, one line under it, value on the right */
export function ListRow({
  leading,
  title,
  subtitle,
  value,
  valueSub,
  to,
  params,
  onClick,
  className,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  value?: ReactNode
  valueSub?: ReactNode
  to?: string
  params?: Record<string, string>
  onClick?: () => void
  className?: string
}) {
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {subtitle && (
          <div className="truncate font-number text-sm text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {(value !== undefined || valueSub !== undefined) && (
        <div className="text-right font-number tabular-nums">
          {value !== undefined && <div className="font-medium">{value}</div>}
          {valueSub !== undefined && <div className="text-sm">{valueSub}</div>}
        </div>
      )}
    </>
  )
  const rowClass = cn('-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 text-left', className)
  if (to)
    return (
      <Link to={to} params={params} className={cn(rowClass, 'hover:bg-muted/60')}>
        {body}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(rowClass, 'w-full hover:bg-muted/60')}>
        {body}
      </button>
    )
  return <div className={rowClass}>{body}</div>
}
