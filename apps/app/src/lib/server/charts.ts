import { z } from 'zod'
import type { CatalogEntry } from '@/lib/server/catalog'
import { env } from '@/lib/server/env'
import { feedHistory } from '@/lib/server/prices'
import { db } from '@/lib/server/supabase'
import type { ChartRange, PriceChart, PricePoint } from '@/lib/types'

// Two price histories, never mixed in one line:
//   '1d' the listed stock's daily closes from the provider, for the long ranges, where its free
//        plan covers the ticker (most large listings; many small ones and some ETFs it refuses)
//   '1h' our own hourly record of the price we show, written by /api/cron/prices; it fills the
//        short ranges, and the long ones for tickers the provider won't serve

const EOD_API = 'https://financialmodelingprep.com/stable/historical-price-eod/light'

/** Closes change once a day, so half a day old is current */
const EOD_FRESH_MS = 12 * 60 * 60 * 1000
/** A refused ticker is asked again after a week, in case the plan or listing changed */
const EOD_RETRY_MS = 7 * 24 * 60 * 60 * 1000

const DAY = 24 * 60 * 60
const RANGE_SECONDS: Record<ChartRange, number> = {
  '1D': DAY,
  '1W': 7 * DAY,
  '1M': 30 * DAY,
  '1Y': 365 * DAY,
  '5Y': 5 * 365 * DAY,
}

const eodSchema = z.array(z.object({ date: z.string(), price: z.number().positive() }))

/** A date with no clock is a close; noon UTC keeps it on the right day everywhere */
const closeTime = (date: string) => new Date(`${date}T12:00:00Z`).toISOString()

const tokenKey = (stock: CatalogEntry) => stock.address.toLowerCase()

async function readPoints(stock: CatalogEntry, resolution: '1d' | '1h', since: Date) {
  const { data, error } = await db()
    .from('price_candles')
    .select('bucket, close')
    .eq('token', tokenKey(stock))
    .eq('resolution', resolution)
    .gte('bucket', since.toISOString())
    .order('bucket', { ascending: true })
    .limit(2000)
    .overrideTypes<{ bucket: string; close: string }[], { merge: false }>()
  if (error) throw error
  return data.map((row): PricePoint => ({
    t: Math.floor(new Date(row.bucket).getTime() / 1000),
    price: Number(row.close),
  }))
}

type Closes = { at: number; points: PricePoint[] | null }

const isFresh = (closes: Closes) =>
  Date.now() - closes.at < (closes.points ? EOD_FRESH_MS : EOD_RETRY_MS)

/** Per-instance cache, so charts work (and don't burn the daily quota) even without the database */
const closesCache = new Map<string, Closes>()

async function storedCloses(stock: CatalogEntry): Promise<Closes | null> {
  try {
    const { data: status, error } = await db()
      .from('stock_profiles')
      .select('eod_available, eod_fetched_at')
      .eq('ticker', stock.ticker)
      .maybeSingle()
      .overrideTypes<
        { eod_available: boolean | null; eod_fetched_at: string | null } | null,
        { merge: false }
      >()
    if (error || !status?.eod_fetched_at || status.eod_available === null) return null
    const at = new Date(status.eod_fetched_at).getTime()
    if (!status.eod_available) return { at, points: null }
    return { at, points: await readPoints(stock, '1d', new Date(0)) }
  } catch {
    return null
  }
}

