# App icons

Drop the logo here under these exact names; the manifest, the page head and the install banner
already point at them, so nothing else needs changing.

| File                    | Size    | Used by                                                      |
| ----------------------- | ------- | ------------------------------------------------------------ |
| `icon-192.png`          | 192×192 | Android home screen, browser tab, install banner             |
| `icon-512.png`          | 512×512 | Android splash and install dialog                            |
| `icon-maskable-512.png` | 512×512 | Android adaptive icon: keep the mark inside the middle 80%   |
| `apple-touch-icon.png`  | 180×180 | iPhone home screen (no transparency; iOS rounds the corners) |

Or put one square `logo.png` (at least 1024×1024) here and run
`node --experimental-strip-types apps/app/scripts/icons.ts` to make all four.
