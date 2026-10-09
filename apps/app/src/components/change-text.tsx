import { formatPercent, formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Gain/loss is the only place colour shows up besides the primary action */
export function ChangeText({
  percent,
  amount,
  className,
}: {
  percent: number | null
  /** Dollar change; shown before the percent when given */
  amount?: number | null
  className?: string
}) {
  if (percent === null) return null
  const sign = amount && amount > 0 ? '+' : amount && amount < 0 ? '−' : ''
  return (
    <span
      className={cn(
        'font-number tabular-nums',
        percent > 0 ? 'text-gain' : percent < 0 ? 'text-loss' : 'text-muted-foreground',
        className,
      )}
    >
      {amount === null || amount === undefined
        ? formatPercent(percent)
        : `${sign}${formatUsd(Math.abs(amount))} (${formatPercent(percent)})`}
    </span>
  )
}
