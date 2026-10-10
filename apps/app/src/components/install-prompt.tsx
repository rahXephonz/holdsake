import { ShareIcon, XIcon } from '@phosphor-icons/react'
import { useRef, useState, useSyncExternalStore } from 'react'

// Holdsake's install banner. The browser's install event is caught by an inline
// script in __root.tsx before React hydrates, since it fires once and early.

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    holdsakeInstallPrompt?: InstallEvent
    holdsakeInstalled?: boolean
  }
}

const DISMISSED = 'holdsake.install.banner.dismissed-until'
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

// Whether the banner belongs on screen: not installed, not dismissed lately. Re-read whenever
// the app gets installed or switches to standalone; false while rendering on the server.
function subscribe(onChange: () => void) {
  const displayMode = window.matchMedia('(display-mode: standalone)')
  addEventListener('appinstalled', onChange)
  displayMode.addEventListener('change', onChange)
  return () => {
    removeEventListener('appinstalled', onChange)
    displayMode.removeEventListener('change', onChange)
  }
}

function eligible() {
  if (isStandalone() || window.holdsakeInstalled) return false
  try {
    return !(Number(localStorage.getItem(DISMISSED)) > Date.now())
  } catch {
    // Installing still works when browser storage is unavailable
    return true
  }
}

const never = () => () => {}

export function InstallPrompt() {
  const show = useSyncExternalStore(subscribe, eligible, () => false)
  const ios = useSyncExternalStore(never, isIos, () => false)
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const hidden = !show || dismissed

  const install = async () => {
    const event = window.holdsakeInstallPrompt
    if (!event) {
      dialog.current?.showModal()
      return
    }
    // The browser's prompt is single-use and must open straight from this tap
    delete window.holdsakeInstallPrompt
    setInstalling(true)
    try {
      await event.prompt()
      if ((await event.userChoice).outcome === 'accepted') setDismissed(true)
    } catch {
      dialog.current?.showModal()
    } finally {
      setInstalling(false)
    }
  }

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED, String(Date.now() + 7 * 24 * 60 * 60 * 1000))
    } catch {
      // Dismissed for this page even if it can't be remembered
    }
  }

  if (hidden) return null

  return (
    <>
      <div aria-hidden="true" className="h-[calc(68px+env(safe-area-inset-top))] shrink-0" />
      <aside
        aria-label="Install Holdsake"
        className="fixed inset-x-0 top-0 z-50 mx-auto flex w-full max-w-md items-center gap-3 bg-background px-3 pt-[calc(12px+env(safe-area-inset-top))] pb-3"
      >
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <XIcon className="size-5" />
        </button>
        <AppIcon />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg font-bold">Holdsake</p>
          <p className="truncate text-xs text-muted-foreground">Stocks. Cash. Gifts.</p>
        </div>
        <button
          type="button"
          disabled={installing}
          onClick={install}
          className="min-h-11 shrink-0 rounded-full bg-secondary px-4 text-[15px] font-medium disabled:opacity-50"
        >
          {installing ? 'Installing…' : 'Install app'}
        </button>
      </aside>
      <dialog
        ref={dialog}
        aria-labelledby="install-title"
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-96 rounded-3xl bg-background p-6 text-foreground backdrop:bg-black/40"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="install-title" className="text-xl font-medium">
            Install Holdsake
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        {ios ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>In Safari, open this page and:</p>
            <ol className="list-inside list-decimal space-y-3">
              <li>
                Tap <ShareIcon className="inline size-4" aria-label="Share" /> Share in the browser
                menu.
              </li>
              <li>Choose “Add to Home Screen”.</li>
              <li>Keep “Open as Web App” on if shown, then tap “Add”.</li>
            </ol>
            <p className="text-muted-foreground">
              Don’t see it? Scroll down in the Share menu or turn it on under “Edit Actions”.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Open your browser’s menu and choose “Install app” or “Add to Home screen”. On a
              computer, look for the install icon in the address bar.
            </p>
            <p className="text-muted-foreground">
              Don’t see it? Open Holdsake in Chrome outside private browsing.
            </p>
          </div>
        )}
      </dialog>
    </>
  )
}

/** The app icon from public/icons; until that file exists the banner simply goes without */
function AppIcon() {
  const [missing, setMissing] = useState(false)
  if (missing) return null
  return (
    <img
      src="/icons/icon-192.png"
      alt=""
      width={44}
      height={44}
      onError={() => setMissing(true)}
      className="size-11 shrink-0 rounded-xl"
    />
  )
}
