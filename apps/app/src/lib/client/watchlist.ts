import { useCallback, useSyncExternalStore } from 'react'

// Watchlists stay on the device: nothing to sync, no account needed to keep one,
// and the server never learns what someone is eyeing. Clearing site data clears the list.

const STORAGE_KEY = 'holdsake:watchlist'
const EMPTY: string[] = []
const listeners = new Set<() => void>()
// Same array until the list changes, so useSyncExternalStore doesn't loop
let snapshot: string[] | null = null

function read(): string[] {
  if (snapshot) return snapshot
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    snapshot = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    // Private windows and blocked storage: an empty list that lasts the session
    snapshot = []
  }
  return snapshot
}

function write(tickers: string[]) {
  snapshot = tickers
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers))
  } catch {
    // Kept in memory for this session anyway
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab changed it
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    snapshot = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Tickers the person hearted, most recent first; empty while rendering on the server */
export function useWatchlist() {
  const tickers = useSyncExternalStore(subscribe, read, () => EMPTY)
  const toggle = useCallback((ticker: string) => {
    const current = read()
    write(
      current.includes(ticker) ? current.filter((item) => item !== ticker) : [ticker, ...current],
    )
  }, [])
  return { tickers, toggle }
}
