import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion'
import { rise } from './motion'
import { color, font } from './theme'

/** Words that rise into place one after another, each from a little blur */
export function Words({
  text,
  delay = 0,
  stagger = 4,
  style,
  highlight,
}: {
  text: string
  delay?: number
  stagger?: number
  style?: CSSProperties
  /** A word drawn in the growth green */
  highlight?: string
}) {
  const frame = useCurrentFrame()
  return (
    <span style={{ display: 'inline-block', ...style }}>
      {text.split(' ').map((word, index) => {
        const progress = rise(frame, delay + index * stagger)
        // The spring overshoots and settles around 1; a blur that flips between a hair above
        // zero and below it renders differently frame to frame, so it switches off near the end
        const blur = Math.max(0, 1 - progress) * 10
        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              marginRight: '0.24em',
              opacity: Math.min(progress, 1),
              transform: `translateY(${(1 - progress) * 0.6}em)`,
              filter: blur < 0.5 ? 'none' : `blur(${blur}px)`,
              color: word.replace(/[.,?!]/g, '') === highlight ? color.gain : undefined,
            }}
          >
            {word}
          </span>
        )
      })}
    </span>
  )
}

const blob = (size: number, x: number, y: number, tint: string): CSSProperties => ({
  position: 'absolute',
  width: size,
  height: size,
  left: x,
  top: y,
  borderRadius: '50%',
  background: tint,
})

/** The slow drifting shapes behind every scene, so the white never feels empty */
export function Backdrop() {
  const frame = useCurrentFrame()
  const drift = (speed: number, range: number) => Math.sin(frame / speed) * range
  return (
    <AbsoluteFill style={{ background: color.paper, overflow: 'hidden' }}>
      <div style={blob(900, -260 + drift(90, 40), -380 + drift(70, 30), '#F6F6F6')} />
      <div style={blob(700, 1380 + drift(80, 50), 560 + drift(110, 40), '#F4F4F4')} />
      <div style={blob(260, 1500 + drift(60, 30), 120 + drift(75, 25), '#EEF7F1')} />
    </AbsoluteFill>
  )
}

/** A phone at the size the app is designed for, scaled up for the frame */
export function Phone({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: 420,
        height: 860,
        borderRadius: 64,
        background: color.ink,
        padding: 14,
        boxShadow: '0 60px 120px rgba(0,0,0,0.12), 0 20px 40px rgba(0,0,0,0.08)',
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 50,
          background: color.paper,
          overflow: 'hidden',
          fontFamily: font.sans,
          color: color.ink,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: '50%',
            width: 110,
            height: 32,
            marginLeft: -55,
            borderRadius: 20,
            background: color.ink,
            zIndex: 5,
          }}
        />
        {children}
      </div>
    </div>
  )
}

export function StockLogo({ ticker, size = 52 }: { ticker: string; size?: number }) {
  return (
    <Img
      src={`https://financialmodelingprep.com/image-stock/${ticker}.png`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color.surface,
        objectFit: 'contain',
      }}
    />
  )
}

export function Initial({
  name,
  size = 52,
  tint = color.surface,
}: {
  name: string
  size?: number
  tint?: string
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: tint,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: font.sans,
        fontWeight: 500,
        fontSize: size * 0.4,
        color: color.ink,
        flexShrink: 0,
      }}
    >
      {name[0]}
    </div>
  )
}

/** 0 before `start`, 1 after `end`, linear between */
export const between = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
