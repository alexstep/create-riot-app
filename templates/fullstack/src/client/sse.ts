import type { LiveEvent } from '../contract/schemas';
import type { FetchLike } from './protocol';

export function nextDelay(attempt: number, rand = Math.random()): number {
  const step = Math.max(0, attempt);
  const base = Math.min(500 * 2 ** step, 10_000);
  return Math.round(base * (0.5 + rand * 0.5));
}

function isEvent(value: unknown): value is LiveEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as {
    type?: string;
    version?: unknown;
    profile?: unknown;
    files?: unknown;
    topics?: unknown;
  };
  if (typeof event.version !== 'number') return false;
  if (event.type === 'resync') return true;
  if (event.type === 'invalidate') return Array.isArray(event.topics);
  if (event.type === 'uploads') return Array.isArray(event.files);
  if (event.type === 'profile') {
    const profile = event.profile;
    return (
      !!profile &&
      typeof profile === 'object' &&
      typeof (profile as { name?: unknown }).name === 'string'
    );
  }
  return false;
}

export class SessionError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'SessionError';
  }
}

/** Incremental SSE parser. Ignores comments and frames that are not a LiveEvent. */
export class SseParser {
  private buffer = '';

  push(chunk: string): LiveEvent[] {
    this.buffer += chunk;
    const events: LiveEvent[] = [];
    while (true) {
      const split = this.buffer.indexOf('\n\n');
      if (split < 0) break;
      const raw = this.buffer.slice(0, split);
      this.buffer = this.buffer.slice(split + 2);
      const event = parseFrame(raw);
      if (event) events.push(event);
    }
    return events;
  }
}

export function parseFrame(raw: string): LiveEvent | null {
  const data: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length === 0) return null;
  try {
    const json: unknown = JSON.parse(data.join('\n'));
    return isEvent(json) ? json : null;
  } catch {
    return null;
  }
}

export async function* sseEvents(
  origin: string,
  cursor: number,
  signal: AbortSignal,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
): AsyncGenerator<LiveEvent> {
  const res = await fetchImpl(new URL('/api/events', origin), {
    headers: { accept: 'text/event-stream', 'last-event-id': String(cursor) },
    signal,
    credentials: 'include',
  });
  if (res.status === 401) throw new SessionError();
  if (!res.ok || !res.body)
    throw new Error(`Event stream failed (${res.status})`);
  const parser = new SseParser();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true })))
        yield event;
    }
  } finally {
    reader.releaseLock();
  }
}
