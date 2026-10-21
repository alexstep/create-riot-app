import { cacheStorageTopics } from './cache';
import { Hub, type HubOptions } from './hub';
import type { TransportName } from './protocol';
import { sseEvents } from './sse';
import { uploadWithProgress } from './upload';

export function createBrowserHub(
  origin: string,
  transport: TransportName,
  extra: Partial<HubOptions> = {},
): Hub {
  return new Hub({
    origin,
    transport,
    fetch: extra.fetch ?? globalThis.fetch.bind(globalThis),
    cache: extra.cache ?? cacheStorageTopics(),
    events:
      extra.events ??
      ((cursor, signal) => sseEvents(origin, cursor, signal, extra.fetch)),
    upload: extra.upload ?? ((input) => uploadWithProgress(input, extra.fetch)),
    now: extra.now,
    heartbeatMs: extra.heartbeatMs ?? 15_000,
  });
}
