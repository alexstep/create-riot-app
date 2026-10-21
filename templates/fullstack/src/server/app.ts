import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Scalar } from '@scalar/hono-api-reference';
import { type Context, Hono, type Next } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { attachLive, defaultUploadDir, mountEvents } from '../api/live';
import { routes } from '../api/routes';
import { sessionIdFrom } from '../api/session';
import { normalizeCabinetPath } from '../cabinet/paths';
import { MAX_BODY_BYTES } from '../contract/schemas';
import About from '../pages/about.riot';
import Home from '../pages/home.riot';
import Login from '../pages/login.riot';
import { type AppEnv, demoLoginPassword, parseEnv } from './env';
import { renderPage } from './html';
import { csrfOk } from './security';
import {
  isApiPath,
  isCabinetPath,
  resolveStatic,
  staticResponse,
} from './static';

const scalarCss = `
:root {
  --scalar-background-1: var(--page-bg, #fff);
  --scalar-background-2: var(--groups-canvas, #f0f0f0);
  --scalar-background-3: var(--card-bg, #fff);
  --scalar-color-1: var(--card-text, #333);
  --scalar-color-2: var(--muted, #aaa);
  --scalar-color-accent: var(--theme-color, #5181b8);
}
.dark-mode {
  --scalar-background-1: var(--page-bg, #14171c);
  --scalar-background-2: var(--drawer-bg, #1c2128);
  --scalar-background-3: var(--card-bg, #222833);
  --scalar-color-1: var(--card-text, #e7eaee);
  --scalar-color-2: var(--muted, #9aa3ad);
  --scalar-color-accent: var(--selected-icon, #8eb4e0);
}
`;

function packageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
  ) as {
    version?: string;
  };
  return pkg.version ?? '0.0.0';
}

let specReady = false;

function registerSpec(): void {
  if (specReady) return;
  specReady = true;
  routes.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'session',
  });
  routes.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
  });
  routes.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'Riot app API',
      version: packageVersion(),
    },
  });
}

function docsAccess(env: AppEnv) {
  if (env.NODE_ENV !== 'production')
    return async (_c: Context, next: Next) => next();
  if (!env.DOCS_USER || !env.DOCS_PASSWORD) {
    return async (c: Context) => c.json({ error: 'Not found' }, 404);
  }
  return basicAuth({ username: env.DOCS_USER, password: env.DOCS_PASSWORD });
}

function spaHtml(env: AppEnv): string {
  const file =
    env.NODE_ENV === 'production' ? 'dist/client/app.html' : 'app.html';
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}

const contactHint = 'Send a note. It stays in memory on this server.';

function loginLocation(path: string): string {
  return `/login?next=${encodeURIComponent(normalizeCabinetPath(path))}`;
}

export function createApp(
  env: AppEnv = parseEnv(),
  options?: { uploadDir?: string; staticRoot?: string },
) {
  const state = attachLive(env, options?.uploadDir ?? defaultUploadDir());
  mountEvents(routes);
  const api = routes;
  const app = new Hono();

  app.use(
    '*',
    secureHeaders(
      env.PUBLIC_ORIGIN?.startsWith('https://')
        ? {}
        : { strictTransportSecurity: false },
    ),
  );
  app.use('*', async (c, next) => {
    if (!/^(GET|HEAD|OPTIONS)$/.test(c.req.method) && !csrfOk(c)) {
      return c.json({ error: 'Cross-site request blocked' }, 403);
    }
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    console.error(error);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  app.post(
    '/api/uploads',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json(
          {
            error: 'Upload is too large',
            fields: { files: ['Upload is too large'] },
          },
          413,
        ),
    }),
  );

  const guard = docsAccess(env);
  app.use('/api/docs', guard);
  app.use('/api/openapi.json', guard);
  registerSpec();
  app.get(
    '/api/docs',
    Scalar({
      url: '/api/openapi.json',
      customCss: scalarCss,
    }),
  );
  app.get('/api/health', (c) => c.json({ ok: true }));

  app.route('/', api);

  app.get('/robots.txt', (c) => {
    const origin =
      env.PUBLIC_ORIGIN?.replace(/\/$/, '') || new URL(c.req.url).origin;
    return c.text(
      `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api\nSitemap: ${origin}/sitemap.xml\n`,
    );
  });

  app.get('/sitemap.xml', (c) => {
    const origin =
      env.PUBLIC_ORIGIN?.replace(/\/$/, '') || new URL(c.req.url).origin;
    const urls = ['/', '/about']
      .map((path) => `<url><loc>${origin}${path}</loc></url>`)
      .join('');
    c.header('Content-Type', 'application/xml; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    );
  });

  if (env.NODE_ENV === 'production') {
    app.use('*', async (c, next) => {
      if (isApiPath(c.req.path) || isCabinetPath(c.req.path)) return next();
      const file = resolveStatic(
        options?.staticRoot ?? resolve(process.cwd(), 'dist/client'),
        c.req.path,
      );
      if (!file) return next();
      return staticResponse(c, file, c.req.path.startsWith('/assets/'));
    });
  }

  app.get('/', (c) =>
    renderPage(
      c,
      env,
      'home',
      Home,
      {
        title: 'A Riot app on one server',
        lead: 'Landing pages are rendered on the server. The cabinet is a client app after you log in.',
        hint: contactHint,
      },
      {
        title: 'Riot app',
        description:
          'Server-rendered pages, a JSON API, and a client cabinet on Bun.',
        path: '/',
      },
      {
        'subscribe-form': { hint: contactHint },
      },
    ),
  );

  app.get('/about', (c) =>
    renderPage(
      c,
      env,
      'about',
      About,
      {},
      {
        title: 'About',
        description: 'How this Riot and Hono app is put together.',
        path: '/about',
      },
    ),
  );

  const loginPassword = demoLoginPassword(env) ?? '';
  app.get('/login', (c) =>
    renderPage(
      c,
      env,
      'login',
      Login,
      { password: loginPassword },
      {
        title: 'Log in',
        description: 'Demo sign-in for the cabinet.',
        path: '/login',
      },
      { 'login-form': { password: loginPassword } },
    ),
  );

  app.use('/app', async (c, next) => {
    if (!state.sessions.read(sessionIdFrom(c, env.SESSION_SECRET)))
      return c.redirect(loginLocation(c.req.path));
    await next();
  });
  app.use('/app/*', async (c, next) => {
    if (!state.sessions.read(sessionIdFrom(c, env.SESSION_SECRET)))
      return c.redirect(loginLocation(c.req.path));
    await next();
  });

  app.get('/app', (c) => c.redirect('/app/dashboard'));
  app.get('/app/*', (c) => {
    const canonical = normalizeCabinetPath(c.req.path);
    if (canonical !== c.req.path) return c.redirect(canonical);
    const html = spaHtml(env);
    const etag = `W/"${Bun.hash(html).toString(16)}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', 'no-cache');
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);
    return c.html(html);
  });

  app.notFound((c) => {
    if (isApiPath(c.req.path)) return c.json({ error: 'Not found' }, 404);
    return c.text('Not found', 404);
  });

  return app;
}
