/*
 * Push-notifictaions
 */

/* global clients */

module.exports = function () {

  self.addEventListener('message', (event) => {
    if (event.data && event.data.pushEnabled) {
      self.registration.showNotification(
        'Notifications enbaled',
        {
          body: 'Now we can notify you about DApp status',
          icon: '/static/meta/android-chrome-192x192.png',
          tag:  'push'
        })
    }
  })

  self.addEventListener('notificationclick', function (event) {
    let url = self.location.hostname
    event.notification.close()
    event.waitUntil(
      clients.matchAll({type: 'window'}).then( windowClients => {
        for (let i = 0; i < windowClients.length; i++) {
          let client = windowClients[i]

          if (client.url === url && 'focus' in client) {
            return client.focus()
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      })
    )
  })

  // self.addEventListener('push', function(event) {
  //  console.log('Received a push message', event)

  //  let title = 'Yay a message.'
  //  let body  = 'We have received a push message.'
  //  let icon  = '/images/icon-192x192.png'
  //  let tag   = 'simple-push-demo-notification-tag'

  //  event.waitUntil(
  //    self.registration.showNotification(title, {
  //      body: body,
  //      icon: icon,
  //      tag: tag
  //    })
  //  )
  // })

  return true
}
