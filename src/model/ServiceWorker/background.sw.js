

module.exports = function () {


  self.addEventListener('message', event => {
    if (!event.data || !event.ports || !event.ports[0]) return

    console.groupCollapsed('SW::Message event')

    console.log(event.data)

    event.ports[0].postMessage({my_data_recived:event.data})
    console.groupEnd()
  })


}
