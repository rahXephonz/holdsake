const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export const formatUsd = (value: number) => usd.format(value)

/** Whole dollars for big hero numbers that would otherwise wrap */
export const formatUsdShort = (value: number) =>
  Math.abs(value) >= 100_000 ? usdCompact.format(value) : usd.format(value)

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

/** Up to 6 significant decimals, never scientific notation */
export function formatShares(value: number): string {
  if (value === 0) return '0'
  const digits = value >= 1 ? 4 : 6
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

/** Raw integer string to a decimal number for display only; maths stays in bigint */
export function rawToNumber(raw: string | bigint, decimals: number): number {
  const value = typeof raw === 'bigint' ? raw : BigInt(raw)
  const base = 10n ** BigInt(decimals)
  return Number(value / base) + Number(value % base) / Number(base)
}

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
