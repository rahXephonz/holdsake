import { AbsoluteFill, Audio, interpolate, Series, staticFile } from 'remotion'
import { useFonts } from './fonts'
import { Backdrop } from './kit'
import { Brand, BRAND_FRAMES } from './scenes/brand'
import { Fund, FUND_FRAMES } from './scenes/fund'
import { Gift, GIFT_FRAMES } from './scenes/gift'
import { Hook, HOOK_FRAMES } from './scenes/hook'
import { More, MORE_FRAMES } from './scenes/more'
import { Outro, OUTRO_FRAMES } from './scenes/outro'

// Copy follows the app's rules: no crypto words, nothing promised about returns or privacy
const SCENES = [
  { Scene: Hook, frames: HOOK_FRAMES },
  { Scene: Brand, frames: BRAND_FRAMES },
  { Scene: Gift, frames: GIFT_FRAMES },
  { Scene: Fund, frames: FUND_FRAMES },
  { Scene: More, frames: MORE_FRAMES },
  { Scene: Outro, frames: OUTRO_FRAMES },
]

export const LAUNCH_FRAMES = SCENES.reduce((sum, scene) => sum + scene.frames, 0)

export function Launch() {
  useFonts()
  return (
    <AbsoluteFill>
      <Backdrop />
      {/* Both synthesised by scripts/music.ts: the track on the scenes' 120 BPM grid, and the
          effects timed to frames in the scenes */}
      <Audio
        src={staticFile('music.wav')}
        volume={(frame) =>
          interpolate(frame, [LAUNCH_FRAMES - 45, LAUNCH_FRAMES], [0.9, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />
      <Audio src={staticFile('sfx.wav')} volume={0.8} />
      <Series>
        {SCENES.map(({ Scene, frames }, index) => (
          <Series.Sequence key={index} durationInFrames={frames}>
            <Scene />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  )
}
