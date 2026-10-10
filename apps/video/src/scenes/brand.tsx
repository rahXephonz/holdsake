import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { Words } from '../kit'
import { fadeOut, rise } from '../motion'
import { color, font } from '../theme'

export const BRAND_FRAMES = 90

/** The name lands letter by letter, then the promise under it */
export function Brand() {
  const frame = useCurrentFrame()
  const name = 'Holdsake'
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut(frame, BRAND_FRAMES),
      }}
    >
      <div
        style={{
          fontFamily: font.sans,
          fontWeight: 700,
          fontSize: 210,
          letterSpacing: '-0.05em',
          color: color.ink,
          display: 'flex',
        }}
      >
        {name.split('').map((letter, index) => {
          const progress = rise(frame, index * 2.5, 14)
          return (
            <span
              key={index}
              style={{
                display: 'inline-block',
                opacity: progress,
                transform: `translateY(${(1 - progress) * 80}px) rotate(${(1 - progress) * 12}deg)`,
              }}
            >
              {letter}
            </span>
          )
        })}
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: font.sans,
          fontSize: 56,
          fontWeight: 500,
          color: color.muted,
          letterSpacing: '-0.01em',
          transform: `translateY(${interpolate(frame, [30, 90], [0, -6])}px)`,
        }}
      >
        <Words text="Give real ownership." delay={28} stagger={5} />
      </div>
    </AbsoluteFill>
  )
}
