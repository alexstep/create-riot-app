import { createBrowserHub } from './browser-hub'
import type { ClientMsg } from './protocol'

type SharedScope = {
  onconnect: ((event: MessageEvent) => void) | null
  location: { origin: string }
}

const scope = globalThis as unknown as SharedScope

const hub = createBrowserHub(scope.location.origin, 'shared-worker')
void hub.start()

scope.onconnect = (event: MessageEvent) => {
  const port = event.ports[0]
  if (!port) return
  const bound = hub.bind((msg) => {
    port.postMessage(msg)
  })
  port.addEventListener('message', (message: MessageEvent) => {
    bound.push(message.data as ClientMsg)
  })
  port.start()
}
