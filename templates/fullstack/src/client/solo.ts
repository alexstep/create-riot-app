import { createBrowserHub } from './browser-hub';
import type { ClientMsg } from './protocol';
import { finish } from './wire';

/** Last resort: this tab is its own hub. Other tabs do not share its requests. */
export function connectSolo(origin: string) {
  const hub = createBrowserHub(origin, 'solo');
  const listeners = new Set<(event: MessageEvent) => void>();
  const local = hub.bind((msg) => {
    const event = { data: msg } as MessageEvent;
    for (const listener of listeners) listener(event);
  });
  void hub.start();
  window.addEventListener('pagehide', () => hub.stop(), { once: true });
  return finish({
    start() {},
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    postMessage(message: ClientMsg) {
      local.push(message);
    },
  });
}
