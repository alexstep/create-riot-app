import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server/app';
import { parseEnv } from '../src/server/env';
import { isApiPath, isCabinetPath, resolveStatic } from '../src/server/static';

const env = parseEnv({
  SESSION_SECRET: 'test-session-secret-value',
  DEMO_PASSWORD: 'demo',
  NODE_ENV: 'test',
  PORT: '3000',
});
const app = createApp(env);

async function login(): Promise<string> {
  const response = await app.request('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ada@example.com', password: 'demo' }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie') ?? '';
  const id = /session=([^;]+)/.exec(cookie)?.[1] ?? '';
  expect(id).not.toBe('');
  return id;
}

describe('pages', () => {
  test('home is server rendered with meta and islands', async () => {
    const response = await app.request('http://localhost/');
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<title>Riot app</title>');
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('rel="canonical" href="http://localhost/"');
    expect(html).toContain('<x-theme-toggle>');
    expect(html).toContain('<x-login-link>');
    expect(html).toContain('<x-subscribe-form>');
    expect(html).toContain('src="/src/islands/client.ts"');
    expect(html).toContain('A Riot app on one server');
  });

  test('about has its own title', async () => {
    const html = await (await app.request('http://localhost/about')).text();
    expect(html).toContain('<title>About</title>');
    expect(html).toContain('One Bun process');
  });

  test('sitemap and robots are routes', async () => {
    const robots = await (
      await app.request('http://localhost/robots.txt')
    ).text();
    expect(robots).toContain('Disallow: /app');
    expect(robots).toContain('Disallow: /api');
    expect(robots).toContain('Sitemap: http://localhost/sitemap.xml');
    const site = await (
      await app.request('http://localhost/sitemap.xml')
    ).text();
    expect(site).toContain('http://localhost/about');
    expect(site).not.toContain('/login');
  });
});

describe('auth and api', () => {
  test('me is 401, then 200 after login, and the cabinet redirects', async () => {
    const anon = await app.request('http://localhost/api/me');
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({ error: 'Unauthorized' });

    const cabinet = await app.request('http://localhost/app/dashboard');
    expect(cabinet.status).toBe(302);
    expect(cabinet.headers.get('location')).toBe(
      '/login?next=%2Fapp%2Fdashboard',
    );

    const id = await login();
    const me = await app.request('http://localhost/api/me', {
      headers: { cookie: `session=${id}` },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ email: 'ada@example.com' });

    const page = await app.request('http://localhost/app/groups', {
      headers: { cookie: `session=${id}` },
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('/src/cabinet/main.ts');

    const bearer = await app.request('http://localhost/api/me', {
      headers: { authorization: `Bearer ${id}` },
    });
    expect(bearer.status).toBe(200);

    const forged = await app.request('http://localhost/api/me', {
      headers: { authorization: 'Bearer not-a-session' },
    });
    expect(forged.status).toBe(401);

    const bye = await app.request('http://localhost/api/logout', {
      method: 'POST',
      headers: { cookie: `session=${id}`, origin: 'http://localhost' },
    });
    expect(bye.status).toBe(200);
    const after = await app.request('http://localhost/api/me', {
      headers: { cookie: `session=${id}` },
    });
    expect(after.status).toBe(401);
  });

  test('hello is public and includes the user when a session exists', async () => {
    const anon = await app.request('http://localhost/api/hello');
    expect(anon.status).toBe(200);
    expect(await anon.json()).toEqual({ message: 'Hello', email: null });
    const id = await login();
    const authed = await app.request('http://localhost/api/hello', {
      headers: { cookie: `session=${id}` },
    });
    expect(await authed.json()).toEqual({
      message: 'Hello',
      email: 'ada@example.com',
    });
  });

  test('bad login is 401 and invalid bodies are { error }', async () => {
    const bad = await app.request('http://localhost/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'nope' }),
    });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: 'Invalid email or password' });

    const invalid = await app.request('http://localhost/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', message: '' }),
    });
    expect(invalid.status).toBe(400);
    const body = (await invalid.json()) as { error?: unknown };
    expect(typeof body.error).toBe('string');
  });

  test('health is public', async () => {
    const response = await app.request('http://localhost/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test('unknown api paths are JSON 404 and do not return HTML', async () => {
    const response = await app.request('http://localhost/api/missing');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  test('openapi lists the demo routes', async () => {
    const response = await app.request('http://localhost/api/openapi.json');
    expect(response.status).toBe(200);
    const spec = (await response.json()) as {
      paths?: Record<string, unknown>;
      openapi?: string;
    };
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.paths?.['/api/me']).toBeTruthy();
    expect(spec.paths?.['/api/items']).toBeTruthy();
    expect(spec.paths?.['/api/login']).toBeTruthy();
    const info = spec as { info?: { version?: string } };
    expect(info.info?.version).toBe('1.0.0');
  });

  test('items require a session', async () => {
    const id = await login();
    const created = await app.request('http://localhost/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `session=${id}` },
      body: JSON.stringify({ title: 'First' }),
    });
    expect(created.status).toBe(201);
    const list = await app.request('http://localhost/api/items', {
      headers: { cookie: `session=${id}` },
    });
    const body = (await list.json()) as { items: { title: string }[] };
    expect(body.items.map((item) => item.title)).toContain('First');

    const createdBody = (await created.json()) as { id: string };
    const removed = await app.request(
      `http://localhost/api/items/${createdBody.id}`,
      {
        method: 'DELETE',
        headers: { cookie: `session=${id}`, origin: 'http://localhost' },
      },
    );
    expect(removed.status).toBe(200);
  });

  test('login is rate limited', async () => {
    const limited = createApp(env);
    let status = 0;
    for (let i = 0; i < 6; i++) {
      const response = await limited.request('http://localhost/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ada@example.com', password: 'nope' }),
      });
      status = response.status;
    }
    expect(status).toBe(429);
  });

  test('production docs stay unmounted until credentials are set', async () => {
    const closed = createApp({ ...env, NODE_ENV: 'production' });
    expect(
      (await closed.request('http://localhost/api/openapi.json')).status,
    ).toBe(404);

    const opened = createApp({
      ...env,
      NODE_ENV: 'production',
      DOCS_USER: 'docs',
      DOCS_PASSWORD: 'docs-secret',
    });
    const denied = await opened.request('http://localhost/api/openapi.json');
    expect(denied.status).toBe(401);
    const allowed = await opened.request('http://localhost/api/openapi.json', {
      headers: {
        authorization: `Basic ${btoa('docs:docs-secret')}`,
      },
    });
    expect(allowed.status).toBe(200);
  });

  test('a cross-site form post is rejected', async () => {
    const response = await app.request('http://localhost/api/logout', {
      method: 'POST',
      headers: { origin: 'http://evil.example', 'content-type': 'text/plain' },
    });
    expect(response.status).toBe(403);
  });
});

