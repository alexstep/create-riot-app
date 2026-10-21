import { shouldHandle, strategy } from './client/cache-policy'

const CACHE = `shell-${BUILD_HASH}`
const PRECACHE = JSON.parse(PRECACHE_JSON) as string[]
type WorkerEvent = {
  waitUntil(promise: Promise<unknown>): void
  request: Request
  respondWith(response: Promise<Response> | Response): void
  data?: { type?: string }
}

type SwScope = {
  addEventListener(type: string, listener: (event: WorkerEvent) => void): void
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  location: { origin: string }
}

const sw = self as unknown as SwScope

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

sw.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('shell-') && key !== CACHE).map((key) => caches.delete(key)))
    await sw.clients.claim()
  })())
})

sw.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | null
  if (data?.type === 'skip-waiting') void sw.skipWaiting()
})

sw.addEventListener('fetch', (event) => {
  if (!shouldHandle(event.request.method, event.request.url, sw.location.origin)) return
  const url = new URL(event.request.url)
  const plan = strategy(url.pathname, event.request.mode)
  event.respondWith(plan === 'cache-first' ? cacheFirst(event.request) : networkFirst(event.request))
})

async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  try {
    const fresh = await fetch(request)
    if (request.mode === 'navigate') await cache.put(new Request('/index.html'), fresh.clone())
    return fresh
  } catch {
    const cached = await cache.match(request.mode === 'navigate' ? '/index.html' : request)
    return cached ?? (await cache.match('/offline.html')) ?? new Response('Offline', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    })
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const fresh = await fetch(request)
  if (fresh.ok) await cache.put(request, fresh.clone())
  return fresh
}
