import { Composition } from 'remotion'
import { Demo, DEMO_FRAMES } from './demo'
import { Launch, LAUNCH_FRAMES } from './launch'
import { FPS } from './theme'

export function Root() {
  return (
    <>
      <Composition
        id="Launch"
        component={Launch}
        durationInFrames={LAUNCH_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Demo"
        component={Demo}
        durationInFrames={DEMO_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  )
}
