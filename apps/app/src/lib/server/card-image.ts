import { Resvg } from '@resvg/resvg-js'
import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import satori from 'satori'
import { cached } from '@/lib/server/cache'
import { artDataUri, cardOf } from '@/lib/gift-cards'

// The gift card as a picture: what a chat shows when someone pastes a gift link, and what
// "Save card" downloads. Only the occasion and the two names; never the amount or the message,
// since the picture travels wherever the link does.

const WIDTH = 1200
const HEIGHT = 630

/**
 * Google Sans, the app's text face, as TTF (satori can't read woff2). Google Fonts serves TTF to
 * clients it doesn't recognise, hence the bare user agent. Fetched once per server.
 */
const fonts = cached(24 * 3600_000, async () => {
  const css = await (
    await fetch('https://fonts.googleapis.com/css2?family=Google+Sans:wght@500;700', {
      headers: { 'User-Agent': 'Mozilla/4.0' },
    })
  ).text()
  const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)]
  const loaded = await Promise.all(
    urls.map(async ([, weight, url]) => ({
      name: 'Google Sans',
      weight: Number(weight),
      style: 'normal' as const,
      data: await (await fetch(url!)).arrayBuffer(),
    })),
  )
  const usable = loaded.filter(
    (font): font is (typeof loaded)[number] & { weight: 500 | 700 } =>
      font.weight === 500 || font.weight === 700,
  )
  if (usable.length === 0) throw new Error('card font unavailable')
  return usable
})

/** createElement with the style first, so this stays a plain .ts file */
const el = (
  type: string,
  style: CSSProperties,
  children?: ReactNode,
  extra?: Record<string, unknown>,
): ReactElement => createElement(type, { style, ...extra }, children)

export async function renderCard(input: {
  theme: unknown
  recipientName: string | null
  senderName: string
}): Promise<Uint8Array> {
  const card = cardOf(input.theme)
  const tree = el(
    'div',
    {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      background: card.paper,
      color: card.ink,
      fontFamily: 'Google Sans',
    },
    [
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 600,
          padding: '64px 0 56px 72px',
        },
        [
          el('div', { fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }, 'Holdsake'),
          el('div', { display: 'flex', flexDirection: 'column' }, [
            el('div', { fontSize: 28, fontWeight: 500, opacity: 0.7 }, card.label),
            el(
              'div',
              { fontSize: 76, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2, marginTop: 12 },
              input.recipientName ? `A gift for ${input.recipientName}` : 'A gift for you',
            ),
            el('div', { fontSize: 34, fontWeight: 500, marginTop: 22 }, `from ${input.senderName}`),
          ]),
          el('div', { fontSize: 24, fontWeight: 500, opacity: 0.6 }, 'Only they can open it'),
        ],
      ),
      el('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 600 }, [
        el('img', {}, undefined, { src: artDataUri(card.theme), width: 560, height: 420 }),
      ]),
    ],
  )
  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts: await fonts() })
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng()
}
