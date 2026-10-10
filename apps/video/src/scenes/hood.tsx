import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { Words } from '../kit'
import { fadeOut, rise } from '../motion'
import { color, font, s } from '../theme'

export const HOOD_FRAMES = s(10)

// The demo is for judges, so this one scene names the parts the app itself never shows
const ROWS = [
  ['HoldsakeGifts', 'Escrow only the recipient can open. Unopened, the sender can take it back.'],
  ['HoldsakeFunds', 'One beneficiary, a fixed mix, an unlock date. Anyone can add.'],
  ['EIP-7702 + our paymaster', 'One invisible signature per action. Nobody holds ETH.'],
  ['Fee at cost', 'About $0.05 of gas, paid in cash inside the same action.'],
]

/** What runs underneath: our contracts on Robinhood Chain mainnet, and how gas is handled */
export function Hood() {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        padding: '0 170px',
        fontFamily: font.sans,
        opacity: fadeOut(frame, HOOD_FRAMES),
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 500, color: color.muted }}>
        <Words text="Under the hood" />
      </div>
      <div style={{ marginTop: 10, fontSize: 84, fontWeight: 700, letterSpacing: '-0.04em' }}>
        <Words text="Live on Robinhood Chain mainnet." delay={6} stagger={3} />
      </div>
      <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        {ROWS.map(([title, line], index) => {
          const progress = rise(frame, 30 + index * 10)
          return (
            <div
              key={title}
              style={{
                padding: '34px 38px',
                borderRadius: 32,
                background: color.surface,
                opacity: progress,
                transform: `translateY(${(1 - progress) * 30}px)`,
              }}
            >
              <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</div>
              <div style={{ marginTop: 10, fontSize: 30, lineHeight: 1.35, color: color.muted }}>
                {line}
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
