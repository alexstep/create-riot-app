// import 'babel-polyfill'

// Cache static
if (process.env.APP_SW_CACHE) {
	require('ServiceWorker/cache.sw.js')()
}

// Push-notifications
require('ServiceWorker/push.sw.js')()

// Background tasks
require('ServiceWorker/background.sw.js')()
