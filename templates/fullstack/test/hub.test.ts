import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server/app';
import { parseEnv } from '../src/server/env';

const env = parseEnv({
  SESSION_SECRET: 'test-session-secret-value',
  DEMO_PASSWORD: 'demo',
  NODE_ENV: 'test',
  PORT: '3000',
});

import { createClient } from '../src/client/api';
import { shouldHandle, strategy } from '../src/client/cache-policy';
import { createCaller } from '../src/client/caller';
import { Hub, memoryCache } from '../src/client/hub';
import type { FetchLike, HttpResult, ServerMsg } from '../src/client/protocol';
import { nextDelay, parseFrame, SseParser, sseEvents } from '../src/client/sse';

const origin = 'http://app.local';

test('backoff grows and stays bounded without a retry cap', () => {
  expect(nextDelay(0, 0)).toBe(250);
  expect(nextDelay(1, 1)).toBe(1000);
  expect(nextDelay(20, 1)).toBe(10_000);
});

test('sse parser ignores comments and accepts a live event', () => {
  const parser = new SseParser();
  expect(parser.push(': ready\n\n')).toEqual([]);
  const chunk = parser.push(
    'id: 2\ndata: {"type":"profile","version":2,"profile":{"name":"Ada","email":"ada@example.com","message":"Hi","updatedAt":1,"version":2}}\n\n',
  );
  expect(chunk[0]?.type).toBe('profile');
  expect(parseFrame('data: {not json}\n\n'.replace('\n\n', ''))).toBeNull();
});

test('service worker ignores api, mutations, and other origins', () => {
  expect(shouldHandle('POST', 'http://app.local/index.html', origin)).toBe(
    false,
  );
  expect(shouldHandle('GET', 'http://app.local/api/profile', origin)).toBe(
    false,
  );
  expect(shouldHandle('GET', 'https://cdn.example/app.js', origin)).toBe(false);
  expect(shouldHandle('GET', 'http://app.local/assets/a.js', origin)).toBe(
    true,
  );
  expect(strategy('/', 'navigate')).toBe('network-first');
  expect(strategy('/assets/a.js', 'no-cors')).toBe('cache-first');
});

test('typed client path matches the server base path', () => {
  const client = createClient(origin, fetch);
  expect(client.api.profile.$url().pathname).toBe('/api/profile');
  expect(client.api.uploads.$url().pathname).toBe('/api/uploads');
  expect(new URL(client.api.uploads.$url()).pathname).toBe('/api/uploads');
});

test('caller rejects with the hub error and clears the timeout', async () => {
  const fake = fakePort();
  const conn = createCaller(fake.port, 50);
  const pending = conn.fetch('http://app.local/api/profile');
  const sent = fake.sent.find((msg) => msg.type === 'http');
  if (sent?.type !== 'http') throw new Error('missing http call');
  fake.reply({ type: 'http-error', id: sent.id, message: 'boom' });
  await expect(pending).rejects.toThrow('boom');
  fake.reply({
    type: 'http',
    id: sent.id,
    status: 200,
    headers: [],
    body: new Uint8Array(),
  });
});

