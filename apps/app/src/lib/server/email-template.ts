/**
 * Draws every email we send as one HTML string, in the app's own look: a flat white sheet on a
 * pale grey page, the amount as the hero, what moved as plain rows with their logos, a short
 * receipt of labelled facts, and one black button. A gift's email leads with its greeting card.
 *
 * Mail clients only reliably keep inline styles on tables, so it's built by hand: no `<style>`
 * block (Gmail drops most of one) and nothing the words depend on is an image. The logo sits
 * beside "Holdsake" in text, every stock logo beside its name, and the card has alt text, so a
 * client that blocks images still reads right.
 *
 * Imports nothing from the app, so `scripts/emails.ts` can render the samples with plain Node.
 */

const COLORS = {
  page: '#F4F4F4',
  sheet: '#FFFFFF',
  ink: '#111111',
  muted: '#6B6B6B',
  faint: '#9A9A9A',
  surface: '#F4F4F4',
  gain: '#1F9D55',
  loss: '#C23B3B',
}

// Google Sans and Inter rarely load in a mail client; the system sans carries the same weight
const SANS =
  "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const NUMBER =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const TAGLINE = 'Give real ownership.'

/** One labelled fact on the receipt. `tone` colours the value; leave it off for plain facts */
export type EmailRow = { label: string; value: string; tone?: 'gain' | 'loss' }

/** A stock (or cash, with no ticker) shown with its logo, the way the app lists a holding */
export type EmailAsset = { ticker: string | null; title: string; detail?: string; value?: string }

export type EmailContent = {
  subject: string
  /** The grey line an inbox shows after the subject; without it clients scrape the markup */
  preview: string
  /** A greeting card leading the email, as an app path to its PNG, with words for blocked images */
  card?: { path: string; alt: string }
  /** Small line above the hero, e.g. "Maya sent you a gift" */
  eyebrow: string
  /** The biggest words in the email: usually an amount */
  hero: string
  /** One line under the hero */
  subhero?: string
  /** What moved, each with its logo */
  assets?: EmailAsset[]
  /** Labelled facts, top to bottom */
  rows?: EmailRow[]
  /** What someone wrote, in their words */
  note?: { from: string; text: string } | null
  /** The one thing to do, as an app path */
  cta: { label: string; path: string }
  /** One sentence under the button */
  footnote?: string
  /** Why this address got it; the default fits anyone with an account */
  reason?: string
}

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

// Same CDN the app's stock logos load from; a client that blocks it still has the name beside it
const logoUrl = (ticker: string) =>
  `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`

