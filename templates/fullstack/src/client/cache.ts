import type { TopicCache } from './hub';

const CACHE = 'api-topics-v1';

/**
 * GET topic bodies live here, not in the service worker. The shell cache and
 * the API cache are different names so a new app build does not wipe saved data.
 */
export function cacheStorageTopics(): TopicCache {
  return {
    async read(topic) {
      const cache = await caches.open(CACHE);
      const res = await cache.match(key(topic));
      if (!res) return undefined;
      return {
        version: Number(res.headers.get('x-version')),
        storedAt: Number(res.headers.get('x-stored-at')),
        data: await res.json(),
      };
    },
    async write(topic, value) {
      const cache = await caches.open(CACHE);
      await cache.put(
        key(topic),
        new Response(JSON.stringify(value.data), {
          headers: {
            'content-type': 'application/json',
            'x-version': String(value.version),
            'x-stored-at': String(value.storedAt),
          },
        }),
      );
    },
    async readCursor() {
      const cache = await caches.open(CACHE);
      const res = await cache.match(key('cursor'));
      if (!res) return 0;
      const json: unknown = await res.json();
      return json &&
        typeof json === 'object' &&
        'cursor' in json &&
        typeof json.cursor === 'number'
        ? json.cursor
        : 0;
    },
    async writeCursor(version) {
      const cache = await caches.open(CACHE);
      await cache.put(
        key('cursor'),
        new Response(JSON.stringify({ cursor: version }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  };
}

function key(topic: string): string {
  return `https://riot-hub.local/${topic}`;
}
