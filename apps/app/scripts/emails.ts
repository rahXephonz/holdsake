// Renders every email the app sends to HTML files, plus an index showing them side by side at
// phone width. Nothing is sent. Run from the repo root:
//   node --experimental-strip-types apps/app/scripts/emails.ts [out-dir]
// The samples copy what lib/server/emails.ts writes; add one here whenever you add an email there.
// Plain relative imports: Node can't resolve the app's `@/` alias, and both files import nothing.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { CARDS } from '../src/lib/gift-cards.ts'
import { type EmailContent, renderEmail } from '../src/lib/server/email-template.ts'

const OUT = process.argv[2] ?? join(process.cwd(), '.email-preview')
const APP_URL = process.env.EMAIL_APP_URL ?? 'https://holdsake.vercel.app'
const CARD_PATH = '/api/gifts/sample/card.png'

const samples: { kind: string; content: EmailContent }[] = [
  {
    kind: 'gift_received',
    content: {
      subject: 'Ry sent you a gift',
      preview: '$4.94 of real shares and cash, wrapped in a new year card. Only you can open it.',
      card: { path: CARD_PATH, alt: 'New Year card from Ry' },
      eyebrow: 'Ry sent you a gift',
      hero: '$4.94',
      subhero: 'Only you can open it.',
      assets: [
        { ticker: 'AAPL', title: 'Apple', detail: '0.005588 shares', value: '$1.88' },
        {
          ticker: 'CRCL',
          title: 'Circle Internet Group',
          detail: '0.035948 shares',
          value: '$3.06',
        },
      ],
      rows: [
        { label: 'From', value: 'Ry' },
        { label: 'Open before', value: 'Nov 9, 2026' },
      ],
      note: { from: 'Ry', text: 'happy new year!' },
      cta: { label: 'Open your gift', path: '/gift/sample' },
      footnote: 'Until you open it, Ry can take it back.',
    },
  },
  {
    kind: 'gift_received (new email)',
    content: {
      subject: 'Maya sent you a gift',
      preview: '$25.00 of real shares and cash, wrapped in a birthday card. Only you can open it.',
      card: { path: CARD_PATH, alt: 'Birthday card from Maya' },
      eyebrow: 'Maya sent you a gift',
      hero: '$25.00',
      subhero: 'Only you can open it.',
      assets: [
        { ticker: 'NVDA', title: 'NVIDIA', detail: '0.106 shares', value: '$20.00' },
        { ticker: null, title: 'Cash', value: '$5.00' },
      ],
      rows: [
        { label: 'From', value: 'Maya' },
        { label: 'Open before', value: 'Nov 9, 2026' },
      ],
      note: { from: 'Maya', text: 'Happy birthday! Hold this one for a while.' },
      cta: { label: 'Open your gift', path: '/gift/sample' },
      footnote:
        'Sign in to Holdsake with aisyah@example.com to open it. Until you do, Maya can take it back.',
      reason: 'You’re getting this because Maya sent a gift to this address.',
    },
  },
  {
    kind: 'gift_opened',
    content: {
      subject: 'Rahx opened your gift',
      preview: 'The shares are theirs now.',
      card: { path: CARD_PATH, alt: 'New Year card for Rahx' },
      eyebrow: 'Rahx opened your gift',
      hero: '$4.91',
      subhero: 'It’s theirs now.',
      assets: [
        { ticker: 'AAPL', title: 'Apple', detail: '0.005487 shares', value: '$1.85' },
        {
          ticker: 'CRCL',
          title: 'Circle Internet Group',
          detail: '0.035948 shares',
          value: '$3.06',
        },
      ],
      cta: { label: 'See the gift', path: '/gift/sample' },
    },
  },
  {
    kind: 'gift_returned',
    content: {
      subject: 'Ry took back a gift',
      preview: 'It hadn’t been opened, so it went back to them.',
      eyebrow: 'A gift went back',
      hero: '$4.94',
      subhero: 'Ry took back a gift you hadn’t opened.',
      assets: [
        { ticker: 'AAPL', title: 'Apple', detail: '0.005588 shares', value: '$1.88' },
        {
          ticker: 'CRCL',
          title: 'Circle Internet Group',
          detail: '0.035948 shares',
          value: '$3.06',
        },
      ],
      cta: { label: 'Open Holdsake', path: '/' },
    },
  },
  {
    kind: 'fund_contribution',
    content: {
      subject: 'Rizky added $6.54 to GMI',
      preview: 'Locked until Oct 31, 2026.',
      eyebrow: 'Rizky added to GMI',
      hero: '$6.54',
      subhero: 'Your fund just grew.',
      assets: [
        { ticker: 'AVGO', title: 'Broadcom', detail: '0.005977 shares', value: '$2.22' },
        { ticker: 'MRVL', title: 'Marvell Technology', detail: '0.00729 shares', value: '$2.16' },
        { ticker: 'NVDA', title: 'NVIDIA', detail: '0.009289 shares', value: '$2.16' },
      ],
      rows: [
        { label: 'From', value: 'Rizky' },
        { label: 'Locked until', value: 'Oct 31, 2026' },
      ],
      note: { from: 'Rizky', text: 'For your first home. Proud of you.' },
      cta: { label: 'See the fund', path: '/fund/sample' },
    },
  },
  {
    kind: 'cash_received',
    content: {
      subject: 'Maya sent you $100.00',
      preview: 'It’s ready to buy stocks or send as a gift.',
      eyebrow: 'Maya sent you cash',
      hero: '$100.00',
      subhero: 'It’s in your account now.',
      rows: [{ label: 'Added', value: '+$100.00', tone: 'gain' }],
      cta: { label: 'Open Holdsake', path: '/' },
    },
  },
  {
    kind: 'stock_received',
    content: {
      subject: '0.5 shares of Tesla arrived',
      preview: 'They’re already in your account. Nothing to open.',
      eyebrow: 'Shares arrived',
      hero: '$218.40',
      subhero: 'They’re in your account now.',
      assets: [{ ticker: 'TSLA', title: 'Tesla', detail: '0.5 shares', value: '$218.40' }],
      cta: { label: 'See your shares', path: '/stocks/TSLA' },
    },
  },
]

