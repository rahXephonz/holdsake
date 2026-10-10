// Holdsake's service worker: an offline page, cached build assets, and phone
// notifications. Plain JS on purpose: it ships as-is from /public and never goes through Vite.

const VERSION = 'v1'
const SHELL = `holdsake-shell-${VERSION}`
const ASSETS = `holdsake-assets-${VERSION}`
const OFFLINE = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE, '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL && key !== ASSETS).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Prices, balances and gifts are never worth a stale answer
  if (url.pathname.startsWith('/api/')) return

  // Pages come from the network so a signed-in view is always current; the offline page stands
  // in only when the network is gone
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE).then((page) => page ?? Response.error())),
    )
    return
  }

  // Vite's build output is content-hashed, so once it's cached it can be served straight away
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              void caches.open(ASSETS).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Holdsake', {
      body: payload.body ?? '',
      data: { url: payload.url ?? '/notifications' },
      // One gift, one notification: a second push about the same thing replaces the first
      tag: payload.url ?? 'holdsake',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const window of windows) {
        if (window.url === target && 'focus' in window) return window.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
