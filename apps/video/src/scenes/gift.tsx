import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion'
// One source for the card art: the same drawings the app and its link previews use
import { artDataUri, CARDS } from '../../../app/src/lib/gift-cards'
import { between, Initial, Phone, StockLogo, Words } from '../kit'
import { countUp, fadeOut, rise, usd } from '../motion'
import { color, font } from '../theme'

export const GIFT_FRAMES = 300

const PRESS = 118
const SENT = 132

/** Sending a gift: the review fills in, it sends, and the card comes out of the phone */
export function Gift() {
  const frame = useCurrentFrame()
  const phoneIn = rise(frame, 0, 20)
  const points = [
    { at: 50, text: 'Apple, NVIDIA, Tesla. Up to three stocks and cash in one gift.' },
    { at: 150, text: 'Wrapped in a card, with a note.' },
    { at: 200, text: 'Only they can open it.' },
  ]
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, GIFT_FRAMES) }}>
      <div style={{ position: 'absolute', left: 160, top: 300, width: 760 }}>
        <div
          style={{
            fontFamily: font.sans,
            fontWeight: 700,
            fontSize: 120,
            lineHeight: 1,
            letterSpacing: '-0.04em',
          }}
        >
          <Words text="Gift real shares." delay={8} />
        </div>
        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 26 }}>
          {points.map((point) => {
            const progress = rise(frame, point.at)
            return (
              <div
                key={point.text}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 20,
                  opacity: progress,
                  transform: `translateX(${(1 - progress) * -30}px)`,
                  fontFamily: font.sans,
                  fontSize: 40,
                  lineHeight: 1.3,
                  color: color.muted,
                }}
              >
                <span
                  style={{
                    marginTop: 14,
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    background: color.ink,
                    flexShrink: 0,
                  }}
                />
                {point.text}
              </div>
            )
          })}
        </div>
      </div>

      <GiftCardFlying frame={frame} />

      <div
        style={{
          position: 'absolute',
          left: 1060,
          top: 110,
          transform: `translateY(${(1 - phoneIn) * 500}px) rotate(${(1 - phoneIn) * 6}deg)`,
          opacity: phoneIn,
        }}
      >
        <Phone>{frame < SENT ? <Review frame={frame} /> : <Sent frame={frame - SENT} />}</Phone>
      </div>
    </AbsoluteFill>
  )
}

function Review({ frame }: { frame: number }) {
  const amount = countUp(frame, 0, 25, 18, 50)
  const rows = [
    { ticker: 'AAPL', name: 'Apple', shares: '0.0548', value: 12.5, at: 46 },
    { ticker: 'NVDA', name: 'NVIDIA', shares: '0.0694', value: 12.5, at: 58 },
  ]
  const pressed = interpolate(frame, [PRESS, PRESS + 5, PRESS + 12], [1, 0.95, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div
      style={{
        padding: '78px 30px 30px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 500 }}>Review</div>
      <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 14 }}>
        <Initial name="Maya" size={46} tint="#FFE8D6" />
        <div>
          <div style={{ fontSize: 15, color: color.muted }}>To</div>
          <div style={{ fontSize: 21, fontWeight: 500 }}>Maya</div>
        </div>
      </div>
      {/* Sized to the final amount and right-aligned, so digits count up in place instead of
          the whole number re-centring every time it gains a digit */}
      <div
        style={{
          marginTop: 34,
          alignSelf: 'center',
          display: 'grid',
          fontFamily: font.number,
          fontWeight: 700,
          fontSize: 76,
          letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{usd(25)}</span>
        <span style={{ gridArea: '1 / 1', textAlign: 'right' }}>{usd(amount)}</span>
      </div>
      <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {rows.map((row) => {
          const progress = rise(frame, row.at)
          return (
            <div
              key={row.ticker}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                opacity: progress,
                transform: `translateY(${(1 - progress) * 24}px)`,
              }}
            >
              <StockLogo ticker={row.ticker} size={46} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 500 }}>{row.name}</div>
                <div style={{ fontSize: 15, color: color.muted, fontFamily: font.number }}>
                  {row.shares} shares
                </div>
              </div>
              <div style={{ fontFamily: font.number, fontWeight: 600, fontSize: 19 }}>
                {usd(row.value)}
              </div>
            </div>
          )
        })}
      </div>
      <div
        style={{
          marginTop: 30,
          paddingTop: 22,
          borderTop: `1px solid ${color.line}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          fontSize: 17,
          opacity: between(frame, 64, 76),
        }}
      >
        {[
          ['Card', 'Birthday'],
          ['Note', '“Your first shares. Happy 21st!”'],
          ['Fee', 'about $0.05'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
            <span style={{ color: color.muted }}>{label}</span>
            <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          opacity: between(frame, 70, 84),
          transform: `scale(${pressed})`,
          height: 64,
          borderRadius: 32,
          background: color.ink,
          color: color.paper,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 21,
          fontWeight: 500,
        }}
      >
        Send {usd(25)}
      </div>
    </div>
  )
}

function Sent({ frame }: { frame: number }) {
  const pop = rise(frame, 0, 11)
  const draw = interpolate(frame, [6, 22], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const text = rise(frame, 14)
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          background: color.gain,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${pop})`,
        }}
      >
        <svg width="64" height="64" viewBox="0 0 64 64">
          <path
            d="M16 33 L28 45 L49 21"
            fill="none"
            stroke="#fff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={draw}
          />
        </svg>
      </div>
      <div style={{ marginTop: 30, fontSize: 32, fontWeight: 700, opacity: text }}>Gift sent</div>
      <div
        style={{ marginTop: 10, fontSize: 19, color: color.muted, opacity: text, lineHeight: 1.4 }}
      >
        Maya has 30 days to open it.
      </div>
    </div>
  )
}

function GiftCardFlying({ frame }: { frame: number }) {
  const card = CARDS.birthday
  const out = rise(frame, SENT + 22, 16)
  const float = Math.sin(frame / 18) * 6
  return (
    <div
      style={{
        position: 'absolute',
        left: 1150 + out * 380,
        top: 330 + out * -40 + float,
        width: 400,
        transform: `rotate(${out * 9}deg) scale(${0.8 + out * 0.2})`,
        opacity: between(frame, SENT + 20, SENT + 28),
        borderRadius: 34,
        overflow: 'hidden',
        background: card.paper,
        color: card.ink,
        fontFamily: font.sans,
        boxShadow: '0 40px 80px rgba(0,0,0,0.14)',
      }}
    >
      <div style={{ height: 230, display: 'flex', justifyContent: 'center', paddingTop: 14 }}>
        <Img src={artDataUri('birthday')} style={{ height: '100%' }} />
      </div>
      <div style={{ padding: '10px 30px 30px' }}>
        <div style={{ fontSize: 18, fontWeight: 500, opacity: 0.7 }}>{card.label}</div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}>For Maya</div>
        <div style={{ marginTop: 14, fontSize: 21, lineHeight: 1.4 }}>
          “Your first shares. Happy 21st!”
        </div>
        <div style={{ marginTop: 12, fontSize: 19, fontWeight: 500 }}>— Ry</div>
      </div>
    </div>
  )
}
