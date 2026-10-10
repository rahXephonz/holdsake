import type { ReactNode } from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { Words } from '../kit'
import { fadeOut, rise } from '../motion'
import { color, font } from '../theme'

export const MORE_FRAMES = 150

/** Earn and Borrow, with the same drawings as their cards on Home */
export function More() {
  const frame = useCurrentFrame()
  const tiles = [
    {
      art: <EarnArt grow={rise(frame, 30, 12)} />,
      title: 'Earn',
      body: 'Your cash earns interest, paid out as shares you pick.',
      at: 14,
    },
    {
      art: <BorrowArt lift={rise(frame, 42, 12)} />,
      title: 'Borrow',
      body: 'Cash against your shares, without selling them.',
      at: 24,
    },
  ]
  return (
    <AbsoluteFill
      style={{
        opacity: fadeOut(frame, MORE_FRAMES),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: font.sans,
          fontWeight: 700,
          fontSize: 110,
          letterSpacing: '-0.04em',
        }}
      >
        <Words text="More than gifts." />
      </div>
      <div style={{ marginTop: 80, display: 'flex', gap: 48 }}>
        {tiles.map((tile) => {
          const progress = rise(frame, tile.at, 16)
          return (
            <div
              key={tile.title}
              style={{
                width: 640,
                borderRadius: 48,
                background: color.surface,
                padding: 44,
                display: 'flex',
                gap: 36,
                alignItems: 'center',
                opacity: progress,
                transform: `translateY(${(1 - progress) * 120}px)`,
                fontFamily: font.sans,
              }}
            >
              <Tile>{tile.art}</Tile>
              <div>
                <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {tile.title}
                </div>
                <div style={{ marginTop: 8, fontSize: 28, lineHeight: 1.35, color: color.muted }}>
                  {tile.body}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

function Tile({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 170,
        height: 170,
        flexShrink: 0,
        borderRadius: 40,
        background: color.paper,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  )
}

function EarnArt({ grow }: { grow: number }) {
  return (
    <svg viewBox="0 0 64 64" width="130" height="130">
      <rect x="14" y="46" width="32" height="9" rx="4.5" fill={color.ink} />
      <rect x="11" y="36" width="32" height="9" rx="4.5" fill={color.ink} />
      <rect x="16" y="26" width="32" height="9" rx="4.5" fill={color.ink} />
      <rect x="21" y="29.5" width="10" height="2" rx="1" fill={color.paper} />
      <rect x="16" y="39.5" width="10" height="2" rx="1" fill={color.paper} />
      <rect x="19" y="49.5" width="10" height="2" rx="1" fill={color.paper} />
      {/* The sprout grows up out of the stack */}
      <g transform={`translate(32.5 27) scale(${grow}) translate(-32.5 -27)`}>
        <rect x="31" y="12" width="3" height="15" rx="1.5" fill={color.gain} />
        <path d="M32.5 17 C26 17 21 13 20 6 C27 6 32 10 32.5 17Z" fill={color.gain} />
        <path d="M32.5 14 C38 14 43 10.5 44 4.5 C38 4.5 33 8 32.5 14Z" fill={color.gain} />
      </g>
    </svg>
  )
}

function BorrowArt({ lift }: { lift: number }) {
  return (
    <svg viewBox="0 0 64 64" width="130" height="130">
      <rect x="8" y="38" width="10" height="18" rx="2.5" fill={color.ink} />
      <rect x="21" y="28" width="10" height="28" rx="2.5" fill={color.ink} />
      <rect x="34" y="34" width="10" height="22" rx="2.5" fill={color.ink} />
      <rect x="6" y="55" width="40" height="3" rx="1.5" fill={color.ink} />
      <path
        d="M30 20 C34 12 40 9 45 10"
        fill="none"
        stroke={color.ink}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 5"
        opacity={lift}
      />
      {/* The coin lifts off the bars while they stay put */}
      <g transform={`translate(${(1 - lift) * -22} ${(1 - lift) * 18})`} opacity={lift}>
        <circle cx="50" cy="13" r="10" fill={color.ink} />
        <path
          d="M53.5 9.5 C52.5 8 46.5 7.5 46.5 11 C46.5 14.5 53.5 11.8 53.5 15.2 C53.5 18.5 47.5 18 46.5 16.5 M50 6 V20"
          fill="none"
          stroke={color.paper}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
