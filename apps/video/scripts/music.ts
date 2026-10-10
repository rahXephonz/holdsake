// Writes public/music.wav and public/sfx.wav, synthesised from scratch so the video carries no
// licence. 120 BPM: a beat is 15 frames at 30 fps, so cuts and the drop land on the grid. The
// sound effects are timed to frames in the scenes; keep the two in step when a scene changes.
import { writeFileSync } from 'node:fs'

const RATE = 44_100
const SECONDS = 31
const LENGTH = SECONDS * RATE
const BEAT = 0.5
const BAR = BEAT * 4
const TAU = Math.PI * 2

type Stereo = { left: Float32Array; right: Float32Array }
const bus = (): Stereo => ({ left: new Float32Array(LENGTH), right: new Float32Array(LENGTH) })

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12)
const saw = (phase: number) => 2 * (phase - Math.floor(phase + 0.5))
const lpCoef = (cutoff: number) => 1 - Math.exp((-TAU * cutoff) / RATE)
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

let seed = 11
const noise = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
  return (seed / 2_147_483_648) * 2 - 1
}

function put(target: Stereo, index: number, value: number, pan = 0) {
  if (index < 0 || index >= LENGTH) return
  target.left[index] = (target.left[index] ?? 0) + value * Math.cos(((pan + 1) * Math.PI) / 4)
  target.right[index] = (target.right[index] ?? 0) + value * Math.sin(((pan + 1) * Math.PI) / 4)
}

/** Freeverb-style room: parallel combs into series allpasses, per channel */
function reverb(input: Stereo, mix: number, size = 0.84): Stereo {
  const out = bus()
  const process = (source: Float32Array, target: Float32Array, spread: number) => {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => ({
      buffer: new Float32Array(d + spread),
      index: 0,
      low: 0,
    }))
    const allpasses = [556, 441, 341].map((d) => ({
      buffer: new Float32Array(d + spread),
      index: 0,
    }))
    for (let i = 0; i < LENGTH; i++) {
      const x = (source[i] ?? 0) * 0.015
      let sum = 0
      for (const comb of combs) {
        const delayed = comb.buffer[comb.index] ?? 0
        comb.low = delayed * 0.7 + comb.low * 0.3
        comb.buffer[comb.index] = x + comb.low * size
        comb.index = (comb.index + 1) % comb.buffer.length
        sum += delayed
      }
      for (const allpass of allpasses) {
        const delayed = allpass.buffer[allpass.index] ?? 0
        allpass.buffer[allpass.index] = sum + delayed * 0.5
        allpass.index = (allpass.index + 1) % allpass.buffer.length
        sum = delayed - sum
      }
      target[i] = (source[i] ?? 0) + sum * mix
    }
  }
  process(input.left, out.left, 0)
  process(input.right, out.right, 23)
  return out
}

function mixInto(target: Stereo, source: Stereo, gain = 1) {
  for (let i = 0; i < LENGTH; i++) {
    target.left[i] = (target.left[i] ?? 0) + (source.left[i] ?? 0) * gain
    target.right[i] = (target.right[i] ?? 0) + (source.right[i] ?? 0) * gain
  }
}

