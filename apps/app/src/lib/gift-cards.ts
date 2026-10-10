// Greeting cards a gift is wrapped in. Art direction: flat paper-cut print, three inks per card,
// no gradients, no emoji or stock icons; each occasion drawn from its own motif (a woven ketupat,
// paper lanterns, a red envelope's seal, fireworks over two clinking glasses). Plain SVG strings, so the same art renders in the app
// and in the server-made preview image that chats unfurl.

export const CARD_THEMES = [
  'birthday',
  'new_year',
  'angpao',
  'lunar_new_year',
  'lebaran',
  'christmas',
  'graduation',
  'wedding',
] as const

export type CardTheme = (typeof CARD_THEMES)[number]

export const isCardTheme = (value: unknown): value is CardTheme =>
  typeof value === 'string' && (CARD_THEMES as readonly string[]).includes(value)

type Card = {
  label: string
  /** Card face behind the art */
  paper: string
  /** Text on the card */
  ink: string
  /** The art, 400×300 */
  art: string
}

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">${body}</svg>`

/** A paper-cut firework: rays of alternating length around a small core */
const burst = (cx: number, cy: number, r: number, fill: string) =>
  Array.from({ length: 12 }, (_, i) => {
    const length = i % 2 ? r * 0.62 : r
    return `<rect x="${cx - 3}" y="${cy - length}" width="6" height="${length * 0.55}" rx="3" fill="${fill}" transform="rotate(${i * 30} ${cx} ${cy})"/>`
  }).join('') + `<circle cx="${cx}" cy="${cy}" r="${r * 0.12}" fill="${fill}"/>`

/** A scatter of small shapes, placed by hand so it reads as printed, not generated */
const dots = (points: [number, number, number][], fill: string) =>
  points.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('')

