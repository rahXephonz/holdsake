import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { Words } from '../kit'
import { fadeOut } from '../motion'
import { color, font } from '../theme'

export const HOOK_FRAMES = 90

/** The question the whole video answers */
export function Hook() {
  const frame = useCurrentFrame()
  // The underline sweeps in under "grow" once the line has landed
  const sweep = interpolate(frame, [34, 52], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - (1 - t) ** 3,
  })
  const zoom = interpolate(frame, [0, HOOK_FRAMES], [1, 1.04])
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut(frame, HOOK_FRAMES),
        transform: `scale(${zoom})`,
      }}
    >
      <div
        style={{
          fontFamily: font.sans,
          fontWeight: 700,
          fontSize: 150,
          lineHeight: 1.05,
          letterSpacing: '-0.04em',
          color: color.ink,
          textAlign: 'center',
        }}
      >
        <Words text="What if a gift" />
        <br />
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <Words text="could grow?" delay={12} highlight="grow" />
          <span
            style={{
              position: 'absolute',
              left: '44%',
              right: '9%',
              bottom: 6,
              height: 14,
              borderRadius: 7,
              background: color.gain,
              opacity: 0.25,
              transform: `scaleX(${sweep})`,
              transformOrigin: 'left',
            }}
          />
        </span>
      </div>
    </AbsoluteFill>
  )
}