function writeWav(name: string, input: Stereo, peakTo: number) {
  let peak = 0
  for (let i = 0; i < LENGTH; i++)
    peak = Math.max(peak, Math.abs(input.left[i] ?? 0), Math.abs(input.right[i] ?? 0))
  const gain = peak ? peakTo / peak : 1
  const data = Buffer.alloc(LENGTH * 4)
  for (let i = 0; i < LENGTH; i++) {
    // Gentle soft clip so peaks round off instead of cracking
    const shape = (x: number) => Math.tanh(x * gain * 1.1) / Math.tanh(1.1)
    data.writeInt16LE(Math.round(clamp(shape(input.left[i] ?? 0), -1, 1) * 32_767), i * 4)
    data.writeInt16LE(Math.round(clamp(shape(input.right[i] ?? 0), -1, 1) * 32_767), i * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  writeFileSync(new URL(`../public/${name}`, import.meta.url), Buffer.concat([header, data]))
}

// ---------------------------------------------------------------- music

const DROP = 3 // the brand reveal
const DRUMS_END = 29 // the outro lets the last chord ring
// I–V–vi–IV in C, a bar each
const CHORDS = [
  [60, 64, 67, 72],
  [55, 62, 67, 71],
  [57, 64, 69, 72],
  [53, 60, 65, 69],
]
const ROOTS = [36, 31, 33, 29]
const chordAt = (t: number) => Math.floor(t / BAR) % CHORDS.length

/** How far the pad and bass duck under each kick: the pumping that makes it move */
function duck(t: number) {
  if (t < DROP || t >= DRUMS_END) return 1
  const since = (t - DROP) % BEAT
  return 1 - 0.65 * Math.exp(-since * 9)
}

const dry = bus()
const wet = bus() // what goes through the room

// Pad: five detuned saws per note, low-passed; the filter opens through the intro
{
  const voices = [-0.12, -0.05, 0, 0.05, 0.12]
  let lowL = 0
  let lowR = 0
  const phases = new Float64Array(4 * voices.length)
  for (let i = 0; i < LENGTH; i++) {
    const t = i / RATE
    const chord = CHORDS[chordAt(t)]!
    let left = 0
    let right = 0
    chord.forEach((note, n) => {
      voices.forEach((detune, v) => {
        const k = n * voices.length + v
        phases[k] = ((phases[k] ?? 0) + midi(note + detune) / RATE) % 1
        const value = saw(phases[k] ?? 0)
        if (v % 2) left += value
        else right += value
      })
    })
    const cutoff = t < DROP ? 300 + (t / DROP) ** 2 * 2600 : t > DRUMS_END ? 1800 : 2600
    const a = lpCoef(cutoff)
    lowL += a * (left - lowL)
    lowR += a * (right - lowR)
    const level = 0.05 * duck(t) * Math.min(1, t / 1.2) * Math.min(1, (SECONDS - t) / 3)
    put(wet, i, lowL * level, -0.6)
    put(wet, i, lowR * level, 0.6)
  }
}

// Bass: saw an octave down with a plucky filter, on the offbeat eighths after the drop
{
  let phase = 0
  let low = 0
  for (let i = Math.round(DROP * RATE); i < Math.round(DRUMS_END * RATE); i++) {
    const t = i / RATE
    const sinceEighth = (t - DROP) % (BEAT / 2)
    const offbeat = Math.floor((t - DROP) / (BEAT / 2)) % 2 === 1
    const freq = midi(ROOTS[chordAt(t)]!)
    phase = (phase + freq / RATE) % 1
    const env = offbeat ? Math.exp(-sinceEighth * 10) : 0
    low += lpCoef(180 + 1200 * Math.exp(-sinceEighth * 18)) * (saw(phase) - low)
    put(dry, i, low * env * 0.32 * duck(t))
  }
}

// Lead hook: a two-bar pentatonic motif in eighths, a pluck with a long room
{
  const motif = [76, 79, 81, 79, 76, 74, 72, 74, 76, 79, 84, 81, 79, 76, 74, 76]
  for (let step = 0; ; step++) {
    const start = DROP + step * (BEAT / 2)
    if (start >= DRUMS_END) break
    // Rests every other bar-pair keep it from nagging
    if (Math.floor(step / 16) % 2 === 1 && step % 4 !== 0) continue
    const freq = midi(motif[step % motif.length]!)
    const startIndex = Math.round(start * RATE)
    for (let j = 0; j < RATE * 0.6; j++) {
      const t = j / RATE
      const env = Math.exp(-t * 7) * Math.min(1, t / 0.003)
      const value =
        (Math.sin(TAU * freq * t) + 0.35 * Math.sin(TAU * freq * 2 * t) + 0.12 * saw(freq * t)) *
        env *
        0.07
      put(wet, startIndex + j, value, step % 2 ? 0.35 : -0.35)
    }
  }
}

// Drums
for (let t = DROP; t < DRUMS_END; t += BEAT) {
  const beat = Math.round((t - DROP) / BEAT)
  const start = Math.round(t * RATE)
  // Kick: a sine falling from ~158 Hz to 48 Hz, with a click on top
  for (let j = 0; j < RATE * 0.4; j++) {
    const s = j / RATE
    const body = Math.sin(TAU * (48 * s + (110 / 28) * (1 - Math.exp(-s * 28)))) * Math.exp(-s * 7)
    const click = j < 90 ? noise() * (1 - j / 90) * 0.4 : 0
    put(dry, start + j, (body + click) * 0.55)
  }
  // Clap on 2 and 4: three quick noise bursts then a tail, band-limited
  if (beat % 2 === 1) {
    let low = 0
    let high = 0
    for (let j = 0; j < RATE * 0.25; j++) {
      const s = j / RATE
      const bursts = s < 0.03 ? Math.exp(-((s % 0.01) * 300)) : 0
      const env = bursts + Math.exp(-s * 18) * 0.7
      const n = noise()
      low += lpCoef(3500) * (n - low)
      high += lpCoef(900) * (low - high)
      put(wet, start + j, (low - high) * env * 0.45)
    }
  }
  // Hats: closed on the offbeat, a bright tick
  {
    let low = 0
    const hat = start + Math.round((BEAT / 2) * RATE)
    for (let j = 0; j < RATE * 0.07; j++) {
      const n = noise()
      low += lpCoef(7000) * (n - low)
      put(dry, hat + j, (n - low) * Math.exp(-(j / RATE) * 55) * 0.16, 0.25)
    }
  }
}

// Riser into the drop: noise through a rising band, and a reverse swell
{
  let low = 0
  let band = 0
  const from = Math.round((DROP - 2.4) * RATE)
  for (let i = from; i < DROP * RATE; i++) {
    const p = (i - from) / (DROP * RATE - from)
    const n = noise()
    low += lpCoef(400 + p ** 2 * 9000) * (n - low)
    band += lpCoef(200 + p * 2000) * (low - band)
    put(wet, i, (low - band) * p ** 2.5 * 0.5, Math.sin(p * 9) * 0.5)
  }
}

const music = reverb(wet, 0.55)
mixInto(music, dry)
// Fade the very end so the tail never clicks off
for (let i = 0; i < LENGTH; i++) {
  const fade = clamp((SECONDS - i / RATE) / 1.5, 0, 1)
  music.left[i] = (music.left[i] ?? 0) * fade
  music.right[i] = (music.right[i] ?? 0) * fade
}
writeWav('music.wav', music, 0.85)

// ---------------------------------------------------------------- sound effects

const fx = bus()
const fxWet = bus()
const frames = (frame: number) => frame / 30

/** A whoosh across the stereo field: noise through a band that sweeps up then down */
function whoosh(peakAt: number, length = 0.7, gain = 0.6, direction = 1) {
  let low = 0
  let band = 0
  const start = Math.round((peakAt - length * 0.7) * RATE)
  const total = Math.round(length * RATE)
  for (let j = 0; j < total; j++) {
    const p = j / total
    const shape = p < 0.7 ? (p / 0.7) ** 2 : 1 - (p - 0.7) / 0.3
    const cutoff = 300 + 5000 * Math.sin(Math.PI * Math.min(1, p * 1.1))
    const n = noise()
    low += lpCoef(cutoff) * (n - low)
    band += lpCoef(cutoff * 0.35) * (low - band)
    put(fxWet, start + j, (low - band) * shape * gain, direction * (p * 2 - 1) * 0.9)
  }
}

/** A deep thump with a little air, for landing on a cut */
function impact(at: number, gain = 0.7) {
  const start = Math.round(at * RATE)
  for (let j = 0; j < RATE * 0.6; j++) {
    const s = j / RATE
    const body = Math.sin(TAU * (38 * s + (70 / 18) * (1 - Math.exp(-s * 18)))) * Math.exp(-s * 5)
    put(fx, start + j, body * gain)
  }
}

/** A short bright tap, like a button under a thumb */
function tap(at: number, gain = 0.5) {
  const start = Math.round(at * RATE)
  for (let j = 0; j < RATE * 0.05; j++) {
    const s = j / RATE
    put(fx, start + j, (Math.sin(TAU * 1800 * s) * 0.6 + noise() * 0.4) * Math.exp(-s * 140) * gain)
  }
}

/** Two bell tones a fifth apart, the success chime */
function chime(at: number, gain = 0.35) {
  for (const [offset, note] of [
    [0, 84],
    [0.09, 91],
  ] as const) {
    const start = Math.round((at + offset) * RATE)
    const freq = midi(note)
    for (let j = 0; j < RATE * 1.4; j++) {
      const s = j / RATE
      const env = Math.exp(-s * 3.2) * Math.min(1, s / 0.002)
      const value =
        Math.sin(TAU * freq * s) * 0.7 +
        Math.sin(TAU * freq * 2.76 * s) * 0.2 * Math.exp(-s * 6) +
        Math.sin(TAU * freq * 5.4 * s) * 0.1 * Math.exp(-s * 10)
      put(fxWet, start + j, value * env * gain, offset ? 0.25 : -0.25)
    }
  }
}

/** A round pop, pitched so a run of them climbs */
function pop(at: number, pitch: number, gain = 0.4) {
  const start = Math.round(at * RATE)
  for (let j = 0; j < RATE * 0.12; j++) {
    const s = j / RATE
    const freq = pitch * (1 + 1.5 * Math.exp(-s * 60))
    put(fxWet, start + j, Math.sin(TAU * freq * s) * Math.exp(-s * 35) * gain)
  }
}

// Scene cuts (frames): hook→brand 90, brand→gift 180, gift→fund 480, fund→more 660, more→outro 810
for (const [frame, direction] of [
  [180, 1],
  [480, -1],
  [660, 1],
  [810, -1],
] as const) {
  whoosh(frames(frame), 0.75, 0.55, direction)
  impact(frames(frame) + 0.02, 0.35)
}
// The drop gets the big one
impact(DROP, 0.9)
whoosh(DROP, 0.5, 0.35)
// Gift scene (starts at 180): phone rises, Send pressed at 118, sent at 132, card out at 154
whoosh(frames(180 + 12), 0.5, 0.3, -1)
tap(frames(180 + 118))
chime(frames(180 + 134))
whoosh(frames(180 + 160), 0.55, 0.4, 1)
// Fund scene (starts at 480): an avatar pops in at 36, 56, 76, 96
;[36, 56, 76, 96].forEach((frame, index) => pop(frames(480 + frame), 520 + index * 110))
// More scene (starts at 660): the two tiles land at 14 and 24
tap(frames(660 + 18), 0.3)
tap(frames(660 + 28), 0.3)
// Outro: the pill lands
pop(frames(810 + 34), 700, 0.35)
chime(frames(810 + 2), 0.22)

const sfx = reverb(fxWet, 0.35, 0.78)
mixInto(sfx, fx)
writeWav('sfx.wav', sfx, 0.9)
console.log('music.wav and sfx.wav written')
