import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  ALLOWED_TYPES,
  ErrorBodySchema,
  FileListSchema,
  LiveEventSchema,
  MAX_BODY_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  mediaType,
  type Profile,
  ProfileInputSchema,
  ProfileSchema,
  SessionSchema,
} from '../contract/schemas';
import { EventBus } from '../server/bus';
import type { AppEnv } from '../server/env';
import { contentDisposition, matchesType, UploadStore } from '../server/files';
import { csrfOk } from '../server/security';
import {
  createSessionStore,
  type SessionStore,
  type SessionUser,
  sessionIdFrom,
} from './session';

const FilePartSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, 'File is empty')
  .refine((file) => file.size <= MAX_FILE_BYTES, 'File exceeds 256 KB')
  .refine(
    (file) =>
      (ALLOWED_TYPES as readonly string[]).includes(mediaType(file.type)),
    'Unsupported file type',
  )
  .openapi({ type: 'string', format: 'binary' });

const UploadFormSchema = z
  .object({
    files: z.preprocess(
      (value) => {
        if (value == null) return [];
        return Array.isArray(value) ? value : [value];
      },
      z
        .array(FilePartSchema)
        .min(1, 'Choose at least one file')
        .max(MAX_FILES, 'Too many files'),
    ),
  })
  .openapi('UploadForm');

type ItemRecord = { id: string; title: string };

type UserRecord = {
  profile: Profile | null;
  items: ItemRecord[];
  uploads: UploadStore;
  bus: EventBus;
};

type AppStore = {
  env: AppEnv;
  sessions: SessionStore;
  contacts: { id: string; email: string; message: string }[];
  users: Map<string, UserRecord>;
  uploadRoot: string;
};

const state: { current?: AppStore } = {};

export function attachLive(env: AppEnv, uploadDir: string): AppStore {
  const current: AppStore = {
    env,
    sessions: createSessionStore(),
    contacts: [],
    users: new Map(),
    uploadRoot: uploadDir,
  };
  state.current = current;
  return current;
}

export function storeDeps(): AppStore {
  if (!state.current) throw new Error('API state is not attached');
  return state.current;
}

function live(): AppStore {
  return storeDeps();
}

function userKey(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 24);
}

function record(email: string): UserRecord {
  const current = live();
  const found = current.users.get(email);
  if (found) return found;
  const created: UserRecord = {
    profile: null,
    items: [],
    uploads: new UploadStore(resolve(current.uploadRoot, userKey(email))),
    bus: new EventBus(),
  };
  current.users.set(email, created);
  return created;
}

export function itemsOf(email: string): ItemRecord[] {
  return record(email).items;
}

function userOf(c: Context): SessionUser | null {
  const current = live();
  return current.sessions.read(sessionIdFrom(c, current.env.SESSION_SECRET));
}

function mark(
  c: Context,
  data: UserRecord | null,
  topic?: string,
  version?: number,
): void {
  c.header('X-Cursor', String(data?.bus.current() ?? 0));
  if (topic) c.header('X-Topic', topic);
  if (version != null) c.header('X-Version', String(version));
}

function blocked(c: Context) {
  if (!csrfOk(c)) {
    mark(c, null);
    return c.json({ error: 'Cross-site request blocked' }, 403);
  }
  return null;
}

