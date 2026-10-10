import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { Words } from '../kit'
import { rise } from '../motion'
import { color, font } from '../theme'

export const OUTRO_FRAMES = 120

/** Name, promise, where to go, and the small print the app itself shows */
export function Outro() {
  const frame = useCurrentFrame()
  const name = rise(frame, 0, 14)
  const pill = rise(frame, 30)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: font.sans }}>
      <div
        style={{
          fontSize: 190,
          fontWeight: 700,
          letterSpacing: '-0.05em',
          opacity: name,
          transform: `scale(${0.9 + name * 0.1})`,
        }}
      >
        Holdsake
      </div>
      <div style={{ marginTop: 4, fontSize: 54, fontWeight: 500, color: color.muted }}>
        <Words text="Give real ownership." delay={14} stagger={5} />
      </div>
      <div
        style={{
          marginTop: 56,
          padding: '22px 44px',
          borderRadius: 60,
          background: color.ink,
          color: color.paper,
          fontSize: 38,
          fontWeight: 500,
          opacity: pill,
          transform: `translateY(${(1 - pill) * 30}px)`,
        }}
      >
        holdsake.vercel.app
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 56,
          fontSize: 22,
          color: color.muted,
          opacity: rise(frame, 44),
          textAlign: 'center',
        }}
      >
        Not available to US persons or in restricted countries. Shares can go down as well as up.
      </div>
    </AbsoluteFill>
  )
}