describe('static files', () => {
  test('rejects paths that leave the root', () => {
    expect(resolveStatic('/tmp/assets', '/../etc/passwd')).toBeNull();
    expect(resolveStatic('/tmp/assets', '/..%2F..%2Fetc/passwd')).toBeNull();
  });

  test('api and cabinet prefixes do not swallow shell files', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/me')).toBe(true);
    expect(isApiPath('/apple-touch-icon.png')).toBe(false);
    expect(isCabinetPath('/app')).toBe(true);
    expect(isCabinetPath('/app/dashboard')).toBe(true);
    expect(isCabinetPath('/app.html')).toBe(false);
  });

  test('every precached shell file is served and the vite manifest is not', async () => {
    const root = await mkdtemp(join(tmpdir(), 'riot-static-'));
    const uploads = await mkdtemp(join(tmpdir(), 'riot-uploads-'));
    await mkdir(join(root, 'assets'), { recursive: true });
    await mkdir(join(root, '.vite'), { recursive: true });
    const files = [
      '/app.html',
      '/offline.html',
      '/apple-touch-icon.png',
      '/assets/app.js',
    ];
    for (const file of files) {
      await writeFile(join(root, file.slice(1)), 'ok');
    }
    await writeFile(join(root, '.vite/manifest.json'), '{}');
    const served = createApp(
      { ...env, NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://example.com' },
      { staticRoot: root, uploadDir: uploads },
    );
    for (const file of files) {
      expect((await served.request(`http://localhost${file}`)).status).toBe(
        200,
      );
    }
    expect(
      (await served.request('http://localhost/.vite/manifest.json')).status,
    ).toBe(404);
  });
});

test('production requires PUBLIC_ORIGIN', () => {
  expect(() =>
    parseEnv({
      SESSION_SECRET: 'test-session-secret-value',
      DEMO_PASSWORD: 'demo',
      NODE_ENV: 'production',
    }),
  ).toThrow(/PUBLIC_ORIGIN/);
});