/** Saves what the provider sent; best effort, since the in-memory copy already serves this request */
async function storeCloses(stock: CatalogEntry, points: PricePoint[] | null): Promise<void> {
  try {
    const fetchedAt = new Date().toISOString()
    await db()
      .from('stock_profiles')
      .upsert(
        { ticker: stock.ticker, eod_available: points !== null, eod_fetched_at: fetchedAt },
        { onConflict: 'ticker' },
      )
    if (!points) return
    const rows = points.map((point) => ({
      token: tokenKey(stock),
      resolution: '1d',
      bucket: new Date(point.t * 1000).toISOString(),
      open: point.price,
      high: point.price,
      low: point.price,
      close: point.price,
      fetched_at: fetchedAt,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db()
        .from('price_candles')
        .upsert(rows.slice(i, i + 500), { onConflict: 'token,resolution,bucket' })
      if (error) throw error
    }
  } catch (error) {
    console.error(
      'Daily closes not saved',
      stock.ticker,
      error instanceof Error ? error.message : '',
    )
  }
}

/**
 * The listed stock's daily closes, oldest first, or null where the provider's plan doesn't cover
 * the ticker. Memory first, then the database, then the provider (at most twice a day per
 * ticker; a refusal is asked again after a week).
 */
async function dailyCloses(stock: CatalogEntry): Promise<PricePoint[] | null> {
  const cached = closesCache.get(stock.ticker)
  if (cached && isFresh(cached)) return cached.points
  const stored = await storedCloses(stock)
  if (stored && isFresh(stored) && (stored.points === null || stored.points.length >= 2)) {
    closesCache.set(stock.ticker, stored)
    return stored.points
  }

  const apiKey = env().FMP_API_KEY
  if (!apiKey) return stored?.points ?? cached?.points ?? null
  try {
    const response = await fetch(
      `${EOD_API}?symbol=${encodeURIComponent(stock.ticker)}&apikey=${apiKey}`,
    )
    const parsed = response.ok ? eodSchema.safeParse(await response.json()) : null
    const points =
      parsed?.success && parsed.data.length >= 2
        ? parsed.data
            .map((row) => ({
              t: Math.floor(new Date(closeTime(row.date)).getTime() / 1000),
              price: row.price,
            }))
            .toSorted((a, b) => a.t - b.t)
        : null
    closesCache.set(stock.ticker, { at: Date.now(), points })
    await storeCloses(stock, points)
    return points
  } catch (error) {
    // The key rides in the URL, so log the ticker and the reason, never the request
    console.error(
      'Daily closes unavailable',
      stock.ticker,
      error instanceof Error ? error.message : '',
    )
    return stored?.points ?? cached?.points ?? null
  }
}

/** Keeps a long series to about one point per day, so a 5-year line stays light */
function thin(points: PricePoint[], max = 400): PricePoint[] {
  if (points.length <= max) return points
  const step = points.length / max
  const kept = Array.from({ length: max }, (_, index) => points[Math.floor(index * step)]).filter(
    (point): point is PricePoint => point !== undefined,
  )
  const last = points.at(-1)
  return last && kept.at(-1) !== last ? [...kept, last] : kept
}

export async function getChart(stock: CatalogEntry, range: ChartRange): Promise<PriceChart> {
  const sinceSeconds = Math.floor(Date.now() / 1000) - RANGE_SECONDS[range]
  let points: PricePoint[] = []
  let source: PriceChart['source'] = 'recorded'

  // A day is too short for daily closes: the feed's own rounds, where the stock has a feed
  if (range === '1D') {
    points = await feedHistory(stock, sinceSeconds).catch(() => [])
  } else {
    const closes = await dailyCloses(stock)
    const inRange = closes?.filter((point) => point.t >= sinceSeconds) ?? []
    if (inRange.length >= 2) {
      points = inRange
      source = 'market'
    }
  }
  if (points.length < 2)
    points = await readPoints(stock, '1h', new Date(sinceSeconds * 1000)).catch(() => [])

  // End on the price shown on the page, so the line and the big number agree
  const now = stock.pricePerShare
  if (source === 'recorded' && now !== null)
    points = [...points, { t: Math.floor(Date.now() / 1000), price: now }]

  points = thin(points)
  const first = points[0]?.price
  const last = points.at(-1)?.price
  return {
    points,
    source,
    changePct: first && last && points.length >= 2 ? ((last - first) / first) * 100 : null,
  }
}

/** One row per stock for this hour: our own price history, for charts the provider can't fill */
export async function recordHourlyPrices(entries: CatalogEntry[]): Promise<number> {
  const hour = new Date()
  hour.setUTCMinutes(0, 0, 0)
  const rows = entries
    .filter((entry) => entry.pricePerShare !== null)
    .map((entry) => ({
      token: tokenKey(entry),
      resolution: '1h',
      bucket: hour.toISOString(),
      open: entry.pricePerShare,
      high: entry.pricePerShare,
      low: entry.pricePerShare,
      close: entry.pricePerShare,
      fetched_at: new Date().toISOString(),
    }))
  const { error } = await db()
    .from('price_candles')
    .upsert(rows, { onConflict: 'token,resolution,bucket' })
  if (error) throw error
  return rows.length
}