test('two tabs share one GET, a new tab does not refetch, and an event updates both', async () => {
  let profileHits = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hub = new Hub({
    origin,
    transport: 'shared-worker',
    cache: memoryCache(),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (
        url.pathname === '/api/profile' &&
        (init?.method ?? 'GET') === 'GET'
      ) {
        profileHits += 1;
        await gate;
      }
      return jsonResponse(url.pathname, init?.method ?? 'GET');
    },
  });
  const a = collect();
  const b = collect();
  const portA = hub.bind(a.push);
  const portB = hub.bind(b.push);
  const pendingA = portA.push(http('GET', '/api/profile', '1'));
  const pendingB = portA.push(http('GET', '/api/profile', '2'));
  await Promise.resolve();
  expect(profileHits).toBe(1);
  release();
  await pendingA;
  await pendingB;
  expect(a.messages.filter((msg) => msg.type === 'http')).toHaveLength(2);

  const before = profileHits;
  portB.push({ type: 'hello' });
  expect(profileHits).toBe(before);

  hub.apply({
    type: 'profile',
    version: 4,
    profile: {
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hi',
      updatedAt: 1,
      version: 4,
    },
  });
  expect(
    a.messages.some(
      (msg) =>
        msg.type === 'snapshot' && msg.state.profile?.data.name === 'Ada',
    ),
  ).toBe(true);
  expect(
    b.messages.some(
      (msg) =>
        msg.type === 'snapshot' && msg.state.profile?.data.name === 'Ada',
    ),
  ).toBe(true);
  const logs = a.messages.filter((msg) => msg.type === 'snapshot').at(-1);
  expect(
    logs?.type === 'snapshot' &&
      logs.state.log.some((line) => line.via === 'event'),
  ).toBe(true);

  hub.apply({
    type: 'profile',
    version: 4,
    profile: {
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hi',
      updatedAt: 1,
      version: 4,
    },
  });
  const count = a.messages.length;
  hub.apply({
    type: 'profile',
    version: 3,
    profile: {
      name: 'Old',
      email: 'ada@example.com',
      message: 'Hi',
      updatedAt: 1,
      version: 3,
    },
  });
  expect(a.messages.length).toBe(count);

  portB.push({ type: 'bye' });
  hub.apply({
    type: 'profile',
    version: 5,
    profile: {
      name: 'Grace',
      email: 'grace@example.com',
      message: 'Hi',
      updatedAt: 2,
      version: 5,
    },
  });
  expect(
    b.messages.some(
      (msg) =>
        msg.type === 'snapshot' && msg.state.profile?.data.name === 'Grace',
    ),
  ).toBe(false);
  hub.stop();
});

test('offline GET is the cached response and offline writes fail', async () => {
  const hub = new Hub({
    origin,
    transport: 'shared-worker',
    now: () => 1_000,
    fetch: async (input, init) =>
      jsonResponse(new URL(String(input)).pathname, init?.method ?? 'GET'),
  });
  const tab = collect();
  const port = hub.bind(tab.push);
  await port.push(http('GET', '/api/profile', '1'));
  hub.setOnline(false);
  const calls = tab.network;
  await port.push(http('GET', '/api/profile', '2'));
  await port.push(http('PUT', '/api/profile', '3'));
  const cached = httpResult(tab, '2');
  const denied = httpResult(tab, '3');
  expect(cached?.status).toBe(200);
  expect(cached?.headers.some(([key]) => key === 'x-from-cache')).toBe(true);
  expect(denied?.status).toBe(503);
  expect(tab.network).toBe(calls);
  const snap = tab.messages.filter((msg) => msg.type === 'snapshot').at(-1);
  expect(snap?.type === 'snapshot' && snap.state.online).toBe(false);
  hub.stop();
});

test('a 401 logs the hub out and does not create a session', async () => {
  let posts = 0;
  const hub = new Hub({
    origin,
    transport: 'shared-worker',
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.pathname === '/api/session') posts += 1;
      if (url.pathname === '/api/profile')
        return new Response('no', { status: 401 });
      return jsonResponse(url.pathname, method);
    },
  });
  const tab = collect();
  const port = hub.bind(tab.push);
  await Promise.all([
    port.push(http('GET', '/api/profile', '1')),
    port.push(http('GET', '/api/profile', '2')),
  ]);
  expect(posts).toBe(0);
  expect(tab.messages.some((msg) => msg.type === 'session-lost')).toBe(true);
  const snap = tab.messages.filter((msg) => msg.type === 'snapshot').at(-1);
  expect(snap?.type === 'snapshot' && snap.state.session).toBeNull();

  hub.stop();
});

