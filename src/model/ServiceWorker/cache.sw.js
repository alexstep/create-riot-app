/*
 * Caching resources
 */

/* global URL location */

module.exports = function () {
  console.groupCollapsed('SW::Cache')
  const CACHE_NAME = '_cache_' + ((new Date()).toISOString())

  console.log('SW::Cache CACHE_NAME:', CACHE_NAME)

  // caching assets list
  const {assets} = global.serviceWorkerOption

  let assetsToCache = [
    ...assets,
    './', '/index.html'
  ]

  assetsToCache = assetsToCache.map(path => {
    return new URL(path, global.location).toString()
  })

  console.log('assetsToCache', assetsToCache)

  console.groupEnd()

  self.addEventListener('install', (event) => {
    console.log('Cache [SW] Install event ' + CACHE_NAME)

    event.waitUntil(self.skipWaiting())

    // Add core website files to cache during serviceworker installation.
    event.waitUntil(
      global.caches
        .open(CACHE_NAME)
        .then((cache) => {
          return cache.addAll(assetsToCache)
        })
        .then(() => {
          console.log('Cached assets: main', assetsToCache)
        })
        .catch((error) => {
          console.error(error)
          throw error
        })
    )
  })


  // After the install event.
  self.addEventListener('activate', (event) => {
    console.log('Cache [SW] Activate event')

    event.waitUntil(self.clients.claim())

    // Clean the caches
    event.waitUntil(
      global.caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.indexOf(CACHE_NAME) === 0) {
              return null
            }

            return global.caches.delete(cacheName)
          }),
        )
      }),
    )
  })


  self.addEventListener('fetch', (event) => {
    const request = event.request

    if (request.method !== 'GET') {
      console.log(`Cache [SW] Ignore non GET request ${request.method}`)
      return
    }

    const requestUrl = new URL(request.url)


    if (requestUrl.origin !== location.origin) {
      console.log(`Cache [SW] Ignore difference origin ${requestUrl.origin}`)
      return
    }

    const resource = global.caches.match(request)
      .then((response) => {
        if (response) {
          console.log(`Cache [SW] fetch URL ${requestUrl.href} from cache`)

          return response
        }

        return fetch(request)
          .then((responseNetwork) => {
            if (!responseNetwork || !responseNetwork.ok) {
              console.log(`[SW] URL [${
                requestUrl.toString()}] wrong responseNetwork: ${
                responseNetwork.status} ${responseNetwork.type}`)

              return responseNetwork
            }

            console.log(`Cache [SW] URL ${requestUrl.href} fetched`)

            const responseCache = responseNetwork.clone()

            global.caches
              .open(CACHE_NAME)
              .then((cache) => {
                return cache.put(request, responseCache)
              })
              .then(() => {
                console.log(`[SW] Cache asset: ${requestUrl.href}`)
              })

            return responseNetwork
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return global.caches.match('./')
            }

            return null
          })
      })
    event.respondWith(resource)
  })

  return global.caches
}
