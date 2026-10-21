import type { FileMeta, Profile, User } from '../contract/schemas';

/** fetch() without the Bun-only preconnect field, so tests can pass a plain function. */
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type TransportName = 'shared-worker' | 'leader' | 'solo';

export type LogLine = {
  at: number;
  method: string;
  path: string;
  via: 'network' | 'cache' | 'event';
};

export type TopicView<T> = {
  data: T;
  version: number;
  storedAt: number;
};

/** What every tab renders. The hub is the only thing that fills this in. */
export type Snapshot = {
  online: boolean;
  transport: TransportName;
  storedAt: number | null;
  session: TopicView<User> | null;
  profile: TopicView<Profile> | null;
  uploads: TopicView<FileMeta[]> | null;
  log: LogLine[];
};

export type UploadPart = {
  field: string;
  filename: string;
  type: string;
  buffer: ArrayBuffer;
};

export type ClientMsg =
  | { type: 'hello' }
  | { type: 'bye' }
  | { type: 'pong' }
  | { type: 'online'; online: boolean }
  | { type: 'visibility'; visible: boolean }
  | {
      type: 'http';
      id: string;
      method: string;
      url: string;
      headers: [string, string][];
      body: Uint8Array | null;
    }
  | {
      type: 'upload';
      id: string;
      url: string;
      headers: [string, string][];
      fields: Record<string, string>;
      files: UploadPart[];
    };

export type HttpResult = {
  status: number;
  headers: [string, string][];
  body: Uint8Array;
};

export type ServerMsg =
  | { type: 'snapshot'; state: Snapshot }
  | ({ type: 'http'; id: string } & HttpResult)
  | { type: 'http-error'; id: string; message: string }
  | { type: 'progress'; id: string; loaded: number; total: number }
  | { type: 'ping' }
  | { type: 'session-lost' };
