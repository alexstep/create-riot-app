import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import { streamSSE } from 'hono/streaming'
import type { Context } from 'hono'
import { readFile } from 'node:fs/promises'
import {
  ErrorBodySchema,
  FileListSchema,
  LiveEventSchema,
  MAX_BODY_BYTES,
  ProfileInputSchema,
  ProfileSchema,
  SessionSchema,
  UploadFormSchema,
  errorBody,
  mediaType,
  type Profile,
} from '../contract/schemas'
import { EventBus } from './bus'
import { UploadStore, contentDisposition, matchesType } from './files'
import { csrfOk, requestOrigin } from './security'
import pkg from '../../package.json' with { type: 'json' }

const DEMO_USER = { id: 'demo' }

export type AppOptions = {
  uploadDir?: string
  clean?: boolean
}

type Deps = {
  bus: EventBus
  sessions: Map<string, { id: string }>
  profile: Profile | null
  uploads: UploadStore
}

const validationHook = (
  result: { success: true } | { success: false; error: z.ZodError },
  c: Context,
) => {
  if (!result.success) return c.json(errorBody(result.error), 400)
}

function createDeps(uploads: UploadStore): Deps {
  return {
    bus: new EventBus(),
    sessions: new Map(),
    profile: null,
    uploads,
  }
}

function mark(c: Context, deps: Deps, topic?: string, version?: number) {
  c.header('X-Cursor', String(deps.bus.current()))
  if (topic) c.header('X-Topic', topic)
  if (version != null) c.header('X-Version', String(version))
}

function user(c: Context, deps: Deps): { id: string } | null {
  const sid = getCookie(c, 'sid')
  if (!sid) return null
  return deps.sessions.get(sid) ?? null
}

function blocked(c: Context, deps: Deps) {
  if (!csrfOk(c)) {
    mark(c, deps)
    return c.json({ error: 'Cross-site request blocked' }, 403)
  }
  return null
}

