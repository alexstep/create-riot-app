import { createBrowserHub } from './browser-hub'
import type { Hub, HubPort } from './hub'
import type { ClientMsg, ServerMsg } from './protocol'
import { finish, localChannel } from './wire'

/**
 * Fallback when SharedWorker is missing. One tab holds a Web Lock and runs the
 * hub. Other tabs speak the same protocol over a BroadcastChannel. When the
 * leader closes, the lock moves and that tab starts a hub of its own, hydrated
 * from Cache Storage.
 */
export async function connectLeader(origin: string) {
  const channel = new BroadcastChannel('riot-hub')
  const tabId = crypto.randomUUID()
  let hub: Hub | null = null
  let local: HubPort | null = null
  const remotes = new Map<string, HubPort>()
  let emit: (data: unknown) => void = () => {}

  channel.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { kind?: string; from?: string; to?: string; msg?: ClientMsg | ServerMsg } | null
    if (!data || !hub) {
      if (data?.kind === 'leader' && data.to === tabId) emit(data.msg)
      return
    }
    if (data.kind === 'follower' && data.from && data.from !== tabId && data.msg && data.msg && isClient(data.msg)) {
      let remote = remotes.get(data.from)
      if (!remote) {
        const from = data.from
        remote = hub.bind((out) => {
          channel.postMessage({ kind: 'leader', to: from, msg: out })
        })
        remotes.set(from, remote)
      }
      if (data.msg.type === 'bye') {
        remote.unbind()
        remotes.delete(data.from)
      }
      remote.push(data.msg)
    }
  })

  const paired = localChannel((message) => {
    if (local) {
      local.push(message)
      return
    }
    channel.postMessage({ kind: 'follower', from: tabId, msg: message })
  })
  emit = paired.emit

  let markLeader: () => void = () => {}
  const becameLeader = new Promise<void>((resolve) => {
    markLeader = resolve
  })
  const stopped = new Promise<void>((resolve) => {
    window.addEventListener('pagehide', () => resolve(), { once: true })
  })

  void navigator.locks.request('riot-hub-leader', async () => {
    hub = createBrowserHub(origin, 'leader')
    local = hub.bind((msg) => paired.emit(msg))
    markLeader()
    await hub.start()
    await stopped
    local.unbind()
    for (const remote of remotes.values()) remote.unbind()
    hub.stop()
  })

  const role = await Promise.race([
    becameLeader.then(() => 'leader' as const),
    wait(80).then(() => 'follower' as const),
  ])
  if (role === 'follower') {
    void becameLeader.then(() => paired.port.postMessage({ type: 'hello' }))
  }
  return finish(paired.port)
}

function isClient(value: ClientMsg | ServerMsg): value is ClientMsg {
  return value.type === 'hello' || value.type === 'bye' || value.type === 'pong' || value.type === 'online' || value.type === 'visibility' || value.type === 'http' || value.type === 'upload'
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