// Cash has no logo to load, so its mark is drawn in the cell itself
function assetMark(asset: EmailAsset): string {
  if (!asset.ticker)
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="40" height="40" bgcolor="${COLORS.surface}" style="width:40px;height:40px;border-radius:20px;background:${COLORS.surface};font-family:${NUMBER};font-size:18px;line-height:18px;font-weight:600;color:${COLORS.ink};">$</td></tr></table>`
  return `<img src="${escape(logoUrl(asset.ticker))}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0;border-radius:20px;background:${COLORS.surface};">`
}

function assetRow(asset: EmailAsset): string {
  const detail = asset.detail
    ? `<div style="padding-top:2px;font-family:${SANS};font-size:14px;line-height:19px;color:${COLORS.muted};">${escape(asset.detail)}</div>`
    : ''
  const value = asset.value
    ? `<td align="right" valign="middle" style="padding:10px 0;font-family:${NUMBER};font-size:16px;line-height:22px;font-weight:600;color:${COLORS.ink};white-space:nowrap;">${escape(asset.value)}</td>`
    : '<td></td>'
  return `<tr>
<td width="52" valign="middle" style="padding:10px 12px 10px 0;width:40px;line-height:0;">${assetMark(asset)}</td>
<td valign="middle" style="padding:10px 0;"><div style="font-family:${SANS};font-size:16px;line-height:22px;font-weight:500;color:${COLORS.ink};">${escape(asset.title)}</div>${detail}</td>
${value}
</tr>`
}

function receiptRow(row: EmailRow): string {
  const color = row.tone === 'gain' ? COLORS.gain : row.tone === 'loss' ? COLORS.loss : COLORS.ink
  return `<tr>
<td style="padding:7px 0;font-family:${SANS};font-size:15px;line-height:21px;color:${COLORS.muted};">${escape(row.label)}</td>
<td align="right" style="padding:7px 0;font-family:${SANS};font-size:15px;line-height:21px;font-weight:500;color:${color};">${escape(row.value)}</td>
</tr>`
}

const table = (inner: string, style = '') =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${style}">${inner}</table>`

/** A block of the sheet, padded on its sides; white space between blocks, never a rule */
const block = (inner: string, top = 24) =>
  `<tr><td style="padding:${top}px 28px 0 28px;">${inner}</td></tr>`

export function renderEmail(content: EmailContent, appUrl: string): string {
  const link = (path: string) => escape(new URL(path, appUrl).href)

  const card = content.card
    ? `<tr><td style="padding:8px 8px 0 8px;line-height:0;"><img src="${link(content.card.path)}" width="504" alt="${escape(content.card.alt)}" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:18px;background:${COLORS.surface};font-family:${SANS};font-size:15px;line-height:21px;color:${COLORS.muted};"></td></tr>`
    : ''

  const subhero = content.subhero
    ? `<tr><td align="center" style="padding-top:8px;font-family:${SANS};font-size:16px;line-height:22px;color:${COLORS.muted};">${escape(content.subhero)}</td></tr>`
    : ''
  const hero = block(
    table(`<tr><td align="center" style="font-family:${SANS};font-size:15px;line-height:20px;font-weight:500;color:${COLORS.muted};">${escape(content.eyebrow)}</td></tr>
<tr><td align="center" style="padding-top:8px;font-family:${NUMBER};font-size:40px;line-height:46px;font-weight:700;letter-spacing:-1px;color:${COLORS.ink};">${escape(content.hero)}</td></tr>
${subhero}`),
    content.card ? 28 : 36,
  )

  const assets = content.assets?.length
    ? block(table(content.assets.map(assetRow).join('\n')), 20)
    : ''
  const rows = content.rows?.length
    ? block(table(content.rows.map(receiptRow).join('\n')), content.assets?.length ? 12 : 20)
    : ''
  const note = content.note
    ? block(
        table(
          `<tr><td bgcolor="${COLORS.surface}" style="padding:18px 20px;border-radius:18px;background:${COLORS.surface};">
<div style="font-family:${SANS};font-size:16px;line-height:24px;color:${COLORS.ink};">&ldquo;${escape(content.note.text)}&rdquo;</div>
<div style="padding-top:6px;font-family:${SANS};font-size:14px;line-height:19px;color:${COLORS.muted};">&mdash; ${escape(content.note.from)}</div>
</td></tr>`,
        ),
        20,
      )
    : ''

  const button = `<tr><td style="padding:28px 28px 28px 28px;">
<a href="${link(content.cta.path)}" style="display:block;padding:16px 24px;background:${COLORS.ink};border-radius:999px;font-family:${SANS};font-size:16px;line-height:22px;font-weight:500;color:#FFFFFF;text-decoration:none;text-align:center;">${escape(content.cta.label)}</a>
</td></tr>`

  const footnote = content.footnote
    ? `<tr><td align="center" style="padding:20px 28px 0 28px;font-family:${SANS};font-size:14px;line-height:20px;color:${COLORS.muted};">${escape(content.footnote)}</td></tr>`
    : ''

  return `<!doctype html>
<html lang="en" style="color-scheme:light only;supported-color-schemes:light only;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escape(content.subject)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background:${COLORS.page};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escape(content.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background:${COLORS.page};">
<tr><td align="center" style="padding:28px 16px 40px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;">

<tr><td align="center" style="padding:0 0 20px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:10px;line-height:0;"><img src="${link('/icons/icon-192.png')}" width="28" height="28" alt="" style="display:block;width:28px;height:28px;border:0;border-radius:7px;"></td>
<td style="font-family:${SANS};font-size:19px;line-height:28px;font-weight:700;letter-spacing:-0.3px;color:${COLORS.ink};">Holdsake</td>
</tr></table>
</td></tr>

<tr><td bgcolor="${COLORS.sheet}" style="background:${COLORS.sheet};border-radius:26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${card}
${hero}
${assets}
${rows}
${note}
${button}
</table>
</td></tr>

${footnote}

<tr><td align="center" style="padding:28px 24px 0 24px;font-family:${SANS};font-size:13px;line-height:19px;color:${COLORS.faint};">
${TAGLINE}<br>
${escape(content.reason ?? 'You’re getting this because of something on your Holdsake account.')}
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

/** The same email as plain text, for clients that ask for it and for spam scoring */
export function renderEmailText(content: EmailContent, appUrl: string): string {
  const lines = [content.eyebrow, '', content.hero]
  if (content.subhero) lines.push(content.subhero)
  if (content.assets?.length) {
    lines.push('')
    for (const asset of content.assets)
      lines.push([asset.title, asset.detail, asset.value].filter(Boolean).join(' · '))
  }
  if (content.rows?.length) {
    lines.push('')
    for (const row of content.rows) lines.push(`${row.label}: ${row.value}`)
  }
  if (content.note) lines.push('', `“${content.note.text}” — ${content.note.from}`)
  lines.push('', `${content.cta.label}: ${new URL(content.cta.path, appUrl).href}`)
  if (content.footnote) lines.push('', content.footnote)
  lines.push('', TAGLINE)
  return lines.join('\n')
}
