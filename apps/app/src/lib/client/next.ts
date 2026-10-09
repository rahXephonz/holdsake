/** Only same-site paths survive a login round trip; anything else lands on home */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export const validateNextSearch = (search: Record<string, unknown>): { next?: string } =>
  typeof search.next === 'string' ? { next: search.next } : {}
