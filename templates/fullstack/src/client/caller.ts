import { bytesBody } from './bytes';
import type {
  ClientMsg,
  FetchLike,
  HttpResult,
  ServerMsg,
  Snapshot,
  UploadPart,
} from './protocol';

export type PortLike = {
  postMessage(message: ClientMsg, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
  ): void;
  start(): void;
};

type Pending = {
  resolve: (result: HttpResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  onProgress?: (progress: { loaded: number; total: number }) => void;
};

export type Connection = {
  fetch: FetchLike;
  upload: (
    url: string,
    files: UploadPart[],
    onProgress?: (progress: { loaded: number; total: number }) => void,
  ) => Promise<HttpResult>;
  subscribe: (listener: (state: Snapshot) => void) => () => void;
  onSessionLost: (listener: () => void) => () => void;
  post: (msg: ClientMsg) => void;
  bye: () => void;
};

/**
 * One listener for every in-flight call. Ids are UUIDs. Failures reject;
 * they are not left to look like timeouts. The timer is cleared when the
 * hub answers.
 */
export function createCaller(port: PortLike, timeoutMs = 20_000): Connection {
  const pending = new Map<string, Pending>();
  const snapshots = new Set<(state: Snapshot) => void>();
  const lost = new Set<() => void>();

  const onMessage = (event: MessageEvent) => {
    const msg = event.data as ServerMsg | undefined;
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
    if (msg.type === 'snapshot') {
      for (const listener of snapshots) listener(msg.state);
      return;
    }
    if (msg.type === 'ping') {
      port.postMessage({ type: 'pong' });
      return;
    }
    if (msg.type === 'session-lost') {
      for (const listener of lost) listener();
      return;
    }
    if (msg.type === 'progress') {
      pending
        .get(msg.id)
        ?.onProgress?.({ loaded: msg.loaded, total: msg.total });
      return;
    }
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    pending.delete(msg.id);
    if (msg.type === 'http-error') waiter.reject(new Error(msg.message));
    else if (msg.type === 'http') waiter.resolve(msg);
  };

  port.addEventListener('message', onMessage);
  port.start();

  function call(
    message: ClientMsg & { id: string },
    onProgress?: Pending['onProgress'],
    timeout = timeoutMs,
  ) {
    return new Promise<HttpResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(message.id);
        reject(new Error('timeout'));
      }, timeout);
      pending.set(message.id, { resolve, reject, timer, onProgress });
      const transfer =
        message.type === 'upload'
          ? message.files.map((file) => file.buffer)
          : undefined;
      port.postMessage(message, transfer);
    });
  }

  const fetchImpl: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? null
        : new Uint8Array(await request.arrayBuffer());
    const result = await call({
      type: 'http',
      id: crypto.randomUUID(),
      method: request.method,
      url: request.url,
      headers: [...request.headers.entries()],
      body,
    });
    return new Response(bytesBody(result.body), {
      status: result.status,
      headers: result.headers,
    });
  };

  port.postMessage({ type: 'hello' });

  return {
    fetch: fetchImpl,
    upload: (url, files, onProgress) =>
      call(
        {
          type: 'upload',
          id: crypto.randomUUID(),
          url,
          headers: [],
          fields: {},
          files,
        },
        onProgress,
        120_000,
      ),
    subscribe(listener) {
      snapshots.add(listener);
      return () => snapshots.delete(listener);
    },
    onSessionLost(listener) {
      lost.add(listener);
      return () => lost.delete(listener);
    },
    post(msg) {
      port.postMessage(msg);
    },
    bye() {
      port.postMessage({ type: 'bye' });
    },
  };
}
