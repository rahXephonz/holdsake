import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { Initial, StockLogo, Words } from '../kit'
import { countUp, fadeOut, rise, usd } from '../motion'
import { color, font } from '../theme'

export const FUND_FRAMES = 180

const MIX = [
  { ticker: 'AVGO', percent: 34, tint: color.ink },
  { ticker: 'MRVL', percent: 33, tint: '#5A5A5A' },
  { ticker: 'NVDA', percent: 33, tint: '#A8A8A8' },
]

const PEOPLE = [
  { name: 'Ry', tint: '#FFE8D6', at: 36 },
  { name: 'Ana', tint: '#E6ECF7', at: 56 },
  { name: 'Sari', tint: '#E9F3E4', at: 76 },
  { name: 'Dimas', tint: '#FBEDEA', at: 96 },
]

/** A goal fund filling up as family chips in */
export function Fund() {
  const frame = useCurrentFrame()
  const cardIn = rise(frame, 6, 20)
  const total = countUp(frame, 0, 1240, 36, 130)
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, FUND_FRAMES), alignItems: 'center' }}>
      <div
        style={{
          marginTop: 120,
          fontFamily: font.sans,
          fontWeight: 700,
          fontSize: 104,
          letterSpacing: '-0.04em',
          textAlign: 'center',
        }}
      >
        <Words text="Save up for someone, together." stagger={3} />
      </div>
      <div
        style={{
          marginTop: 70,
          width: 1080,
          borderRadius: 48,
          background: color.surface,
          padding: '48px 60px',
          fontFamily: font.sans,
          opacity: cardIn,
          transform: `translateY(${(1 - cardIn) * 80}px)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 26, color: color.muted }}>Goal fund for Maya</div>
            <div style={{ marginTop: 4, fontSize: 48, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Maya’s first home
            </div>
          </div>
          <div
            style={{
              fontFamily: font.number,
              fontWeight: 700,
              fontSize: 88,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
              display: 'grid',
            }}
          >
            <span style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{usd(1240)}</span>
            <span style={{ gridArea: '1 / 1', textAlign: 'right' }}>{usd(total)}</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            display: 'flex',
            height: 22,
            borderRadius: 11,
            overflow: 'hidden',
            background: color.line,
          }}
        >
          {MIX.map((entry, index) => {
            const grow = rise(frame, 24 + index * 8, 20)
            return (
              <div
                key={entry.ticker}
                style={{ width: `${entry.percent * grow}%`, background: entry.tint }}
              />
            )
          })}
        </div>
        <div style={{ marginTop: 18, display: 'flex', gap: 36 }}>
          {MIX.map((entry) => (
            <div key={entry.ticker} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <StockLogo ticker={entry.ticker} size={40} />
              <span style={{ fontSize: 24, fontWeight: 500 }}>{entry.ticker}</span>
              <span style={{ fontSize: 24, color: color.muted, fontFamily: font.number }}>
                {entry.percent}%
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {PEOPLE.map((person, index) => {
              const pop = rise(frame, person.at, 10)
              // "+$" chip floats up off each avatar and fades
              const chip = interpolate(frame, [person.at, person.at + 34], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })
              return (
                <div
                  key={person.name}
                  style={{ position: 'relative', marginLeft: index ? -14 : 0 }}
                >
                  <div
                    style={{
                      transform: `scale(${pop})`,
                      borderRadius: '50%',
                      border: `4px solid ${color.surface}`,
                    }}
                  >
                    <Initial name={person.name} size={68} tint={person.tint} />
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: -6 - chip * 30,
                      transform: 'translateX(-50%)',
                      opacity: chip > 0 ? Math.sin(chip * Math.PI) : 0,
                      background: color.paper,
                      borderRadius: 20,
                      padding: '6px 14px',
                      fontFamily: font.number,
                      fontWeight: 600,
                      fontSize: 22,
                      color: color.gain,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    +{usd(310)}
                  </div>
                </div>
              )
            })}
            <span style={{ marginLeft: 22, fontSize: 26, color: color.muted }}>
              4 people chipped in
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 26,
              fontWeight: 500,
              opacity: rise(frame, 110),
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24">
              <rect x="4" y="10" width="16" height="11" rx="3" fill={color.ink} />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke={color.ink} strokeWidth="2.4" />
            </svg>
            Unlocks Oct 31, 2036
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
