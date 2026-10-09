import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ChangeText } from '@/components/change-text'
import { usePriceChartQuery } from '@/lib/client/queries'
import { formatUsd } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { CHART_RANGES, type ChartRange, type PricePoint, type Stock } from '@/lib/types'

const HEIGHT = 200
const PAD_Y = 14

const RANGE_LABEL: Record<ChartRange, string> = {
  '1D': 'Today',
  '1W': 'Past week',
  '1M': 'Past month',
  '1Y': 'Past year',
  '5Y': 'Past 5 years',
}

function pointTime(seconds: number, range: ChartRange) {
  const date = new Date(seconds * 1000)
  return range === '1D' || range === '1W'
    ? date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A stock's price as the hero, the line under it, and range tabs; drag to read any point */
export function PriceChart({ stock }: { stock: Stock }) {
  const [range, setRange] = useState<ChartRange>('1M')
  const [hover, setHover] = useState<number | null>(null)
  const chart = usePriceChartQuery(stock.ticker, range)
  // The previous range stays on screen while the new one loads; it's dimmed, not trusted
  const switching = chart.isPlaceholderData
  const loading = chart.isPending || switching
  const points = chart.data?.points ?? []
  const active = hover === null ? undefined : points[hover]
  const first = points[0]?.price
  const shown = active?.price ?? stock.pricePerShare
  const change =
    active && first ? ((active.price - first) / first) * 100 : (chart.data?.changePct ?? null)
  const changeAmount = shown !== null && first ? shown - first : null

  return (
    <section aria-label={`${stock.name} price`} className="mt-6">
      <p className="font-number text-5xl font-bold tracking-tight tabular-nums">
        {shown === null ? 'No price' : formatUsd(shown)}
      </p>
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-2 text-sm">
        {loading ? (
          <Skeleton className="h-4 w-40" />
        ) : (
          <>
            <ChangeText percent={change} amount={changeAmount} className="font-medium" />
            <span className="text-muted-foreground">
              {active ? pointTime(active.t, range) : RANGE_LABEL[range]}
            </span>
          </>
        )}
      </div>

      <Plot
        points={points}
        hover={hover}
        onHover={setHover}
        pending={chart.isPending}
        switching={switching}
        up={(chart.data?.changePct ?? 0) >= 0}
        label={`${stock.name}, ${RANGE_LABEL[range].toLowerCase()}`}
      />

      <div className="mt-4 grid grid-cols-5 gap-1" role="tablist" aria-label="Chart range">
        {CHART_RANGES.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={range === option}
            onClick={() => {
              setRange(option)
              setHover(null)
            }}
            className={cn(
              'h-9 rounded-full text-sm font-medium transition-colors',
              range === option
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option}
          </button>
        ))}
      </div>
      {chart.data?.source === 'market' && !loading && (
        <p className="mt-3 text-xs text-muted-foreground">
          Chart uses daily closing prices from the stock market.
        </p>
      )}
    </section>
  )
}

/** First load: a faint flat line where the chart will be, so the page keeps its shape */
function PlotSkeleton() {
  return (
    <div className="relative h-full" aria-hidden="true">
      <Skeleton className="absolute inset-0 rounded-2xl bg-muted/50" />
      <div className="absolute inset-x-0 top-1/2 flex justify-center">
        <Spinner size={24} />
      </div>
    </div>
  )
}

function Plot({
  points,
  hover,
  onHover,
  pending,
  switching,
  up,
  label,
}: {
  points: PricePoint[]
  hover: number | null
  onHover: (index: number | null) => void
  pending: boolean
  /** A new range is loading; the old line stays, dimmed */
  switching: boolean
  up: boolean
  label: string
}) {
  const [width, setWidth] = useState(350)
  const frame = useRef<HTMLDivElement>(null)
  const gradientId = useId()
  // Gain/loss is the only colour on the page besides the primary action
  const color = up ? 'var(--gain)' : 'var(--loss)'

  useEffect(() => {
    const node = frame.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(1, Math.round(entry.contentRect.width)))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const geometry = useMemo(() => {
    if (points.length < 2) return null
    const prices = points.map((point) => point.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const span = max - min || max * 0.01 || 1
    const x = (index: number) => (index / (points.length - 1)) * width
    const y = (price: number) => PAD_Y + (1 - (price - min) / span) * (HEIGHT - PAD_Y * 2)
    const coords = points.map((point, index) => [x(index), y(point.price)] as const)
    const line = coords
      .map(([cx, cy], index) => `${index ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`)
      .join('')
    return {
      coords,
      line,
      area: `${line}L${width},${HEIGHT}L0,${HEIGHT}Z`,
      startY: y(prices[0] ?? min),
    }
  }, [points, width])

  const activeCoord = geometry?.coords[hover ?? geometry.coords.length - 1]

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!geometry || switching || !event.isPrimary) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    onHover(Math.round(ratio * (points.length - 1)))
  }

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!geometry || switching) return
    const index = hover ?? points.length - 1
    const next =
      event.key === 'ArrowLeft'
        ? Math.max(0, index - 1)
        : event.key === 'ArrowRight'
          ? Math.min(points.length - 1, index + 1)
          : null
    if (next !== null) {
      event.preventDefault()
      onHover(next)
    } else if (event.key === 'Escape') onHover(null)
  }

  return (
    <div
      ref={frame}
      className="relative mt-4 w-full touch-pan-y select-none"
      style={{ height: HEIGHT }}
      // A drawn line you can scrub through: an <input type="range"> can't render it
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, points.length - 1)}
      aria-valuenow={hover ?? Math.max(0, points.length - 1)}
      aria-valuetext={formatUsd(points[hover ?? points.length - 1]?.price ?? 0)}
      tabIndex={geometry ? 0 : -1}
      onPointerDown={(event) => {
        if (!geometry || switching || !event.isPrimary) return
        event.currentTarget.setPointerCapture(event.pointerId)
        onPointer(event)
      }}
      onPointerMove={onPointer}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
        if (event.pointerType !== 'mouse') onHover(null)
      }}
      onPointerLeave={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) onHover(null)
      }}
      onPointerCancel={() => onHover(null)}
      onBlur={() => onHover(null)}
      onKeyDown={onKey}
    >
      {switching && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Spinner size={24} />
        </div>
      )}
      {pending ? (
        <PlotSkeleton />
      ) : !geometry ? (
        <div className="flex h-full items-center justify-center rounded-2xl bg-secondary px-6 text-center text-sm text-muted-foreground">
          Not enough price history yet. It fills in over the next hours.
        </div>
      ) : (
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          preserveAspectRatio="none"
          className={cn(
            'pointer-events-none block h-full w-full overflow-visible transition-opacity',
            switching && 'opacity-30',
          )}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <line
            x1={0}
            x2={width}
            y1={geometry.startY}
            y2={geometry.startY}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path
            d={geometry.line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hover !== null && activeCoord && (
            <line
              x1={activeCoord[0]}
              x2={activeCoord[0]}
              y1={0}
              y2={HEIGHT}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
            />
          )}
          {activeCoord && (
            <circle
              cx={activeCoord[0]}
              cy={activeCoord[1]}
              r={5}
              fill={color}
              stroke="var(--background)"
              strokeWidth={2}
            />
          )}
        </svg>
      )}
    </div>
  )
}
