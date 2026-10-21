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
  let opened: (() => void) | undefined;
  const hub = new Hub({
    origin,
    transport,
    fetch: extra.fetch ?? globalThis.fetch.bind(globalThis),
    cache: extra.cache ?? cacheStorageTopics(),
    events:
      extra.events ??
      ((cursor, signal) =>
        sseEvents(origin, cursor, signal, extra.fetch, () => opened?.())),
    upload: extra.upload ?? ((input) => uploadWithProgress(input, extra.fetch)),
    now: extra.now,
    heartbeatMs: extra.heartbeatMs ?? 15_000,
  });
  opened = () => hub.markReachable(true);
  return hub;
}
