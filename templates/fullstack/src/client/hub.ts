import type { FileMeta, LiveEvent, Profile, User } from '../contract/schemas';
import { bytesBody } from './caller';
import type {
  ClientMsg,
  FetchLike,
  HttpResult,
  LogLine,
  ServerMsg,
  Snapshot,
  TopicView,
  TransportName,
} from './protocol';
import { nextDelay, SessionError } from './sse';
import {
  type UploadRequest,
  type UploadResponse,
  uploadWithProgress,
} from './upload';

export type TopicName = 'session' | 'profile' | 'uploads';

type Stored = { version: number; storedAt: number; data: unknown };

export type TopicCache = {
  read(topic: TopicName): Promise<Stored | undefined>;
  write(topic: TopicName, value: Stored): Promise<void>;
  readCursor(): Promise<number>;
  writeCursor(version: number): Promise<void>;
};

export type HubPort = {
  push: (msg: ClientMsg) => Promise<void>;
  unbind: () => void;
};

type Entry = {
  send: (msg: ServerMsg) => void;
  missed: number;
  waiting: boolean;
  seen: boolean;
};

const FRESH_MS = 30_000;

export type HubOptions = {
  origin: string;
  transport: TransportName;
  fetch: FetchLike;
  now?: () => number;
  cache?: TopicCache;
  events?: (cursor: number, signal: AbortSignal) => AsyncIterable<LiveEvent>;
  upload?: (input: UploadRequest) => Promise<UploadResponse>;
  heartbeatMs?: number;
};

export class Hub {
  private readonly origin: string;
  private readonly transport: TransportName;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly cache?: TopicCache;
  private readonly events?: HubOptions['events'];
  private readonly uploadImpl: (
    input: UploadRequest,
  ) => Promise<UploadResponse>;
  private readonly topics = new Map<TopicName, Stored>();
  private readonly entries = new Set<Entry>();
  private readonly inflight = new Map<string, Promise<HttpResult>>();
  private readonly lines: LogLine[] = [];
  private readonly waiters: Array<() => void> = [];
  private cursor = 0;
  private online = true;
  private reachable = true;
  private stopped = false;
  private lost = false;
  private eventsAbort = new AbortController();
  private heart: ReturnType<typeof setInterval> | null = null;

  constructor(opts: HubOptions) {
    this.origin = opts.origin;
    this.transport = opts.transport;
    this.fetchImpl = opts.fetch;
    this.now = opts.now ?? (() => Date.now());
    this.cache = opts.cache;
    this.events = opts.events;
    this.uploadImpl =
      opts.upload ?? ((input) => uploadWithProgress(input, opts.fetch));
    if (opts.heartbeatMs && opts.heartbeatMs > 0) {
      this.heart = setInterval(() => this.sweep(), opts.heartbeatMs);
    }
  }

  bind(send: (msg: ServerMsg) => void): HubPort {
    const entry: Entry = { send, missed: 0, waiting: false, seen: true };
    this.entries.add(entry);
    return {
      push: (msg) => this.onMessage(entry, msg),
      unbind: () => {
        this.entries.delete(entry);
      },
    };
  }

  async start(): Promise<void> {
    await this.hydrate();
    this.broadcast();
    if (!this.events) return;
    const resume = this.cursor;
    if (this.online) {
      try {
        await this.prefetch();
      } catch {
        this.markReachable(false);
      }
    }
    this.broadcast();
    void this.loopEvents(resume);
  }

  stop(): void {
    this.stopped = true;
    this.eventsAbort.abort();
    this.wake();
    if (this.heart) clearInterval(this.heart);
  }

  setOnline(online: boolean): void {
    this.online = online;
    this.wake();
    if (online) this.kickEvents();
    this.broadcast();
  }

  /** A real HTTP response or an open event stream sets this; a failed fetch clears it. */
  markReachable(reachable: boolean): void {
    if (this.reachable === reachable) return;
    this.reachable = reachable;
    this.broadcast();
  }