// The real card comes from /api/gifts/$id/card.png; the preview draws a close stand-in from the
// same art so it shows without a live gift
function sampleCard(alt: string): string {
  const theme = alt.startsWith('Birthday') ? CARDS.birthday : CARDS.new_year
  const art = theme.art
    .replace(' width="400" height="300"', '')
    .replace('<svg ', '<svg x="100" y="8" width="400" height="300" ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 600 315"><rect width="600" height="315" fill="${theme.paper}"/>${art}</svg>`
  return `data:image/png;base64,${Buffer.from(new Resvg(svg).render().asPng()).toString('base64')}`
}

mkdirSync(OUT, { recursive: true })
const sections = samples.map(({ kind, content }) => {
  let html = renderEmail(content, APP_URL)
  if (content.card)
    html = html.replace(new URL(CARD_PATH, APP_URL).href, sampleCard(content.card.alt))
  const file = `${kind.replace(/[^a-z_]+/g, '-').replace(/-+$/, '')}.html`
  writeFileSync(join(OUT, file), html)
  return `<section><h2>${kind}</h2><p><b>${content.subject}</b><br>${content.preview}</p><iframe src="${file}" title="${kind}"></iframe></section>`
})
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Holdsake emails</title>
<style>
  body { margin:0; padding:32px 24px; background:#E9E9E9; font:14px/1.5 -apple-system, sans-serif; color:#111 }
  .grid { display:grid; gap:24px; grid-template-columns:repeat(auto-fill, 400px) }
  section { background:#fff; border-radius:20px; padding:16px }
  h2 { margin:0 0 4px; font-size:13px; color:#6B6B6B; font-weight:500 }
  p { margin:0 0 12px }
  iframe { width:100%; height:820px; border:0; border-radius:12px }
</style>
<h1>Holdsake emails</h1><p>Rendered at phone width. Nothing has been sent.</p>
<div class="grid">${sections.join('\n')}</div>`,
)
console.log(join(OUT, 'index.html'))