test('a failed fetch is unreachable and the next response clears it', async () => {
  let down = true;
  const hub = new Hub({
    origin,
    transport: 'shared-worker',
    fetch: async (input, init) => {
      if (down) throw new TypeError('Failed to fetch');
      return jsonResponse(
        new URL(String(input)).pathname,
        init?.method ?? 'GET',
      );
    },
  });
  const tab = collect();
  const port = hub.bind(tab.push);
  await port.push(http('GET', '/api/profile', '1'));
  expect(httpResult(tab, '1')?.status).toBe(503);
  expect(hub.snapshot().reachable).toBe(false);
  expect(tab.messages.some((msg) => msg.type === 'http-error')).toBe(false);
  expect(tab.messages.some((msg) => msg.type === 'session-lost')).toBe(false);
  down = false;
  await port.push(http('GET', '/api/profile', '2'));
  expect(httpResult(tab, '2')?.status).toBe(200);
  expect(hub.snapshot().reachable).toBe(true);
  hub.stop();
});

test('a failed event stream marks the server unreachable', async () => {
  const hub = new Hub({
    origin,
    transport: 'shared-worker',
    fetch: async (input, init) =>
      jsonResponse(new URL(String(input)).pathname, init?.method ?? 'GET'),
    events: () => ({
      [Symbol.asyncIterator]() {
        return {
          next: () => Promise.reject(new TypeError('Failed to fetch')),
        };
      },
    }),
  });
  hub.bind(collect().push);
  await hub.start();
  await waitFor(() => hub.snapshot().reachable === false);
  hub.stop();
});

test('a warm cache does not repeat session or topic requests', async () => {
  const cache = memoryCache();
  const now = 5_000;
  await cache.write('session', {
    version: 1,
    storedAt: now,
    data: { id: 'demo' },
  });
  await cache.write('profile', {
    version: 2,
    storedAt: now,
    data: {
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hi',
      updatedAt: 1,
      version: 2,
    },
  });
  await cache.write('uploads', { version: 0, storedAt: now, data: [] });
  const calls: string[] = [];
  const hub = new Hub({
    origin,
    transport: 'shared-worker',
    now: () => now + 10,
    cache,
    events: async function* () {},
    fetch: async (input, init) => {
      const url = new URL(String(input));
      calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
      return jsonResponse(url.pathname, init?.method ?? 'GET');
    },
  });
  await hub.start();
  expect(calls).toEqual([]);
  const tab = collect();
  hub.bind(tab.push);
  tab.messages.length = 0;
  hub.bind(tab.push).push({ type: 'hello' });
  expect(calls).toEqual([]);
  const snap = tab.messages.find((msg) => msg.type === 'snapshot');
  expect(snap?.type === 'snapshot' && snap.state.profile?.data.name).toBe(
    'Ada',
  );
  hub.stop();
});

test('the hub applies a server event without another GET', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'riot-hub-'));
  const app = createApp(env, { uploadDir: dir });
  const bridge = bridgeFetch(app);
  const logged = await app.request('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ada@example.com', password: 'demo' }),
  });
  const id = /session=([^;]+)/.exec(
    logged.headers.get('set-cookie') ?? '',
  )?.[1];
  if (!id) throw new Error('missing session');
  bridge.prime(`session=${id}`);
  const hub = new Hub({
    origin,
    transport: 'shared-worker',
    cache: memoryCache(),
    fetch: bridge.fetch,
    events: (cursor, signal) => sseEvents(origin, cursor, signal, bridge.fetch),
  });
  const first = collect();
  const second = collect();
  hub.bind(first.push);
  await hub.start();
  hub.bind(second.push);
  second.messages.length = 0;
  const sessionCalls = bridge.calls.filter((line) =>
    line.endsWith('/api/session'),
  );
  hub.bind(collect().push);
  expect(bridge.calls.filter((line) => line.endsWith('/api/session'))).toEqual(
    sessionCalls,
  );

  await waitFor(() =>
    bridge.calls.some((line) => line.startsWith('GET /api/events')),
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  await app.request('/api/profile', {
    method: 'PUT',
    headers: { cookie: bridge.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Grace',
      email: 'grace@example.com',
      message: 'Live',
    }),
  });
  await waitFor(() =>
    first.messages.some(
      (msg) =>
        msg.type === 'snapshot' && msg.state.profile?.data.name === 'Grace',
    ),
  );
  await waitFor(() =>
    second.messages.some(
      (msg) =>
        msg.type === 'snapshot' && msg.state.profile?.data.name === 'Grace',
    ),
  );
  const getsAfter = bridge.calls.filter(
    (line) => line === 'GET /api/profile',
  ).length;
  expect(getsAfter).toBeLessThanOrEqual(1);
  hub.stop();
});