export const sessionGet = createRoute({
  method: 'get',
  path: '/session',
  tags: ['session'],
  responses: {
    200: {
      description: 'Session',
      content: { 'application/json': { schema: SessionSchema } },
    },
    401: {
      description: 'No session',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export const profileGet = createRoute({
  method: 'get',
  path: '/profile',
  tags: ['profile'],
  responses: {
    200: {
      description: 'Profile',
      content: { 'application/json': { schema: ProfileSchema } },
    },
    401: {
      description: 'No session',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    404: {
      description: 'Not saved yet',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export const profilePut = createRoute({
  method: 'put',
  path: '/profile',
  tags: ['profile'],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ProfileInputSchema } },
    },
  },
  responses: {
    200: {
      description: 'Saved profile',
      content: { 'application/json': { schema: ProfileSchema } },
    },
    400: {
      description: 'Invalid profile',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    401: {
      description: 'No session',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    403: {
      description: 'CSRF',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export const uploadPost = createRoute({
  method: 'post',
  path: '/uploads',
  tags: ['uploads'],
  request: {
    body: {
      required: true,
      content: { 'multipart/form-data': { schema: UploadFormSchema } },
    },
  },
  responses: {
    201: {
      description: 'Stored files',
      content: { 'application/json': { schema: FileListSchema } },
    },
    400: {
      description: 'Invalid upload',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    401: {
      description: 'No session',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    403: {
      description: 'CSRF',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    413: {
      description: 'Body too large',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export const uploadList = createRoute({
  method: 'get',
  path: '/uploads',
  tags: ['uploads'],
  responses: {
    200: {
      description: 'Files',
      content: { 'application/json': { schema: FileListSchema } },
    },
    401: {
      description: 'No session',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export const uploadGet = createRoute({
  method: 'get',
  path: '/uploads/{id}',
  tags: ['uploads'],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      description: 'File bytes',
      content: {
        'application/octet-stream': {
          schema: z.string().openapi({ format: 'binary' }),
        },
      },
    },
    401: {
      description: 'No session',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    404: {
      description: 'Missing',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export const eventsRoute = createRoute({
  method: 'get',
  path: '/events',
  tags: ['live'],
  responses: {
    200: {
      description: 'Event stream',
      content: { 'text/event-stream': { schema: LiveEventSchema } },
    },
    401: {
      description: 'No session',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export function handleSessionGet(c: Context) {
  const user = userOf(c);
  if (!user) {
    mark(c, null);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const data = record(user.email);
  mark(c, data, 'session', data.bus.current());
  return c.json({ user: { id: user.email } }, 200);
}

export function handleProfileGet(c: Context) {
  const user = userOf(c);
  if (!user) {
    mark(c, null);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const data = record(user.email);
  if (!data.profile) {
    mark(c, data);
    return c.json({ error: 'No profile yet' }, 404);
  }
  mark(c, data, 'profile', data.profile.version);
  return c.json(data.profile, 200);
}

export async function handleProfilePut(c: Context) {
  const denied = blocked(c);
  if (denied) return denied;
  const user = userOf(c);
  if (!user) {
    mark(c, null);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const input = ProfileInputSchema.parse(await c.req.json());
  const data = record(user.email);
  const event = data.bus.publish({
    type: 'profile',
    version: 0,
    profile: { ...input, updatedAt: Date.now(), version: 0 },
  });
  if (event.type !== 'profile') throw new Error('Expected a profile event');
  data.profile = event.profile;
  mark(c, data, 'profile', event.version);
  return c.json(event.profile, 200);
}

export async function handleUploadPost(c: Context) {
  const length = Number(c.req.header('content-length') ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return c.json(
      {
        error: 'Upload is too large',
        fields: { files: ['Upload is too large'] },
      },
      413,
    );
  }
  const denied = blocked(c);
  if (denied) return denied;
  const user = userOf(c);
  if (!user) {
    mark(c, null);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const data = record(user.email);
  const { files } = UploadFormSchema.parse(
    await c.req.parseBody({ all: true }),
  );
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesType(bytes, mediaType(file.type))) {
      mark(c, data);
      return c.json(
        {
          error: 'File contents do not match its type',
          fields: { files: ['File contents do not match its type'] },
        },
        400,
      );
    }
  }
  for (const file of files) {
    const result = await data.uploads.save(file);
    if ('error' in result) {
      mark(c, data);
      return c.json(
        { error: result.error, fields: { files: [result.error] } },
        400,
      );
    }
  }
  const event = data.bus.publish({
    type: 'uploads',
    version: 0,
    files: data.uploads.files,
  });
  data.uploads.version = event.version;
  mark(c, data, 'uploads', event.version);
  return c.json({ files: data.uploads.files, version: event.version }, 201);
}

export function handleUploadList(c: Context) {
  const user = userOf(c);
  if (!user) {
    mark(c, null);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const data = record(user.email);
  mark(c, data, 'uploads', data.uploads.version);
  return c.json(
    { files: data.uploads.files, version: data.uploads.version },
    200,
  );
}

export async function handleUploadGet(c: Context) {
  const user = userOf(c);
  if (!user) {
    mark(c, null);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const data = record(user.email);
  const id = c.req.param('id') ?? '';
  const found = data.uploads.filePath(id);
  if (!found) {
    mark(c, data);
    return c.json({ error: 'Not found' }, 404);
  }
  const bytes = await readFile(found.path);
  return c.body(bytes, 200, {
    'Content-Type': found.meta.type,
    'Content-Disposition': contentDisposition(found.meta.name),
    'Content-Length': String(bytes.byteLength),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=0',
  });
}

let eventsMounted = false;

export function mountEvents(api: {
  openapi: (
    route: typeof eventsRoute,
    handler: (c: Context) => Response | Promise<Response>,
  ) => unknown;
}): void {
  if (eventsMounted) return;
  eventsMounted = true;
  api.openapi(eventsRoute, (c) => {
    const user = userOf(c);
    if (!user) {
      mark(c, null);
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const data = record(user.email);
    const raw = c.req.header('last-event-id') ?? c.req.query('cursor') ?? '0';
    const cursor = Number(raw);
    const from = Number.isFinite(cursor) ? cursor : 0;
    return streamSSE(c, async (stream) => {
      let closed = false;
      stream.onAbort(() => {
        closed = true;
      });
      c.header('Cache-Control', 'no-cache');
      c.header('X-Accel-Buffering', 'no');
      if (data.bus.gap(from)) {
        const version = data.bus.current();
        await stream.writeSSE({
          id: String(version),
          event: 'resync',
          data: JSON.stringify({ type: 'resync', version }),
          retry: 1000,
        });
      } else {
        for (const event of data.bus.replay(from)) {
          await stream.writeSSE({
            id: String(event.version),
            event: event.type,
            data: JSON.stringify(event),
          });
        }
      }
      await stream.write(': ready\n\n');
      await new Promise<void>((done) => {
        const unsubscribe = data.bus.subscribe(async (event) => {
          if (closed) return;
          try {
            await stream.writeSSE({
              id: String(event.version),
              event: event.type,
              data: JSON.stringify(event),
            });
          } catch {
            closed = true;
            unsubscribe();
            done();
          }
        });
        stream.onAbort(() => {
          closed = true;
          unsubscribe();
          done();
        });
      });
    });
  });
}

export function defaultUploadDir(): string {
  return resolve(process.cwd(), 'tmp/uploads');
}
