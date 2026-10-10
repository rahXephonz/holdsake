// The app's look, held to its rules: light only, ink and paper, green only for growth
export const FPS = 30

export const color = {
  paper: '#FFFFFF',
  surface: '#F2F2F2',
  ink: '#111111',
  muted: '#6B6B6B',
  line: '#E4E4E4',
  gain: '#1F9D55',
}

export const font = {
  sans: '"Google Sans", "Inter", system-ui, sans-serif',
  number: '"Inter", system-ui, sans-serif',
}

/** Seconds to frames */
export const s = (seconds: number) => Math.round(seconds * FPS)
