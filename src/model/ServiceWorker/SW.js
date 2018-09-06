/*
 * Wrap for using service worker
 * https://github.com/oliviertassinari/serviceworker-webpack-plugin
 */

/* global ServiceWorkerRegistration Notification MessageChannel */
import runtime        from 'serviceworker-webpack-plugin/lib/runtime'
import registerEvents from 'serviceworker-webpack-plugin/lib/browser/registerEvents'
import applyUpdate    from 'serviceworker-webpack-plugin/lib/browser/applyUpdate'

let SWReady

let SW_supported = ('serviceWorker' in navigator)

export default new class SW {
	constructor () {
		SW_supported = ('serviceWorker' in navigator)

		if (!SW_supported) {
			console.warn('Browser not support serviceWorkers')
		}
	}

	enabled () {
		return (navigator.serviceWorker && navigator.serviceWorker.controller)
	}

	register () {
		if (!SW_supported) return
		console.groupCollapsed('SW::register')

		SWReady = runtime.register({ scope: (process.env.APP_SW_SCOPE || '/') })

		// let _this = this
		registerEvents(SWReady, {
			onInstalled () {
				console.log('SW onInstalled')
				setTimeout(window.location.reload, 999)
			},
			onUpdateReady () {
				console.log('SW onUpdateReady')
				applyUpdate().then(() => {
					window.location.reload()
				})
			},
			onUpdating () {
				console.log('SW onUpdating')
			},
			onUpdateFailed () {
				console.log('SW onUpdateFailed')
			},
			onUpdated () {
				console.log('SW onUpdated')
			}
		})

		console.groupEnd('SW::register')
	}

	delete () {
		if (!SW_supported) return

		return SWReady.then(serviceWorkerRegistration => {
			return serviceWorkerRegistration.unregister()
		})
	}

	enablePush (callback) {
		if (!SW_supported) return

		if (!('showNotification' in ServiceWorkerRegistration.prototype)) {
			console.warn('Notifications aren\'t supported.')
			return
		}

		if (Notification.permission === 'denied') {
			console.warn('The user has blocked notifications.')
			return
		}

		if (!('PushManager' in window)) {
			console.warn('Push messaging isn\'t supported.')
			return
		}

		SWReady.then((serviceWorkerRegistration) => {
			serviceWorkerRegistration.pushManager.getSubscription().then((subscription) => {
				if (subscription) {
					return subscription
				}
				return serviceWorkerRegistration.pushManager.subscribe({
					userVisibleOnly: true
				})
			}).then(function (push_data) {
				callback(push_data)
			})
		})
	}

	/**
   * send msg to service worker
   * @param  {[type]}  message  [description]
   * @param  {Boolean} callback [description]
   * @return {[type]}           [description]
   */
	request (data, callback = false) {
		if (!this.enabled()) return false

		return new Promise(function (resolve, reject) {
			var messageChannel = new MessageChannel()
			messageChannel.port1.onmessage = function (event) {
				if (event.data.error) {
					reject(event.data.error)
					return
				}

				resolve(event.data)
				if (callback) callback(event.data)
			}

			navigator.serviceWorker.controller.postMessage(data, [messageChannel.port2])
		})
	}

	sendMessage (data) {
		if (!this.enabled()) return false

		var messageChannel = new MessageChannel()
		navigator.serviceWorker.controller.postMessage(data, [messageChannel.port2])
	}
	onMessage (callback) {
		if (!SW_supported) return false

		navigator.serviceWorker.addEventListener('message', callback)
	}
}()