  setVisible(visible: boolean): void {
    if (!visible) return;
    void this.revalidateStale();
  }

  apply(event: LiveEvent): void {
    if (event.type === 'profile') {
      this.cursor = Math.max(this.cursor, event.version);
      if (!this.storeTopic('profile', event.version, event.profile)) return;
      this.addLog('EVENT', '/api/profile', 'event');
      this.broadcast();
      return;
    }
    if (event.type === 'uploads') {
      this.cursor = Math.max(this.cursor, event.version);
      if (!this.storeTopic('uploads', event.version, event.files)) return;
      this.addLog('EVENT', '/api/uploads', 'event');
      this.broadcast();
      return;
    }
    if (event.type === 'invalidate') {
      this.cursor = Math.max(this.cursor, event.version);
      void this.refetch(event.topics);
      return;
    }
    this.cursor = Math.max(this.cursor, event.version);
    void this.refetch(['profile', 'uploads']);
  }

  /** Test hook: drop ports that miss pings. */
  sweep(): void {
    for (const entry of [...this.entries]) {
      if (entry.waiting && !entry.seen) entry.missed += 1;
      if (entry.missed >= 2) {
        this.entries.delete(entry);
        continue;
      }
      entry.seen = false;
      entry.waiting = true;
      entry.send({ type: 'ping' });
    }
  }

  snapshot(): Snapshot {
    const profile = this.view<Profile>('profile');
    const uploads = this.view<FileMeta[]>('uploads');
    const session = this.view<User>('session');
    const times = [profile?.storedAt, uploads?.storedAt].filter(
      (value): value is number => value != null,
    );
    return {
      online: this.online,
      reachable: this.reachable,
      transport: this.transport,
      storedAt: times.length > 0 ? Math.max(...times) : null,
      session,
      profile,
      uploads,
      log: this.lines.slice(-20),
    };
  }

  private async onMessage(entry: Entry, msg: ClientMsg): Promise<void> {
    if (!this.entries.has(entry) && msg.type !== 'hello') return;
    if (msg.type === 'hello') {
      entry.send({ type: 'snapshot', state: this.snapshot() });
      return;
    }
    if (msg.type === 'bye') {
      this.entries.delete(entry);
      return;
    }
    if (msg.type === 'pong') {
      entry.seen = true;
      entry.missed = 0;
      return;
    }
    if (msg.type === 'online') {
      this.setOnline(msg.online);
      return;
    }
    if (msg.type === 'visibility') {
      this.setVisible(msg.visible);
      return;
    }
    if (msg.type === 'http') {
      try {
        const result = await this.request(
          msg.method,
          msg.url,
          msg.headers,
          msg.body,
        );
        if (!this.entries.has(entry)) return;
        entry.send({ type: 'http', id: msg.id, ...result });
      } catch (error) {
        if (!this.entries.has(entry)) return;
        entry.send({
          type: 'http-error',
          id: msg.id,
          message: error instanceof Error ? error.message : 'Request failed',
        });
      }
      return;
    }
    await this.receiveUpload(entry, msg);
  }

