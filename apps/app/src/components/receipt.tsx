import type { ReactNode } from 'react'

/** A short receipt of labelled rows: what confirmation screens show before the one button */
export function Receipt({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-col divide-y divide-border/60">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-6 py-3.5">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right font-number font-medium tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
