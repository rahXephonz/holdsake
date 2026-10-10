import { useEffect, useState } from 'react'
import { continueRender, delayRender } from 'remotion'

// Same families the app links from Google Fonts. Every frame waits until they've loaded, so no
// frame renders in a fallback face.
const HREF =
  'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Inter:wght@500;600;700&display=block'

export function useFonts() {
  const [handle] = useState(() => delayRender('fonts'))
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = HREF
    link.addEventListener('load', () => {
      void Promise.all([
        document.fonts.load('700 48px "Google Sans"'),
        document.fonts.load('500 48px "Google Sans"'),
        document.fonts.load('400 48px "Google Sans"'),
        document.fonts.load('700 48px "Inter"'),
        document.fonts.load('600 48px "Inter"'),
      ]).finally(() => continueRender(handle))
    })
    link.addEventListener('error', () => continueRender(handle))
    document.head.appendChild(link)
  }, [handle])
}
