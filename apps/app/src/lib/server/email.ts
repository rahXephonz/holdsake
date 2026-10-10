import { type EmailContent, renderEmail, renderEmailText } from '@/lib/server/email-template'
import { env } from '@/lib/server/env'

/**
 * Email through Resend's HTTP API. Inert while RESEND_API_KEY is unset, and never throws: a lost
 * email mustn't fail the money flow that sent it. Copy follows the app's rules: no crypto words.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM, VITE_APP_URL } = env()
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
        to: [to],
        subject: content.subject,
        html: renderEmail(content, VITE_APP_URL),
        text: renderEmailText(content, VITE_APP_URL),
      }),
    })
    // The body can echo the recipient's address; log the status only
    if (!response.ok) console.error('email failed', response.status)
  } catch (error) {
    console.error('email failed', error instanceof Error ? error.message : 'unknown')
  }
}
