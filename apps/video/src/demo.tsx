import type { ReactNode } from 'react'
import {
  AbsoluteFill,
  Audio,
  getStaticFiles,
  Img,
  interpolate,
  OffthreadVideo,
  Series,
  staticFile,
  useCurrentFrame,
} from 'remotion'
import { useFonts } from './fonts'
import { Backdrop, Words } from './kit'
import { fadeOut, rise } from './motion'
import { Hood, HOOD_FRAMES } from './scenes/hood'
import { color, font, FPS, s } from './theme'

// The hackathon demo: the three phone recordings (made by scripts/clips.sh), cut down and sped
// through the waits, with a line on screen for each step. Sped-up stretches say so on screen.

type Clip = { from: number; to: number; rate: number; line: string }
type Chapter = { step: string; title: string; src: string; clips: Clip[] }

const CHAPTERS: Chapter[] = [
  {
    step: '1',
    title: 'Send a gift',
    src: 'demo/recording-1.mp4',
    clips: [
      { from: 1, to: 4.5, rate: 1, line: 'Your shares and cash, in dollars.' },
      { from: 6.8, to: 17.6, rate: 1.25, line: 'Pick who it’s for, then up to 3 stocks and cash.' },
      { from: 17.6, to: 30.5, rate: 2.5, line: 'Wrap it in a card and add a note.' },
      { from: 30.5, to: 35, rate: 1, line: 'Review it, fee included, at cost.' },
      { from: 35, to: 50, rate: 6, line: 'One tap. Nothing to approve, nothing to top up.' },
      {
        from: 50,
        to: 54.5,
        rate: 1,
        line: 'Only Rahx can open it. Until then, Ry can take it back.',
      },
    ],
  },
  {
    step: '2',
    title: 'Open it',
    src: 'demo/recording-2.mp4',
    clips: [
      { from: 1, to: 8, rate: 1.5, line: 'Rahx sees it the moment they sign in.' },
      { from: 8, to: 10, rate: 3, line: 'Rahx sees it the moment they sign in.' },
      { from: 10, to: 13.6, rate: 1, line: 'The card, the note, and what’s inside.' },
      { from: 13.6, to: 26.6, rate: 6, line: 'Open gift.' },
      { from: 26.6, to: 30, rate: 1, line: 'Real shares, in their own account.' },
      { from: 37.6, to: 41.5, rate: 1.2, line: 'Balance and activity, updated.' },
    ],
  },
  {
    step: '3',
    title: 'Grow a fund together',
    src: 'demo/recording-3.mp4',
    clips: [
      { from: 1, to: 3, rate: 1, line: 'A goal fund: shares for someone, locked until a date.' },
      { from: 3, to: 5, rate: 3, line: 'A goal fund: shares for someone, locked until a date.' },
      { from: 5, to: 9.8, rate: 1, line: 'Add cash. It buys the fund’s mix.' },
      { from: 9.8, to: 23.6, rate: 6, line: 'Broadcom, Marvell and NVIDIA, in one go.' },
      { from: 23.6, to: 27.6, rate: 1, line: 'Every share bought, on the receipt.' },
      { from: 27.6, to: 33.5, rate: 1, line: 'Locked until October 31, 2026, for Ry alone.' },
    ],
  },
]

const clipFrames = (clip: Clip) => Math.round(((clip.to - clip.from) * FPS) / clip.rate)
const chapterFrames = (chapter: Chapter) =>
  chapter.clips.reduce((sum, clip) => sum + clipFrames(clip), 0)

const INTRO_FRAMES = s(4)
const OUTRO_FRAMES = s(5)

const SCENES = [
  { Scene: Intro, frames: INTRO_FRAMES },
  ...CHAPTERS.map((chapter) => ({
    Scene: () => <ChapterScene chapter={chapter} />,
    frames: chapterFrames(chapter),
  })),
  { Scene: Hood, frames: HOOD_FRAMES },
  { Scene: Outro, frames: OUTRO_FRAMES },
]

export const DEMO_FRAMES = SCENES.reduce((sum, scene) => sum + scene.frames, 0)

// A recorded voiceover dropped in public/demo plays over everything; the music ducks under it
const VOICE = getStaticFiles().find((file) => /^demo\/voice\.(wav|mp3|m4a)$/.test(file.name))

