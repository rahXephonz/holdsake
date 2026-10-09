import { useState } from 'react'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Logos load straight from the provider's public image CDN. Our same-origin proxy
 * (/api/stocks/$ticker/logo) is for drawing on a canvas; an <img> doesn't need it, and in dev
 * Vite answers image requests to unknown paths with a 404 before they reach the route.
 */
export const logoPathFor = (ticker: string) =>
  `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`

/**
 * A stock's logo, or its ticker's first letter on a quiet disc when there's none. A failed load
 * is tried once more (a page of logos can lose one to a busy moment) before falling back.
 */
export function StockLogo({
  ticker,
  logoUrl,
  size = 40,
  className,
}: {
  ticker: string
  /** Defaults to our logo path for the ticker; pass null for things that have no logo (cash) */
  logoUrl?: string | null
  size?: number
  className?: string
}) {
  const [attempt, setAttempt] = useState(0)
  const style = { width: size, height: size }
  const source =
    logoUrl === undefined
      ? /^[A-Z][A-Z0-9.]*$/.test(ticker)
        ? logoPathFor(ticker)
        : null
      : logoUrl
  if (source && attempt < 2)
    return (
      <img
        key={attempt}
        src={attempt === 0 ? source : `${source}?retry=1`}
        alt=""
        loading="lazy"
        decoding="async"
        style={style}
        onError={() => setAttempt((value) => value + 1)}
        className={cn('shrink-0 rounded-full bg-muted object-cover', className)}
      />
    )
  return (
    <span
      style={{ ...style, fontSize: size * 0.4 }}
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground',
        className,
      )}
    >
      {ticker.slice(0, 1)}
    </span>
  )
}

export function Avatar({
  name,
  url,
  size = 40,
  className,
}: {
  name: string
  url?: string | null
  size?: number
  className?: string
}) {
  const style = { width: size, height: size }
  if (url)
    return (
      <img
        src={url}
        alt=""
        style={style}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    )
  const letters = initials(name)
  return (
    <span
      style={{ ...style, fontSize: size * 0.38 }}
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-secondary font-medium',
        className,
      )}
    >
      {letters || '?'}
    </span>
  )
}
