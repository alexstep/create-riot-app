import { type Connection, createCaller, type PortLike } from './caller';
import type { ClientMsg } from './protocol';

export function finish(port: PortLike): Connection {
  const conn = createCaller(port);
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => conn.bye());
    window.addEventListener('online', () =>
      conn.post({ type: 'online', online: true }),
    );
    window.addEventListener('offline', () =>
      conn.post({ type: 'online', online: false }),
    );
    document.addEventListener('visibilitychange', () => {
      conn.post({
        type: 'visibility',
        visible: document.visibilityState === 'visible',
      });
    });
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      conn.post({ type: 'online', online: false });
    }
  }
  return conn;
}

export function localChannel(onSend: (msg: ClientMsg) => void): {
  port: PortLike;
  emit: (data: unknown) => void;
} {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    port: {
      start() {},
      addEventListener(_type, listener) {
        listeners.add(listener);
      },
      removeEventListener(_type, listener) {
        listeners.delete(listener);
      },
      postMessage(message) {
        onSend(message);
      },
    },
    emit(data) {
      const event = { data } as MessageEvent;
      for (const listener of listeners) listener(event);
    },
  };
}