export function Demo() {
  useFonts()
  return (
    <AbsoluteFill>
      <Backdrop />
      <Audio
        src={staticFile('music.wav')}
        loop
        volume={(frame) =>
          interpolate(frame, [0, 20, DEMO_FRAMES - 45, DEMO_FRAMES], [0, 1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }) * (VOICE ? 0.12 : 0.35)
        }
      />
      {VOICE && <Audio src={VOICE.src} />}
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

function Intro() {
  const frame = useCurrentFrame()
  const logo = rise(frame, 0, 14)
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: font.sans,
        opacity: fadeOut(frame, INTRO_FRAMES),
      }}
    >
      <Img
        src={staticFile('logo.svg')}
        style={{ width: 150, height: 150, opacity: logo, transform: `scale(${0.8 + logo * 0.2})` }}
      />
      <div style={{ marginTop: 36, fontSize: 150, fontWeight: 700, letterSpacing: '-0.05em' }}>
        <Words text="Holdsake" delay={6} />
      </div>
      <div style={{ marginTop: 6, fontSize: 56, fontWeight: 500, color: color.muted }}>
        <Words text="Give real stocks, not gift cards." delay={18} stagger={4} />
      </div>
    </AbsoluteFill>
  )
}

/** The recording in a plain phone frame on the right, the step and its line on the left */
function ChapterScene({ chapter }: { chapter: Chapter }) {
  const frame = useCurrentFrame()
  const duration = chapterFrames(chapter)
  const enter = rise(frame, 0, 16)
  // Which clip is playing, and where its line began: clips that share a line keep it on screen
  // without animating it again
  let start = 0
  let lineStart = 0
  let current = chapter.clips[0]!
  let previous: Clip | undefined
  for (const clip of chapter.clips) {
    if (clip.line !== previous?.line) lineStart = start
    current = clip
    if (frame < start + clipFrames(clip)) break
    start += clipFrames(clip)
    previous = clip
  }
  return (
    <AbsoluteFill style={{ fontFamily: font.sans, opacity: fadeOut(frame, duration, 8) }}>
      <div
        style={{
          position: 'absolute',
          left: 170,
          top: 0,
          bottom: 0,
          width: 860,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          opacity: enter,
          transform: `translateY(${(1 - enter) * 40}px)`,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: color.ink,
            color: color.paper,
            fontFamily: font.number,
            fontWeight: 600,
            fontSize: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {chapter.step}
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
          }}
        >
          {chapter.title}
        </div>
        <div
          key={lineStart}
          style={{
            marginTop: 28,
            minHeight: 140,
            fontSize: 46,
            lineHeight: 1.3,
            color: color.muted,
          }}
        >
          <Words text={current.line} delay={lineStart + 4} stagger={2} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 230,
          top: 60,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 120}px)`,
        }}
      >
        <Screen>
          <Series>
            {chapter.clips.map((clip, index) => (
              <Series.Sequence key={index} durationInFrames={clipFrames(clip)}>
                <OffthreadVideo
                  src={staticFile(chapter.src)}
                  trimBefore={Math.round(clip.from * FPS)}
                  trimAfter={Math.round(clip.to * FPS)}
                  playbackRate={clip.rate}
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Series.Sequence>
            ))}
          </Series>
        </Screen>
        {current.rate >= 2 && (
          <div
            style={{
              position: 'absolute',
              top: 28,
              right: -24,
              padding: '10px 18px',
              borderRadius: 30,
              background: color.ink,
              color: color.paper,
              fontFamily: font.number,
              fontWeight: 600,
              fontSize: 24,
            }}
          >
            {current.rate}× speed
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

/** A phone with no notch: the recordings already have their status bar painted out */
function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 448,
        height: 960,
        borderRadius: 64,
        background: color.ink,
        padding: 12,
        boxShadow: '0 60px 120px rgba(0,0,0,0.12), 0 20px 40px rgba(0,0,0,0.08)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 52,
          overflow: 'hidden',
          background: color.paper,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Outro() {
  const frame = useCurrentFrame()
  const pill = rise(frame, 16)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: font.sans }}>
      <Img src={staticFile('logo.svg')} style={{ width: 120, height: 120 }} />
      <div style={{ marginTop: 28, fontSize: 130, fontWeight: 700, letterSpacing: '-0.05em' }}>
        Holdsake
      </div>
      <div style={{ fontSize: 50, fontWeight: 500, color: color.muted }}>
        <Words text="Give real ownership." delay={4} stagger={5} />
      </div>
      <div
        style={{
          marginTop: 48,
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
          opacity: rise(frame, 28),
        }}
      >
        Not available to US persons or in restricted countries. Shares can go down as well as up.
      </div>
    </AbsoluteFill>
  )
}
