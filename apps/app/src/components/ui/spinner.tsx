import { Ring2 } from 'ldrs/react'
import 'ldrs/react/Ring2.css'
import { cn } from 'cn'

function Spinner({
  size = 20,
  color = 'var(--muted-foreground)',
  className,
}: {
  size?: number
  color?: string
  className?: string
}) {
  return (
    <output data-slot="spinner" aria-label="Loading" className={cn('inline-flex', className)}>
      <Ring2
        size={size}
        stroke={Math.max(2, size / 10)}
        strokeLength={0.25}
        bgOpacity={0.1}
        speed={0.8}
        color={color}
      />
    </output>
  )
}

export { Spinner }
