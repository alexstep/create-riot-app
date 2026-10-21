import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  ErrorBodySchema,
  FileListSchema,
  LiveEventSchema,
  MAX_BODY_BYTES,
  mediaType,
  type Profile,
  ProfileInputSchema,
  ProfileSchema,
  SessionSchema,
  UploadFormSchema,
} from '../contract/schemas';
import { EventBus } from '../server/bus';
import type { AppEnv } from '../server/env';
import { contentDisposition, matchesType, UploadStore } from '../server/files';
import { csrfOk } from '../server/security';
import {
  type SessionStore,
  type SessionUser,
  sessionIdFrom,
  writeSessionCookie,
} from './session';

type LiveState = {
  env: AppEnv;
  sessions: SessionStore;
  bus: EventBus;
  uploads: UploadStore;
  profile: Profile | null;
};

const state: { current?: LiveState } = {};

export function attachLive(
  env: AppEnv,
  sessions: SessionStore,
  uploadDir: string,
): void {
  state.current = {
    env,
    sessions,
    bus: new EventBus(),
    uploads: new UploadStore(uploadDir),
    profile: null,
  };
}

function live(): LiveState {
  if (!state.current) throw new Error('Live state is not attached');
  return state.current;
}

function userOf(c: Context): SessionUser | null {
  const current = live();
  return current.sessions.read(sessionIdFrom(c, current.env.SESSION_SECRET));
}

function mark(c: Context, topic?: string, version?: number): void {
  c.header('X-Cursor', String(live().bus.current()));
  if (topic) c.header('X-Topic', topic);
  if (version != null) c.header('X-Version', String(version));
}

function blocked(c: Context) {
  if (!csrfOk(c)) {
    mark(c);
    return c.json({ error: 'Cross-site request blocked' }, 403);
  }
  return null;
}

export const sessionPost = createRoute({
  method: 'post',
  path: '/session',
  tags: ['session'],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({}).strict() } },
    },
  },
  responses: {
    200: {
      description: 'Session',
      content: { 'application/json': { schema: SessionSchema } },
    },
    403: {
      description: 'CSRF',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

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

export function handleSessionPost(c: Context) {
  const denied = blocked(c);
  if (denied) return denied;
  const current = live();
  const email = 'demo@example.com';
  const id = current.sessions.login(email);
  writeSessionCookie(c, current.env, id);
  mark(c, 'session', current.bus.current());
  return c.json({ user: { id: email } }, 200);
}

export function handleSessionGet(c: Context) {
  const user = userOf(c);
  if (!user) {
    mark(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  mark(c, 'session', live().bus.current());
  return c.json({ user: { id: user.email } }, 200);
}

export function handleProfileGet(c: Context) {
  const current = live();
  if (!userOf(c)) {
    mark(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (!current.profile) {
    mark(c);
    return c.json({ error: 'No profile yet' }, 404);
  }
  mark(c, 'profile', current.profile.version);
  return c.json(current.profile, 200);
}

export async function handleProfilePut(c: Context) {
  const denied = blocked(c);
  if (denied) return denied;
  if (!userOf(c)) {
    mark(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const input = ProfileInputSchema.parse(await c.req.json());
  const current = live();
  const event = current.bus.publish({
    type: 'profile',
    version: 0,
    profile: { ...input, updatedAt: Date.now(), version: 0 },
  });
  if (event.type !== 'profile') throw new Error('Expected a profile event');
  current.profile = event.profile;
  mark(c, 'profile', event.version);
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
  if (!userOf(c)) {
    mark(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const { files } = UploadFormSchema.parse(
    await c.req.parseBody({ all: true }),
  );
  const current = live();
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesType(bytes, mediaType(file.type))) {
      mark(c);
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
    const result = await current.uploads.save(file);
    if ('error' in result) {
      mark(c);
      return c.json(
        { error: result.error, fields: { files: [result.error] } },
        400,
      );
    }
  }
  const event = current.bus.publish({
    type: 'uploads',
    version: 0,
    files: current.uploads.files,
  });
  current.uploads.version = event.version;
  mark(c, 'uploads', event.version);
  return c.json({ files: current.uploads.files, version: event.version }, 201);
}

export function handleUploadList(c: Context) {
  const current = live();
  if (!userOf(c)) {
    mark(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  mark(c, 'uploads', current.uploads.version);
  return c.json(
    { files: current.uploads.files, version: current.uploads.version },
    200,
  );
}

export async function handleUploadGet(c: Context) {
  if (!userOf(c)) {
    mark(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const id = c.req.param('id') ?? '';
  const found = live().uploads.filePath(id);
  if (!found) {
    mark(c);
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
    if (!userOf(c)) {
      mark(c);
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const raw = c.req.header('last-event-id') ?? c.req.query('cursor') ?? '0';
    const cursor = Number(raw);
    const from = Number.isFinite(cursor) ? cursor : 0;
    const current = live();
    return streamSSE(c, async (stream) => {
      let closed = false;
      stream.onAbort(() => {
        closed = true;
      });
      c.header('Cache-Control', 'no-cache');
      c.header('X-Accel-Buffering', 'no');
      if (current.bus.gap(from)) {
        const version = current.bus.current();
        await stream.writeSSE({
          id: String(version),
          event: 'resync',
          data: JSON.stringify({ type: 'resync', version }),
          retry: 1000,
        });
      } else {
        for (const event of current.bus.replay(from)) {
          await stream.writeSSE({
            id: String(event.version),
            event: event.type,
            data: JSON.stringify(event),
          });
        }
      }
      await stream.write(': ready\n\n');
      await new Promise<void>((done) => {
        const unsubscribe = current.bus.subscribe(async (event) => {
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
