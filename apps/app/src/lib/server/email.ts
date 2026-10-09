import { env } from '@/lib/server/env'

/**
 * Email through Resend's HTTP API. Inert while RESEND_API_KEY is unset, and never throws: a lost
 * email mustn't fail the money flow that sent it. Copy follows the app's rules: no crypto words.
 */
export async function sendEmail(input: {
  to: string
  subject: string
  heading: string
  /** Plain paragraphs; escaped here */
  paragraphs: string[]
  /** An optional quote from a person (a gift message), shown set apart */
  quote?: string
  action?: { label: string; href: string }
}): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM } = env()
  if (!RESEND_API_KEY) return
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: renderHtml(input),
        text: renderText(input),
      }),
    })
    // The body can echo the recipient's address; log the status only
    if (!response.ok) console.error('email failed', response.status)
  } catch (error) {
    console.error('email failed', error instanceof Error ? error.message : 'unknown')
  }
}

/** Absolute link into the app, for emails */
export const appLink = (path: string) => new URL(path, env().VITE_APP_URL).toString()

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

// Light only, flat, one dark action: the app's look in the few styles mail clients keep
function renderHtml({
  heading,
  paragraphs,
  quote,
  action,
}: Parameters<typeof sendEmail>[0]): string {
  const font = `'Google Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
  const body = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#2b2b2b">${escape(text)}</p>`,
    )
    .join('')
  const quoteHtml = quote
    ? `<p style="margin:0 0 20px;padding:16px;border-radius:16px;background:#f4f4f4;font-size:16px;line-height:1.5;color:#2b2b2b">“${escape(quote)}”</p>`
    : ''
  const button = action
    ? `<a href="${escape(action.href)}" style="display:inline-block;margin-top:8px;padding:14px 28px;border-radius:999px;background:#111111;color:#ffffff;font-size:16px;font-weight:500;text-decoration:none">${escape(action.label)}</a>`
    : ''
  return `<!doctype html><html><head><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:40px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;font-family:${font}">
<tr><td style="padding-bottom:32px;font-size:20px;font-weight:700;color:#111111">Holdsake</td></tr>
<tr><td><h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:700;color:#111111">${escape(heading)}</h1>${quoteHtml}${body}${button}</td></tr>
<tr><td style="padding-top:40px;font-size:13px;line-height:1.5;color:#8a8a8a">You’re getting this because someone used your email on Holdsake.</td></tr>
</table></td></tr></table></body></html>`
}

function renderText({ heading, paragraphs, quote, action }: Parameters<typeof sendEmail>[0]) {
  return [
    heading,
    quote ? `“${quote}”` : null,
    ...paragraphs,
    action ? `${action.label}: ${action.href}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}
