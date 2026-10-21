import type { LiveEvent } from '../contract/schemas';

/**
 * One monotonic cursor per app instance. SSE clients resume with Last-Event-ID.
 * The buffer is a ring: if a client falls behind it, the hub is told to resync
 * from the current HTTP state instead of replaying a hole.
 */
export class EventBus {
  private seq = 0;
  private events: LiveEvent[] = [];
  private listeners = new Set<(event: LiveEvent) => void>();

  constructor(private readonly limit = 100) {}

  current(): number {
    return this.seq;
  }

  publish(draft: LiveEvent): LiveEvent {
    const version = ++this.seq;
    const event = stamp(draft, version);
    this.events.push(event);
    if (this.events.length > this.limit) this.events.shift();
    for (const listener of this.listeners) listener(event);
    return event;
  }

  /** Events with version greater than cursor, in order. */
  replay(cursor: number): LiveEvent[] {
    return this.events.filter((event) => event.version > cursor);
  }

  /**
   * True when the buffer no longer contains the event immediately after cursor,
   * so a resume would skip history. Cursor 0 means "I have no cursor yet".
   */
  gap(cursor: number): boolean {
    if (cursor <= 0) return false;
    const oldest = this.events[0]?.version;
    if (oldest == null) return cursor < this.seq;
    return oldest > cursor + 1;
  }

  subscribe(listener: (event: LiveEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

function stamp(draft: LiveEvent, version: number): LiveEvent {
  switch (draft.type) {
    case 'profile':
      return {
        type: 'profile',
        version,
        profile: { ...draft.profile, version },
      };
    case 'uploads':
      return { type: 'uploads', version, files: draft.files };
    case 'invalidate':
      return { type: 'invalidate', version, topics: draft.topics };
    case 'resync':
      return { type: 'resync', version };
  }
}