export const CARDS: Record<CardTheme, Card> = {
  birthday: {
    label: 'Birthday',
    paper: '#FFE8D6',
    ink: '#3B1F14',
    art: svg(`
      ${dots(
        [
          [48, 56, 6],
          [352, 70, 5],
          [320, 34, 4],
          [78, 120, 4],
          [340, 150, 6],
          [60, 210, 5],
        ],
        '#F26B3A',
      )}
      <rect x="104" y="40" width="10" height="22" rx="3" fill="#2E86AB" transform="rotate(-24 109 51)"/>
      <rect x="292" y="104" width="10" height="22" rx="3" fill="#2E86AB" transform="rotate(30 297 115)"/>
      <rect x="96" y="176" width="208" height="88" rx="10" fill="#F26B3A"/>
      <path d="M96 196 q26 22 52 0 q26 22 52 0 q26 22 52 0 q26 22 52 0 v-10 H96z" fill="#FFE8D6"/>
      <rect x="120" y="128" width="160" height="56" rx="8" fill="#2E86AB"/>
      <path d="M120 142 q20 16 40 0 q20 16 40 0 q20 16 40 0 q20 16 40 0 v-6 H120z" fill="#FFE8D6"/>
      <rect x="150" y="86" width="10" height="44" rx="3" fill="#3B1F14"/>
      <rect x="195" y="78" width="10" height="52" rx="3" fill="#3B1F14"/>
      <rect x="240" y="86" width="10" height="44" rx="3" fill="#3B1F14"/>
      <path d="M155 60 q10 14 0 24 q-10 -10 0 -24z" fill="#F26B3A"/>
      <path d="M200 52 q10 14 0 24 q-10 -10 0 -24z" fill="#F26B3A"/>
      <path d="M245 60 q10 14 0 24 q-10 -10 0 -24z" fill="#F26B3A"/>
    `),
  },
  new_year: {
    label: 'New Year',
    paper: '#ECEEF8',
    ink: '#1B1F4A',
    art: svg(`
      ${burst(92, 78, 52, '#D9487A')}
      ${burst(318, 64, 40, '#E8B33A')}
      ${burst(340, 176, 24, '#D9487A')}
      ${dots(
        [
          [40, 170, 4],
          [168, 30, 3],
          [236, 116, 4],
          [58, 252, 5],
          [372, 252, 4],
        ],
        '#E8B33A',
      )}
      ${[
        [154, 112, 14],
        [246, 112, -14],
      ]
        .map(
          ([x, y, angle]) => `
        <g transform="translate(${x} ${y}) rotate(${angle} 0 150)">
          <path d="M-20 0 h40 l-12 84 h-16z" fill="#ECEEF8" stroke="#1B1F4A" stroke-width="5" stroke-linejoin="round"/>
          <path d="M-16 24 h32 l-8 58 h-16z" fill="#E8B33A"/>
          <circle cx="-3" cy="44" r="3" fill="#ECEEF8"/>
          <circle cx="4" cy="60" r="2.5" fill="#ECEEF8"/>
          <rect x="-3" y="84" width="6" height="52" fill="#1B1F4A"/>
          <rect x="-24" y="134" width="48" height="8" rx="4" fill="#1B1F4A"/>
        </g>`,
        )
        .join('')}
    `),
  },
  angpao: {
    label: 'Angpao',
    paper: '#FFF1E0',
    ink: '#5A0F0F',
    art: svg(`
      ${dots(
        [
          [60, 60, 5],
          [340, 50, 4],
          [352, 230, 5],
          [46, 236, 4],
        ],
        '#E3A72F',
      )}
      <rect x="128" y="34" width="144" height="236" rx="12" fill="#C8202B"/>
      <path d="M128 46 a12 12 0 0 1 12 -12 h120 a12 12 0 0 1 12 12 v34 l-72 46 l-72 -46z" fill="#A3141E"/>
      <circle cx="200" cy="128" r="30" fill="#E3A72F"/>
      <circle cx="200" cy="128" r="18" fill="#C8202B"/>
      <rect x="192" y="120" width="16" height="16" fill="#E3A72F" transform="rotate(45 200 128)"/>
      <rect x="152" y="186" width="96" height="6" rx="3" fill="#E3A72F"/>
      <rect x="164" y="204" width="72" height="6" rx="3" fill="#E3A72F"/>
      <rect x="176" y="222" width="48" height="6" rx="3" fill="#E3A72F"/>
      <circle cx="296" cy="214" r="22" fill="#E3A72F"/>
      <rect x="288" y="206" width="16" height="16" rx="2" fill="#FFF1E0"/>
      <circle cx="322" cy="172" r="14" fill="#E3A72F"/>
      <rect x="317" y="167" width="10" height="10" rx="1" fill="#FFF1E0"/>
    `),
  },
  lunar_new_year: {
    label: 'Lunar New Year',
    paper: '#FDEBD3',
    ink: '#5A0F0F',
    art: svg(`
      <path d="M0 28 C120 48 280 48 400 28" stroke="#5A0F0F" stroke-width="4" fill="none"/>
      ${[
        [96, 44, 1],
        [200, 52, 1.2],
        [304, 44, 1],
      ]
        .map(
          ([x, y, s]) => `
        <g transform="translate(${x} ${y}) scale(${s})">
          <rect x="-4" y="0" width="8" height="18" fill="#5A0F0F"/>
          <rect x="-24" y="16" width="48" height="10" rx="3" fill="#E3A72F"/>
          <ellipse cx="0" cy="66" rx="44" ry="42" fill="#D7262E"/>
          <path d="M-22 30 q-14 36 0 72 M22 30 q14 36 0 72 M0 24 v84" stroke="#A3141E" stroke-width="4" fill="none"/>
          <rect x="-24" y="104" width="48" height="10" rx="3" fill="#E3A72F"/>
          <rect x="-3" y="114" width="6" height="34" fill="#E3A72F"/>
          <path d="M-10 148 h20 l-4 22 h-12z" fill="#D7262E"/>
        </g>`,
        )
        .join('')}
      ${dots(
        [
          [36, 236, 7],
          [52, 252, 5],
          [28, 258, 4],
          [362, 226, 6],
          [376, 246, 4],
          [352, 254, 5],
        ],
        '#E9839A',
      )}
    `),
  },
  lebaran: {
    label: 'Lebaran',
    paper: '#E9F3E4',
    ink: '#123B26',
    art: svg(`
      <path d="M330 36 a54 54 0 1 0 40 92 a44 44 0 1 1 -40 -92z" fill="#D6A43A"/>
      <path d="M268 40 l5 12 l13 1 l-10 8 l3 13 l-11 -7 l-11 7 l3 -13 l-10 -8 l13 -1z" fill="#D6A43A"/>
      ${[
        [120, 172, 0.95],
        [238, 204, 0.72],
      ]
        .map(
          ([x, y, s], i) => `
        <g transform="translate(${x} ${y}) scale(${s})">
          <defs><clipPath id="ketupat${i}"><rect x="-64" y="-64" width="128" height="128" rx="6" transform="rotate(45)"/></clipPath></defs>
          <rect x="-3" y="-118" width="6" height="40" fill="#123B26"/>
          <rect x="-64" y="-64" width="128" height="128" rx="6" fill="#2F7D4A" transform="rotate(45)"/>
          <path d="M-45 -45 L45 45 M-15 -75 L75 15 M-75 -15 L15 75 M45 -45 L-45 45 M15 -75 L-75 15 M75 -15 L-15 75"
            stroke="#B9D98C" stroke-width="10" clip-path="url(#ketupat${i})"/>
          <rect x="-64" y="-64" width="128" height="128" rx="6" fill="none" stroke="#123B26" stroke-width="6" transform="rotate(45)"/>
        </g>`,
        )
        .join('')}
      ${dots(
        [
          [40, 52, 4],
          [70, 34, 3],
          [360, 250, 4],
          [330, 268, 3],
        ],
        '#D6A43A',
      )}
    `),
  },
  christmas: {
    label: 'Christmas',
    paper: '#F4EEE3',
    ink: '#14361F',
    art: svg(`
      ${dots(
        [
          [44, 44, 4],
          [90, 92, 3],
          [70, 160, 5],
          [330, 60, 4],
          [362, 120, 3],
          [340, 196, 5],
          [52, 240, 3],
          [372, 252, 4],
        ],
        '#C9D6CC',
      )}
      <path d="M200 30 l12 26 l28 3 l-21 19 l6 28 l-25 -15 l-25 15 l6 -28 l-21 -19 l28 -3z" fill="#D9A53F"/>
      <path d="M200 96 l56 64 h-112z" fill="#1F5C37"/>
      <path d="M200 132 l78 82 h-156z" fill="#1F5C37"/>
      <path d="M200 172 l100 92 h-200z" fill="#1F5C37"/>
      <rect x="186" y="262" width="28" height="22" fill="#6B3E26"/>
      ${dots(
        [
          [178, 150, 7],
          [226, 194, 7],
          [168, 232, 7],
          [242, 248, 7],
          [204, 214, 6],
        ],
        '#C8202B',
      )}
    `),
  },
  graduation: {
    label: 'Graduation',
    paper: '#E6ECF7',
    ink: '#14213D',
    art: svg(`
      ${dots(
        [
          [52, 60, 5],
          [348, 48, 4],
          [72, 236, 4],
          [336, 244, 5],
        ],
        '#F0B429',
      )}
      <path d="M120 150 v52 q80 40 160 0 v-52z" fill="#14213D"/>
      <path d="M200 78 L360 140 L200 202 L40 140z" fill="#1F3A68"/>
      <path d="M200 78 L360 140 L200 202 L40 140z" fill="none" stroke="#14213D" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="200" cy="140" r="9" fill="#F0B429"/>
      <path d="M200 140 Q290 150 300 200" stroke="#F0B429" stroke-width="6" fill="none"/>
      <path d="M290 198 h20 l-4 46 h-12z" fill="#F0B429"/>
      <path d="M288 246 h24 l-2 12 h-20z" fill="#F0B429"/>
    `),
  },
  wedding: {
    label: 'Wedding',
    paper: '#FBEDEA',
    ink: '#4A1E2A',
    art: svg(`
      ${dots(
        [
          [60, 70, 6],
          [88, 48, 4],
          [330, 236, 6],
          [356, 214, 4],
          [48, 230, 4],
          [352, 64, 5],
        ],
        '#E7A1A9',
      )}
      <circle cx="166" cy="166" r="64" fill="none" stroke="#C9A04A" stroke-width="16"/>
      <circle cx="234" cy="166" r="64" fill="none" stroke="#B5788B" stroke-width="16"/>
      <path d="M166 102 a64 64 0 0 1 49 22" fill="none" stroke="#C9A04A" stroke-width="16"/>
      <path d="M216 80 l18 -22 h-36z" fill="#F7F1E8"/>
      <path d="M198 58 l18 -14 l18 14 z" fill="#F7F1E8"/>
      <path d="M198 58 h36 l-18 22z M198 58 l18 -14 l18 14" fill="none" stroke="#B5788B" stroke-width="3" stroke-linejoin="round"/>
    `),
  },
}

export const cardOf = (theme: unknown): Card & { theme: CardTheme } => {
  const key = isCardTheme(theme) ? theme : 'birthday'
  return { ...CARDS[key], theme: key }
}

export const artDataUri = (theme: CardTheme) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(CARDS[theme].art)}`