  private async request(
    method: string,
    url: string,
    headers: [string, string][],
    body: Uint8Array | null,
  ): Promise<HttpResult> {
    const parsed = new URL(url);
    this.assertAllowed(parsed, method);
    const topic = topicFor(parsed.pathname);
    if (!this.online) {
      if (method === 'GET' && topic) {
        const stored = this.topics.get(topic);
        if (stored) {
          this.addLog(method, parsed.pathname, 'cache');
          return this.fromStore(topic, stored);
        }
      }
      return offlineResult();
    }
    const key =
      method === 'GET'
        ? `GET ${parsed.pathname}`
        : `${method} ${parsed.pathname} ${hashBytes(body)}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    if (method === 'GET' && topic) {
      const stored = this.topics.get(topic);
      if (stored && this.now() - stored.storedAt < FRESH_MS) {
        this.addLog(method, parsed.pathname, 'cache');
        return this.fromStore(topic, stored);
      }
    }
    const pending = this.network(method, url, headers, body).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, pending);
    return pending;
  }

  private async network(
    method: string,
    url: string,
    headers: [string, string][],
    body: Uint8Array | null,
  ): Promise<HttpResult> {
    const result = await this.send(method, url, headers, body);
    if (result.status === 401) this.dropSession();
    this.broadcast();
    return result;
  }

  private async prefetch(): Promise<void> {
    await this.ensureSession();
    await this.fetchIfStale('/api/profile');
    await this.fetchIfStale('/api/uploads');
  }

  /** A worker restart within the fresh window reads Cache Storage and does not hit the network. */
  private async fetchIfStale(pathname: string): Promise<void> {
    const topic = topicFor(pathname);
    const stored = topic ? this.topics.get(topic) : undefined;
    if (stored && this.now() - stored.storedAt < FRESH_MS) return;
    await this.send('GET', new URL(pathname, this.origin).href, [], null);
  }

  private async ensureSession(): Promise<void> {
    const cached = this.topics.get('session');
    if (cached && this.now() - cached.storedAt < FRESH_MS) return;
    const result = await this.send(
      'GET',
      new URL('/api/session', this.origin).href,
      [],
      null,
    );
    if (result.status === 401) this.dropSession();
  }

  private dropSession(): void {
    this.topics.delete('session');
    this.topics.delete('profile');
    this.topics.delete('uploads');
    this.tellSessionLost();
    this.broadcast();
  }

  private async refetch(topics: Array<'profile' | 'uploads'>): Promise<void> {
    if (!this.online) return;
    for (const topic of topics) {
      await this.send(
        'GET',
        new URL(
          topic === 'profile' ? '/api/profile' : '/api/uploads',
          this.origin,
        ).href,
        [],
        null,
      );
    }
    this.broadcast();
  }

  private async revalidateStale(): Promise<void> {
    if (!this.online) return;
    let changed = false;
    for (const topic of ['profile', 'uploads'] as const) {
      const stored = this.topics.get(topic);
      if (stored && this.now() - stored.storedAt < FRESH_MS) continue;
      await this.send(
        'GET',
        new URL(
          topic === 'profile' ? '/api/profile' : '/api/uploads',
          this.origin,
        ).href,
        [],
        null,
      );
      changed = true;
    }
    if (changed) this.broadcast();
  }

  private async send(
    method: string,
    url: string,
    headers: [string, string][],
    body: Uint8Array | null,
  ): Promise<HttpResult> {
    this.addLog(method, new URL(url).pathname, 'network');
    try {
      const res = await this.fetchImpl(url, {
        method,
        headers: sanitize(headers, body != null),
        body: body ? bytesBody(body) : undefined,
        credentials: 'include',
      });
      const bytes = new Uint8Array(await res.arrayBuffer());
      const out = [...res.headers.entries()];
      await this.absorb(res.status, out, bytes);
      this.markReachable(true);
      return { status: res.status, headers: out, body: bytes };
    } catch {
      this.markReachable(false);
      if (!this.stopped) this.kickEvents();
      return unreachableResult();
    }
  }

  private async absorb(
    status: number,
    headers: [string, string][],
    body: Uint8Array,
  ): Promise<void> {
    const h = new Headers(headers);
    const cursor = Number(h.get('x-cursor'));
    if (Number.isFinite(cursor)) this.cursor = Math.max(this.cursor, cursor);
    if (status < 200 || status >= 300) return;
    const topic = h.get('x-topic');
    if (topic !== 'session' && topic !== 'profile' && topic !== 'uploads')
      return;
    const version = Number(h.get('x-version'));
    if (!Number.isFinite(version)) return;
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return;
    }
    this.storeTopic(topic, version, unwrap(topic, json));
  }

  private storeTopic(
    topic: TopicName,
    version: number,
    data: unknown,
  ): boolean {
    if (!topicDataOk(topic, data)) return false;
    const current = this.topics.get(topic);
    if (current && version <= current.version) return false;
    const stored: Stored = { version, storedAt: this.now(), data };
    this.topics.set(topic, stored);
    void this.cache?.write(topic, stored);
    void this.cache?.writeCursor(Math.max(this.cursor, version));
    return true;
  }

  private async receiveUpload(
    entry: Entry,
    msg: Extract<ClientMsg, { type: 'upload' }>,
  ): Promise<void> {
    if (!this.online) {
      entry.send({ type: 'http-error', id: msg.id, message: 'Offline' });
      return;
    }
    try {
      const parsed = new URL(msg.url);
      this.assertAllowed(parsed, 'POST');
      const result = await this.uploadImpl({
        url: msg.url,
        headers: msg.headers,
        fields: msg.fields,
        files: msg.files,
        onProgress: (loaded, total) => {
          if (this.entries.has(entry))
            entry.send({ type: 'progress', id: msg.id, loaded, total });
        },
      });
      this.markReachable(true);
      await this.absorb(result.status, result.headers, result.body);
      this.addLog('POST', parsed.pathname, 'network');
      this.broadcast();
      if (this.entries.has(entry))
        entry.send({ type: 'http', id: msg.id, ...result });
    } catch (error) {
      if (!this.entries.has(entry)) return;
      if (isClientBlock(error)) {
        entry.send({
          type: 'http-error',
          id: msg.id,
          message: error instanceof Error ? error.message : 'Upload failed',
        });
        return;
      }
      this.markReachable(false);
      if (!this.stopped) this.kickEvents();
      entry.send({ type: 'http', id: msg.id, ...unreachableResult() });
    }
  }

  private async loopEvents(startCursor: number): Promise<void> {
    if (!this.events) return;
    let cursor = startCursor;
    let attempt = 0;
    while (!this.stopped) {
      if (!this.online) {
        await this.sleep(300);
        continue;
      }
      const signal = this.eventsAbort.signal;
      try {
        for await (const event of this.events(cursor, signal)) {
          attempt = 0;
          this.markReachable(true);
          if (!isLiveEvent(event)) continue;
          this.apply(event);
          cursor = Math.max(cursor, event.version);
        }
        if (this.stopped || signal.aborted) {
          if (this.stopped) return;
          continue;
        }
        this.markReachable(false);
      } catch (error) {
        if (this.stopped || signal.aborted) {
          if (this.stopped) return;
          continue;
        }
        if (error instanceof SessionError) {
          this.markReachable(true);
          this.dropSession();
        } else {
          this.markReachable(false);
        }
      }
      await this.sleep(nextDelay(attempt));
      attempt += 1;
    }
  }

  private kickEvents(): void {
    this.eventsAbort.abort();
    this.eventsAbort = new AbortController();
  }

  private async hydrate(): Promise<void> {
    if (!this.cache) return;
    for (const topic of ['session', 'profile', 'uploads'] as const) {
      const stored = await this.cache.read(topic);
      if (!stored) continue;
      if (!topicDataOk(topic, stored.data)) continue;
      this.topics.set(topic, stored);
      this.cursor = Math.max(this.cursor, stored.version);
    }
    this.cursor = Math.max(this.cursor, await this.cache.readCursor());
  }

  private view<T>(topic: TopicName): TopicView<T> | null {
    const stored = this.topics.get(topic);
    if (!stored || !topicDataOk(topic, stored.data)) return null;
    return {
      data: stored.data as T,
      version: stored.version,
      storedAt: stored.storedAt,
    };
  }

  private fromStore(topic: TopicName, stored: Stored): HttpResult {
    const json =
      topic === 'session'
        ? { user: stored.data }
        : topic === 'uploads'
          ? { files: stored.data, version: stored.version }
          : stored.data;
    return {
      status: 200,
      headers: [
        ['content-type', 'application/json'],
        ['x-topic', topic],
        ['x-version', String(stored.version)],
        ['x-stored-at', String(stored.storedAt)],
        ['x-from-cache', '1'],
      ],
      body: new TextEncoder().encode(JSON.stringify(json)),
    };
  }

  private assertAllowed(url: URL, method: string): void {
    if (url.origin !== this.origin)
      throw new Error('Cross-origin request blocked');
    if (!url.pathname.startsWith('/api/'))
      throw new Error('Only /api requests are proxied');
    if (url.pathname === '/api/events')
      throw new Error('The event stream is owned by the hub');
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
      throw new Error('Method is not allowed');
  }

  private tellSessionLost(): void {
    if (this.lost) return;
    this.lost = true;
    for (const entry of this.entries) entry.send({ type: 'session-lost' });
  }

  private broadcast(): void {
    const state = this.snapshot();
    for (const entry of this.entries) entry.send({ type: 'snapshot', state });
  }

  private addLog(method: string, path: string, via: LogLine['via']): void {
    this.lines.push({ at: this.now(), method, path, via });
    if (this.lines.length > 40) this.lines.shift();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(finish), 1);
        resolve();
      }, ms);
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(finish);
    });
  }

  private wake(): void {
    const pending = this.waiters.splice(0);
    for (const finish of pending) finish();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function topicDataOk(topic: TopicName, data: unknown): boolean {
  if (topic === 'uploads') return Array.isArray(data);
  if (!isRecord(data)) return false;
  if (topic === 'session') return typeof data.id === 'string';
  return (
    typeof data.name === 'string' &&
    typeof data.email === 'string' &&
    typeof data.message === 'string'
  );
}

export function isLiveEvent(value: unknown): value is LiveEvent {
  if (!isRecord(value) || typeof value.version !== 'number') return false;
  if (value.type === 'resync') return true;
  if (value.type === 'invalidate') return Array.isArray(value.topics);
  if (value.type === 'uploads') return Array.isArray(value.files);
  if (value.type === 'profile') return topicDataOk('profile', value.profile);
  return false;
}

function topicFor(pathname: string): TopicName | null {
  if (pathname === '/api/session') return 'session';
  if (pathname === '/api/profile') return 'profile';
  if (pathname === '/api/uploads') return 'uploads';
  return null;
}

function unwrap(topic: TopicName, json: unknown): unknown {
  if (!json || typeof json !== 'object') return json;
  if (topic === 'session' && 'user' in json) return json.user;
  if (topic === 'uploads' && 'files' in json) return json.files;
  return json;
}

function offlineResult(): HttpResult {
  return {
    status: 503,
    headers: [['content-type', 'application/json']],
    body: new TextEncoder().encode(JSON.stringify({ error: 'Offline' })),
  };
}

function unreachableResult(): HttpResult {
  return {
    status: 503,
    headers: [['content-type', 'application/json']],
    body: new TextEncoder().encode(JSON.stringify({ error: 'Unreachable' })),
  };
}

function isClientBlock(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return (
    message === 'Cross-origin request blocked' ||
    message === 'Only /api requests are proxied' ||
    message === 'The event stream is owned by the hub' ||
    message === 'Method is not allowed'
  );
}

function sanitize(headers: [string, string][], hasBody: boolean): Headers {
  const hop = new Set([
    'host',
    'content-length',
    'connection',
    'transfer-encoding',
  ]);
  const out = new Headers();
  for (const [key, value] of headers) {
    const name = key.toLowerCase();
    if (hop.has(name)) continue;
    if (name === 'content-type' && !hasBody) continue;
    out.append(key, value);
  }
  return out;
}

function hashBytes(body: Uint8Array | null): string {
  if (!body) return '0';
  let hash = 2166136261;
  for (const byte of body) hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0).toString(16);
}

export function memoryCache(): TopicCache {
  const topics = new Map<TopicName, Stored>();
  let cursor = 0;
  return {
    async read(topic) {
      return topics.get(topic);
    },
    async write(topic, value) {
      topics.set(topic, value);
    },
    async readCursor() {
      return cursor;
    },
    async writeCursor(version) {
      cursor = version;
    },
  };
}