function http(method: string, pathname: string, id: string) {
  return {
    type: 'http' as const,
    id,
    method,
    url: `${origin}${pathname}`,
    headers: [] as [string, string][],
    body: null,
  };
}

function collect() {
  const messages: ServerMsg[] = [];
  let network = 0;
  return {
    messages,
    get network() {
      return network;
    },
    push(msg: ServerMsg) {
      messages.push(msg);
      if (msg.type === 'snapshot') {
        network = msg.state.log.filter((line) => line.via === 'network').length;
      }
    },
  };
}

function httpResult(
  tab: { messages: ServerMsg[] },
  id: string,
): HttpResult | undefined {
  const msg = tab.messages.find(
    (item) => item.type === 'http' && item.id === id,
  );
  return msg && msg.type === 'http' ? msg : undefined;
}

function jsonResponse(pathname: string, method: string): Response {
  if (pathname === '/api/session') {
    return new Response(JSON.stringify({ user: { id: 'demo' } }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-topic': 'session',
        'x-version': '1',
        'x-cursor': '1',
      },
    });
  }
  if (pathname === '/api/profile' && method === 'GET') {
    return new Response(
      JSON.stringify({
        name: 'Ada',
        email: 'ada@example.com',
        message: 'Hi',
        updatedAt: 1,
        version: 2,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-topic': 'profile',
          'x-version': '2',
          'x-cursor': '2',
        },
      },
    );
  }
  if (pathname === '/api/uploads') {
    return new Response(JSON.stringify({ files: [], version: 0 }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-topic': 'uploads',
        'x-version': '0',
        'x-cursor': '2',
      },
    });
  }
  return new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fakePort() {
  let handler: ((event: MessageEvent) => void) | null = null;
  const sent: import('../src/client/protocol').ClientMsg[] = [];
  return {
    sent,
    port: {
      start() {},
      addEventListener(
        _type: 'message',
        listener: (event: MessageEvent) => void,
      ) {
        handler = listener;
      },
      removeEventListener() {
        handler = null;
      },
      postMessage(message: import('../src/client/protocol').ClientMsg) {
        sent.push(message);
      },
    },
    reply(msg: ServerMsg) {
      handler?.({ data: msg } as MessageEvent);
    },
  };
}

function bridgeFetch(app: Awaited<ReturnType<typeof createApp>>) {
  const calls: string[] = [];
  let cookie = '';
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    const headers = new Headers(init?.headers);
    if (cookie) headers.set('cookie', cookie);
    const res = await app.request(`${url.pathname}${url.search}`, {
      method,
      headers,
      body: init?.body ?? undefined,
    });
    const set = res.headers.get('set-cookie');
    const sid = /session=([^;]+)/.exec(set ?? '')?.[1];
    if (sid) cookie = `session=${sid}`;
    return res;
  };
  return {
    fetch,
    calls,
    prime(value: string) {
      cookie = value;
    },
    get cookie() {
      return cookie;
    },
  };
}

async function waitFor(check: () => boolean): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > 1000)
      throw new Error('timed out waiting for the hub');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
