import { interpolate, spring } from 'remotion'
import { FPS } from './theme'

/** 0→1 with a soft settle, starting at `delay` frames */
export const rise = (frame: number, delay = 0, damping = 18) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping, mass: 0.8, stiffness: 120 } })

/** Fades a whole scene out over its last few frames */
export const fadeOut = (frame: number, duration: number, over = 10) =>
  interpolate(frame, [duration - over, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

/** A number counting up between two frames, eased */
export const countUp = (frame: number, from: number, to: number, start: number, end: number) =>
  interpolate(frame, [start, end], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - (1 - t) ** 3,
  })

export const usd = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
