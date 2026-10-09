import { BLOCKED_COUNTRY_CODES } from '@/lib/restrictions'

// ISO 3166-1 alpha-2. Names come from Intl so they read in the person's language.
const CODES =
  'AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GI GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW'.split(
    ' ',
  )

export function countryOptions(locale?: string) {
  const names = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'region' })
  return CODES.map((code) => ({
    code,
    name: names.of(code) ?? code,
    blocked: BLOCKED_COUNTRY_CODES.has(code),
  })).toSorted((a, b) => a.name.localeCompare(b.name))
}
