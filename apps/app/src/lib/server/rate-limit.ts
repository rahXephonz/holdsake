import { tooManyRequests } from '@/lib/server/http'

/** Per-user (or per-IP) windows. Creating gifts pregenerates accounts for any email typed in, so
 * it gets the tightest one; lookups fire per keystroke and get the loosest. Sponsored operations
 * cost us gas even when they revert, so they're capped too. */
export const RATE_LIMITS = {
  recipients: { limit: 30, windowMs: 60_000 },
  recipientsIp: { limit: 60, windowMs: 60_000 },
  giftQuote: { limit: 20, windowMs: 60_000 },
  createGifts: { limit: 5, windowMs: 60_000 },
  build: { limit: 20, windowMs: 60_000 },
  submit: { limit: 20, windowMs: 60_000 },
  submitIp: { limit: 40, windowMs: 60_000 },
  avatar: { limit: 10, windowMs: 60 * 60_000 },
} as const

type Window = { count: number; resetAt: number }

const windows = new Map<string, Window>()

/** Past this, sweep out expired windows rather than let a long-lived instance grow the map */
const MAX_WINDOWS = 10_000

/**
 * Fixed window per key and route. Vercel runs several instances, each with its own windows, so
 * the real ceiling is the limit times the warm instances: a soft cap, but it stops one account
 * hammering a warm instance without a database round-trip.
 */
export function enforceRateLimit(key: string, name: keyof typeof RATE_LIMITS): void {
  const now = Date.now()
  const id = `${name}:${key}`
  const current = windows.get(id)
  const window =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + RATE_LIMITS[name].windowMs }
  window.count++
  if (windows.size > MAX_WINDOWS) {
    for (const [entry, value] of windows) {
      if (value.resetAt <= now) windows.delete(entry)
    }
  }
  windows.set(id, window)
  if (window.count > RATE_LIMITS[name].limit)
    throw tooManyRequests('That’s a lot at once. Give it a moment and try again.')
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}
