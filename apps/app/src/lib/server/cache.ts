/** In-memory TTL cache per instance, with in-flight dedupe so a burst makes one upstream call */
export function cached<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let value: { data: T; at: number } | undefined
  let pending: Promise<T> | undefined
  return () => {
    if (value && Date.now() - value.at < ttlMs) return Promise.resolve(value.data)
    pending ??= load()
      .then((data) => {
        value = { data, at: Date.now() }
        return data
      })
      .finally(() => {
        pending = undefined
      })
    return pending
  }
}
