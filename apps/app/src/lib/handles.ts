/** Lowercase letters, digits and underscores, 3 to 20 long; the DB enforces the same */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/

export const normalizeHandle = (value: string) => value.trim().replace(/^@/, '').toLowerCase()