const sessionPost = createRoute({
  method: 'post',
  path: '/session',
  tags: ['Session'],
  summary: 'Start a session',
  request: {
    body: {
      content: { 'application/json': { schema: z.object({}).strict() } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Session', content: { 'application/json': { schema: SessionSchema } } },
    403: { description: 'CSRF', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
})

const sessionGet = createRoute({
  method: 'get',
  path: '/session',
  tags: ['Session'],
  summary: 'Current session',
  responses: {
    200: { description: 'Session', content: { 'application/json': { schema: SessionSchema } } },
    401: { description: 'No session', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
})

const profileGet = createRoute({
  method: 'get',
  path: '/profile',
  tags: ['Profile'],
  summary: 'Current profile',
  responses: {
    200: { description: 'Profile', content: { 'application/json': { schema: ProfileSchema } } },
    401: { description: 'No session', content: { 'application/json': { schema: ErrorBodySchema } } },
    404: { description: 'Not saved yet', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
})

const profilePut = createRoute({
  method: 'put',
  path: '/profile',
  tags: ['Profile'],
  summary: 'Save profile',
  request: {
    body: {
      content: { 'application/json': { schema: ProfileInputSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Saved profile', content: { 'application/json': { schema: ProfileSchema } } },
    400: { description: 'Invalid profile', content: { 'application/json': { schema: ErrorBodySchema } } },
    401: { description: 'No session', content: { 'application/json': { schema: ErrorBodySchema } } },
    403: { description: 'CSRF', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
})

const uploadPost = createRoute({
  method: 'post',
  path: '/uploads',
  tags: ['Uploads'],
  summary: 'Upload one or more files',
  middleware: [
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json({ error: 'Upload is too large', fields: { files: ['Upload is too large'] } }, 413),
    }),
  ],
  request: {
    body: {
      content: { 'multipart/form-data': { schema: UploadFormSchema } },
      required: true,
    },
  },
  responses: {
    201: { description: 'Stored files', content: { 'application/json': { schema: FileListSchema } } },
    400: { description: 'Invalid upload', content: { 'application/json': { schema: ErrorBodySchema } } },
    401: { description: 'No session', content: { 'application/json': { schema: ErrorBodySchema } } },
    403: { description: 'CSRF', content: { 'application/json': { schema: ErrorBodySchema } } },
    413: { description: 'Body too large', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
})

const uploadList = createRoute({
  method: 'get',
  path: '/uploads',
  tags: ['Uploads'],
  summary: 'List uploaded files',
  responses: {
    200: { description: 'Files', content: { 'application/json': { schema: FileListSchema } } },
    401: { description: 'No session', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
})

const uploadGet = createRoute({
  method: 'get',
  path: '/uploads/{id}',
  tags: ['Uploads'],
  summary: 'Download one file',
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' }, example: '00000000-0000-4000-8000-000000000000' }),
    }),
  },
  responses: {
    200: {
      description: 'File bytes',
      content: { 'application/octet-stream': { schema: z.string().openapi({ format: 'binary' }) } },
    },
    401: { description: 'No session', content: { 'application/json': { schema: ErrorBodySchema } } },
    404: { description: 'Missing', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
})

const eventsRoute = createRoute({
  method: 'get',
  path: '/events',
  tags: ['Live'],
  summary: 'Server-sent events for this user',
  description:
    'Each event is a JSON LiveEvent. Resume with Last-Event-ID (the event version) or ?cursor=. A resync event means the ring buffer no longer covers the gap; refetch profile and uploads.',
  responses: {
    200: {
      description: 'Event stream',
      content: { 'text/event-stream': { schema: LiveEventSchema } },
    },
    401: { description: 'No session', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
})

export function buildApi(deps: Deps) {
  const api = new OpenAPIHono({ defaultHook: validationHook }).basePath('/api')

  return api
    .openapi(sessionPost, (c) => {
      const denied = blocked(c, deps)
      if (denied) return denied
      const sid = crypto.randomUUID()
      deps.sessions.set(sid, DEMO_USER)
      setCookie(c, 'sid', sid, {
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        secure: requestOrigin(c).startsWith('https:'),
      })
      mark(c, deps, 'session', deps.bus.current())
      return c.json({ user: DEMO_USER }, 200)
    })
    .openapi(sessionGet, (c) => {
      if (!user(c, deps)) {
        mark(c, deps)
        return c.json({ error: 'Unauthorized' }, 401)
      }
      mark(c, deps, 'session', deps.bus.current())
      return c.json({ user: DEMO_USER }, 200)
    })
    .openapi(profileGet, (c) => {
      if (!user(c, deps)) {
        mark(c, deps)
        return c.json({ error: 'Unauthorized' }, 401)
      }
      if (!deps.profile) {
        mark(c, deps)
        return c.json({ error: 'No profile yet' }, 404)
      }
      mark(c, deps, 'profile', deps.profile.version)
      return c.json(deps.profile, 200)
    })
    .openapi(profilePut, (c) => {
      const denied = blocked(c, deps)
      if (denied) return denied
      if (!user(c, deps)) {
        mark(c, deps)
        return c.json({ error: 'Unauthorized' }, 401)
      }
      const input = c.req.valid('json')
      const event = deps.bus.publish({
        type: 'profile',
        version: 0,
        profile: { ...input, updatedAt: Date.now(), version: 0 },
      })
      if (event.type !== 'profile') throw new Error('Expected a profile event')
      deps.profile = event.profile
      mark(c, deps, 'profile', event.version)
      return c.json(event.profile, 200)
    })
    .openapi(uploadPost, async (c) => {
      const denied = blocked(c, deps)
      if (denied) return denied
      if (!user(c, deps)) {
        mark(c, deps)
        return c.json({ error: 'Unauthorized' }, 401)
      }
      const { files } = c.req.valid('form')
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (!matchesType(bytes, mediaType(file.type))) {
          mark(c, deps)
          return c.json({
            error: 'File contents do not match its type',
            fields: { files: ['File contents do not match its type'] },
          }, 400)
        }
      }
      for (const file of files) {
        const result = await deps.uploads.save(file)
        if ('error' in result) {
          mark(c, deps)
          return c.json({ error: result.error, fields: { files: [result.error] } }, 400)
        }
      }
      const event = deps.bus.publish({ type: 'uploads', version: 0, files: deps.uploads.files })
      deps.uploads.version = event.version
      mark(c, deps, 'uploads', event.version)
      return c.json({ files: deps.uploads.files, version: event.version }, 201)
    })
    .openapi(uploadList, (c) => {
      if (!user(c, deps)) {
        mark(c, deps)
        return c.json({ error: 'Unauthorized' }, 401)
      }
      mark(c, deps, 'uploads', deps.uploads.version)
      return c.json({ files: deps.uploads.files, version: deps.uploads.version }, 200)
    })
    .openapi(uploadGet, async (c) => {
      if (!user(c, deps)) {
        mark(c, deps)
        return c.json({ error: 'Unauthorized' }, 401)
      }
      const { id } = c.req.valid('param')
      const found = deps.uploads.filePath(id)
      if (!found) {
        mark(c, deps)
        return c.json({ error: 'Not found' }, 404)
      }
      const bytes = await readFile(found.path)
      return c.body(bytes, 200, {
        'Content-Type': found.meta.type,
        'Content-Disposition': contentDisposition(found.meta.name),
        'Content-Length': String(bytes.byteLength),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=0',
      })
    })
}

export async function createApp(opts: AppOptions = {}) {
  const uploads = new UploadStore(opts.uploadDir ?? `${process.cwd()}/tmp/uploads`)
  await uploads.init(opts.clean ?? false)
  const deps = createDeps(uploads)
  const api = buildApi(deps)

  api.openapi(eventsRoute, (c) => {
    if (!user(c, deps)) {
      mark(c, deps)
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const raw = c.req.header('last-event-id') ?? c.req.query('cursor') ?? '0'
    const cursor = Number(raw)
    const from = Number.isFinite(cursor) ? cursor : 0
    return streamSSE(c, async (stream) => {
      let closed = false
      const stop = () => {
        closed = true
      }
      stream.onAbort(stop)
      c.header('Cache-Control', 'no-cache')
      c.header('X-Accel-Buffering', 'no')
      if (deps.bus.gap(from)) {
        const version = deps.bus.current()
        await stream.writeSSE({
          id: String(version),
          event: 'resync',
          data: JSON.stringify({ type: 'resync', version }),
          retry: 1000,
        })
      } else {
        for (const event of deps.bus.replay(from)) {
          await stream.writeSSE({
            id: String(event.version),
            event: event.type,
            data: JSON.stringify(event),
          })
        }
      }
      await stream.write(': ready\n\n')
      await new Promise<void>((resolve) => {
        const unsubscribe = deps.bus.subscribe(async (event) => {
          if (closed) return
          try {
            await stream.writeSSE({
              id: String(event.version),
              event: event.type,
              data: JSON.stringify(event),
            })
          } catch {
            closed = true
            unsubscribe()
            resolve()
          }
        })
        stream.onAbort(() => {
          closed = true
          unsubscribe()
          resolve()
        })
      })
    })
  })

  api.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'Riot data layer',
      version: pkg.version,
      description: 'Profiles, uploads, and a typed event stream. Schemas and routes are the same source.',
    },
  })

  api.get(
    '/docs',
    Scalar({
      url: '/api/openapi.json',
      pageTitle: 'Riot data layer',
      theme: 'default',
      hideClientButton: true,
      customCss: `.light-mode, .dark-mode { --scalar-color-accent: var(--accent, #3b82f6); }`,
    }),
  )

  api.notFound((c) => c.json({ error: 'Not found' }, 404))
  api.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    console.error(err)
    return c.json({ error: 'Internal error' }, 500)
  })

  return api
}

export type AppType = ReturnType<typeof buildApi>
