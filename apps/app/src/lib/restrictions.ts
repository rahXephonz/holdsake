/**
 * Where Stock Tokens can't be offered: US persons, Canada, the UK, Switzerland, the UAE and
 * sanctioned jurisdictions (AGENT.md "Stock Tokens"). With no KYC this app-level check is the
 * only control on our side, so every money route enforces it, not only onboarding.
 */
export const BLOCKED_COUNTRY_CODES: ReadonlySet<string> = new Set([
  'US',
  'CA',
  'GB',
  'CH',
  'AE',
  'CU',
  'IR',
  'KP',
  'SY',
  'RU',
  'BY',
])
