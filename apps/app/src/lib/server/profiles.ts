import { z } from 'zod'
import { env } from '@/lib/server/env'
import { db } from '@/lib/server/supabase'
import type { CompanyProfile } from '@/lib/types'

const API = 'https://financialmodelingprep.com/stable/profile'

/** A description barely changes, and the free tier is counted in calls a day */
const FRESH_MS = 30 * 24 * 60 * 60 * 1000

/** Providers write for analysts; past this it's a wall of text on a phone */
const MAX_LENGTH = 320

const fmpProfileSchema = z.array(
  z.object({
    description: z.string().nullish(),
    sector: z.string().nullish(),
    industry: z.string().nullish(),
    website: z.string().nullish(),
  }),
)

type Row = {
  ticker: string
  description: string | null
  sector: string | null
  industry: string | null
  website: string | null
  fetched_at: string
}

/** Two sentences at most, so the page stays a page and not a filing */
function shorten(description: string): string | null {
  const clean = description.replace(/\s+/g, ' ').trim()
  if (!clean) return null
  if (clean.length <= MAX_LENGTH) return clean
  const cut = clean.slice(0, MAX_LENGTH)
  const lastStop = cut.lastIndexOf('. ')
  return lastStop > 80 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`
}

const toProfile = (row: Row): CompanyProfile | null =>
  row.description
    ? {
        description: row.description,
        sector: row.sector,
        industry: row.industry,
        website: row.website?.startsWith('https://') ? row.website : null,
      }
    : null

/**
 * What a company does, in a line or two. Cached in `stock_profiles`; inert without a key, and
 * never an error on the page: a stale description is still true, and none is fine.
 */
export async function getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const key = ticker.toUpperCase()
  const { data: row } = await db()
    .from('stock_profiles')
    .select('ticker, description, sector, industry, website, fetched_at')
    .eq('ticker', key)
    .maybeSingle()
    .overrideTypes<Row | null, { merge: false }>()

  if (row && Date.now() - new Date(row.fetched_at).getTime() < FRESH_MS) return toProfile(row)
  const apiKey = env().FMP_API_KEY
  if (!apiKey) return row ? toProfile(row) : null

  try {
    const response = await fetch(`${API}?symbol=${encodeURIComponent(key)}&apikey=${apiKey}`)
    if (!response.ok) throw new Error(`Profile provider responded ${response.status}`)
    const parsed = fmpProfileSchema.safeParse(await response.json())
    const profile = parsed.success ? parsed.data[0] : undefined
    // Written even when empty, so a ticker the provider doesn't cover stops costing a call per view
    const fresh: Row = {
      ticker: key,
      description: profile?.description ? shorten(profile.description) : null,
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,
      website: profile?.website ?? null,
      fetched_at: new Date().toISOString(),
    }
    await db().from('stock_profiles').upsert(fresh, { onConflict: 'ticker' })
    return toProfile(fresh)
  } catch (error) {
    // The key rides in the URL, so log the ticker and the reason, never the request
    console.error('Company profile unavailable', key, error instanceof Error ? error.message : '')
    return row ? toProfile(row) : null
  }
}
