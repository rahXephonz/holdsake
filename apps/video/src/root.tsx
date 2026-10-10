import { Composition } from 'remotion'
import { Launch, LAUNCH_FRAMES } from './launch'
import { FPS } from './theme'

export function Root() {
  return (
    <Composition
      id="Launch"
      component={Launch}
      durationInFrames={LAUNCH_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  )
}
