import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { errorBody } from '../contract/schemas';
import {
  handleProfileGet,
  handleProfilePut,
  handleSessionGet,
  handleUploadGet,
  handleUploadList,
  handleUploadPost,
  itemsOf,
  profileGet,
  profilePut,
  sessionGet,
  storeDeps,
  uploadGet,
  uploadList,
  uploadPost,
} from './live';
import {
  clearSessionCookie,
  clientKey,
  type SessionStore,
  type SessionUser,
  sessionIdFrom,
  writeSessionCookie,
} from './session';

const ErrorBody = z.object({ error: z.string() }).openapi('ErrorBody');
const UserBody = z.object({ email: z.string().email() }).openapi('User');
const LoginBody = z
  .object({ email: z.string().email(), password: z.string() })
  .openapi('LoginBody');
const ContactBody = z
  .object({ email: z.string().email(), message: z.string().min(1).max(500) })
  .openapi('ContactBody');
const ContactResult = z
  .object({ id: z.string(), email: z.string().email() })
  .openapi('ContactResult');
const ItemBody = z
  .object({ title: z.string().min(1).max(120) })
  .openapi('ItemInput');
const Item = z.object({ id: z.string(), title: z.string() }).openapi('Item');
const ItemList = z.object({ items: z.array(Item) }).openapi('ItemList');
const Hello = z
  .object({ message: z.string(), email: z.string().email().nullable() })
  .openapi('Hello');

const jsonError = {
  description: 'Error',
  content: { 'application/json': { schema: ErrorBody } },
} as const;

function deps() {
  return storeDeps();
}

function secret(): string {
  return deps().env.SESSION_SECRET;
}

export function requireUser(read: () => SessionStore) {
  return createMiddleware<{ Variables: { user: SessionUser } }>(
    async (c, next) => {
      const user = read().read(sessionIdFrom(c, secret()));
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
      c.set('user', user);
      await next();
    },
  );
}

export function optionalUser(read: () => SessionStore) {
  return createMiddleware<{ Variables: { user: SessionUser | null } }>(
    async (c, next) => {
      c.set('user', read().read(sessionIdFrom(c, secret())) ?? null);
      await next();
    },
  );
}

const authed = () => requireUser(() => deps().sessions);
const maybeUser = () => optionalUser(() => deps().sessions);

function signedIn(c: Context): SessionUser | null {
  return deps().sessions.read(sessionIdFrom(c, secret()));
}

// /login and /logout stay flat. A shared /auth prefix collapses those paths in
// Hono's typed client, so hc<AppType> would not expose client.api.auth.login.
const login = createRoute({
  method: 'post',
  path: '/login',
  tags: ['auth'],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: LoginBody } },
    },
  },
  responses: {
    200: {
      description: 'Signed in',
      content: { 'application/json': { schema: UserBody } },
    },
    400: jsonError,
    401: jsonError,
    429: jsonError,
  },
});

const logout = createRoute({
  method: 'post',
  path: '/logout',
  tags: ['auth'],
  middleware: [authed()] as const,
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  responses: {
    200: {
      description: 'Signed out',
      content: { 'application/json': { schema: z.object({}) } },
    },
  },
});

const me = createRoute({
  method: 'get',
  path: '/me',
  tags: ['auth'],
  middleware: [authed()] as const,
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  responses: {
    200: {
      description: 'Current user',
      content: { 'application/json': { schema: UserBody } },
    },
    401: jsonError,
  },
});

const hello = createRoute({
  method: 'get',
  path: '/hello',
  tags: ['public'],
  middleware: [maybeUser()] as const,
  responses: {
    200: {
      description: 'Greeting. Includes the user when a session is present.',
      content: { 'application/json': { schema: Hello } },
    },
  },
});

const contact = createRoute({
  method: 'post',
  path: '/contact',
  tags: ['public'],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ContactBody } },
    },
  },
  responses: {
    200: {
      description: 'Message stored',
      content: { 'application/json': { schema: ContactResult } },
    },
    400: jsonError,
  },
});

const listItems = createRoute({
  method: 'get',
  path: '/items',
  tags: ['items'],
  middleware: [authed()] as const,
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  responses: {
    200: {
      description: 'Items for the signed-in user',
      content: { 'application/json': { schema: ItemList } },
    },
    401: jsonError,
  },
});

const createItem = createRoute({
  method: 'post',
  path: '/items',
  tags: ['items'],
  middleware: [authed()] as const,
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ItemBody } },
    },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: Item } },
    },
    400: jsonError,
    401: jsonError,
  },
});

const deleteItem = createRoute({
  method: 'delete',
  path: '/items/{id}',
  tags: ['items'],
  middleware: [authed()] as const,
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }).openapi('ItemParams') },
  responses: {
    200: {
      description: 'Deleted',
      content: { 'application/json': { schema: Item } },
    },
    401: jsonError,
    404: jsonError,
  },
});

export const routes = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) return c.json(errorBody(result.error), 400);
  },
})
  .basePath('/api')
  .openapi(login, (c) => {
    const api = deps();
    if (!api.sessions.attempt(clientKey(c)))
      return c.json({ error: 'Too many attempts' }, 429);
    const body = c.req.valid('json');
    if (body.password !== api.env.DEMO_PASSWORD) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }
    const id = api.sessions.login(body.email);
    writeSessionCookie(c, api.env, id);
    return c.json({ email: body.email }, 200);
  })
  .openapi(logout, (c) => {
    const api = deps();
    api.sessions.destroy(sessionIdFrom(c, api.env.SESSION_SECRET));
    clearSessionCookie(c, api.env);
    return c.json({}, 200);
  })
  .openapi(me, (c) => {
    const user = signedIn(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return c.json({ email: user.email }, 200);
  })
  .openapi(hello, (c) => {
    const user = signedIn(c);
    return c.json({ message: 'Hello', email: user?.email ?? null }, 200);
  })
  .openapi(contact, (c) => {
    const body = c.req.valid('json');
    const id = crypto.randomUUID();
    deps().contacts.push({ id, email: body.email, message: body.message });
    return c.json({ id, email: body.email }, 200);
  })
  .openapi(listItems, (c) => {
    const user = signedIn(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return c.json({ items: itemsOf(user.email) }, 200);
  })
  .openapi(createItem, async (c) => {
    const user = signedIn(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const body = ItemBody.parse(await c.req.json());
    const item = { id: crypto.randomUUID(), title: body.title };
    itemsOf(user.email).push(item);
    return c.json(item, 201);
  })
  .openapi(deleteItem, (c) => {
    const user = signedIn(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const id = c.req.param('id');
    const items = itemsOf(user.email);
    const index = items.findIndex((item) => item.id === id);
    const item = items[index];
    if (!item) return c.json({ error: 'Not found' }, 404);
    items.splice(index, 1);
    return c.json({ id: item.id, title: item.title }, 200);
  })
  .openapi(sessionGet, handleSessionGet)
  .openapi(profileGet, handleProfileGet)
  .openapi(profilePut, handleProfilePut)
  .openapi(uploadPost, handleUploadPost)
  .openapi(uploadList, handleUploadList)
  .openapi(uploadGet, handleUploadGet);

routes.notFound((c) => c.json({ error: 'Not found' }, 404));

export type AppType = typeof routes;
