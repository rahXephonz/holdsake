// Makes every app icon from one square logo in public/icons (logo.svg or logo.png, at least
// 1024 px). Run from the repo root: node --experimental-strip-types apps/app/scripts/icons.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const dir = new URL('../public/icons/', import.meta.url)
const svgSource = new URL('logo.svg', dir)
const pngSource = new URL('logo.png', dir)

let href: string
if (existsSync(svgSource))
  href = `data:image/svg+xml;base64,${readFileSync(svgSource).toString('base64')}`
else if (existsSync(pngSource))
  href = `data:image/png;base64,${readFileSync(pngSource).toString('base64')}`
else throw new Error('Put logo.svg or logo.png in apps/app/public/icons first')

// The logo's own tile colour: filling behind it hides its rounded corners where the platform
// rounds or crops the icon itself, so they never show as a white ring
const tile = '#2B4BF2'

/** The logo on a square canvas; `inset` shrinks it toward the middle, `background` fills behind */
function render(name: string, size: number, { inset = 0, background = '' } = {}) {
  const box = size * (1 - inset * 2)
  const offset = size * inset
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${
    background ? `<rect width="100%" height="100%" fill="${background}"/>` : ''
  }<image href="${href}" x="${offset}" y="${offset}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"/></svg>`
  writeFileSync(new URL(name, dir), new Resvg(svg).render().asPng())
  console.log(`${name} ${size}×${size}`)
}

render('icon-192.png', 192)
render('icon-512.png', 512)
// Android crops adaptive icons to a circle or squircle: keep the mark in the safe middle
render('icon-maskable-512.png', 512, { inset: 0.1, background: tile })
// iOS shows transparency as black and rounds the corners itself
render('apple-touch-icon.png', 180, { background: tile })
