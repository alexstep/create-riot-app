import { expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server/app';
import { parseEnv } from '../src/server/env';

const env = parseEnv({
  SESSION_SECRET: 'test-session-secret-value',
  DEMO_PASSWORD: 'demo',
  NODE_ENV: 'test',
  PORT: '3000',
});

async function boot(email = 'ada@example.com') {
  const dir = await mkdtemp(path.join(tmpdir(), 'riot-uploads-'));
  const app = createApp(env, { uploadDir: dir });
  const cookie = await login(app, email);
  return { app, dir, cookie };
}

async function login(
  app: ReturnType<typeof createApp>,
  email: string,
): Promise<string> {
  const response = await app.request('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo' }),
  });
  return cookieHeader(response.headers.get('set-cookie'));
}

function cookieHeader(setCookie: string | null): string {
  const sid = /session=([^;]+)/.exec(setCookie ?? '')?.[1];
  if (!sid) throw new Error('session cookie missing');
  return `session=${sid}`;
}

test('users do not see each others profile, files, or events', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'riot-uploads-'));
  const app = createApp(env, { uploadDir: dir });
  const alice = await login(app, 'alice@example.com');
  const bob = await login(app, 'bob@example.com');
  const saved = await app.request('/api/profile', {
    method: 'PUT',
    headers: { cookie: alice, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Alice',
      email: 'alice@example.com',
      message: 'Private',
    }),
  });
  expect(saved.status).toBe(200);
  const form = new FormData();
  form.append('files', new File(['alice'], 'note.txt', { type: 'text/plain' }));
  const uploaded = await app.request('/api/uploads', {
    method: 'POST',
    body: form,
    headers: { cookie: alice },
  });
  expect(uploaded.status).toBe(201);
  const file = (await uploaded.json()).files[0];
  expect(
    (await app.request('/api/profile', { headers: { cookie: bob } })).status,
  ).toBe(404);
  const bobList = await app.request('/api/uploads', {
    headers: { cookie: bob },
  });
  expect((await bobList.json()).files).toEqual([]);
  expect(
    (await app.request(`/api/uploads/${file.id}`, { headers: { cookie: bob } }))
      .status,
  ).toBe(404);
  const stream = await app.request('/api/events', {
    headers: { cookie: bob, accept: 'text/event-stream' },
  });
  const reader = stream.body?.getReader();
  if (!reader) throw new Error('no body');
  await reader.read();
  await app.request('/api/profile', {
    method: 'PUT',
    headers: { cookie: alice, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Alice',
      email: 'alice@example.com',
      message: 'Again',
    }),
  });
  const next = await Promise.race([
    reader.read().then(() => 'event'),
    new Promise((resolve) => setTimeout(() => resolve('quiet'), 40)),
  ]);
  expect(next).toBe('quiet');
  await reader.cancel();
});

test('profile validation errors are per field', async () => {
  const { app, cookie } = await boot();
  const res = await app.request('/api/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: '', email: 'not-an-email', message: '' }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.fields.name?.length).toBeGreaterThan(0);
  expect(body.fields.email?.length).toBeGreaterThan(0);
  expect(body.fields.message?.length).toBeGreaterThan(0);
  expect(JSON.stringify(body)).not.toContain('stack');
});

test('profile save is returned and then readable', async () => {
  const { app, cookie } = await boot();
  const saved = await app.request('/api/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hello',
    }),
  });
  expect(saved.status).toBe(200);
  expect(saved.headers.get('x-topic')).toBe('profile');
  const profile = await saved.json();
  expect(profile.name).toBe('Ada');
  expect(profile.version).toBeGreaterThan(0);
  const again = await app.request('/api/profile', { headers: { cookie } });
  expect(await again.json()).toEqual(profile);
});

test('upload accepts one file and several, and ignores the client path', async () => {
  const { app, dir, cookie } = await boot();
  const outside = path.join(path.dirname(dir), 'pwned.txt');
  await writeFile(outside, 'secret');

  const form = new FormData();
  form.append(
    'files',
    new File(['hello'], '../../etc/passwd.txt', { type: 'text/plain' }),
  );
  form.append(
    'files',
    new File([pngBytes()], 'a/../../photo.png', { type: 'image/png' }),
  );
  const res = await app.request('/api/uploads', {
    method: 'POST',
    body: form,
    headers: { cookie },
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.files).toHaveLength(2);
  expect(body.files[0].name).toBe('passwd.txt');
  expect(body.files[1].name).toBe('photo.png');
  expect(body.files[0].name).not.toContain('/');
  const names = await walkFiles(dir);
  expect(names.some((name) => name.endsWith('.txt'))).toBe(true);
  expect(names.some((name) => name.endsWith('.png'))).toBe(true);
  expect(names.every((name) => /^[0-9a-f-]+\.(txt|png)$/i.test(name))).toBe(
    true,
  );
  expect(await readFile(outside, 'utf8')).toBe('secret');

  const list = await app.request('/api/uploads', { headers: { cookie } });
  expect((await list.json()).files).toHaveLength(2);

  const file = body.files[0];
  const download = await app.request(`/api/uploads/${file.id}`, {
    headers: { cookie },
  });
  expect(download.status).toBe(200);
  expect(download.headers.get('content-type')).toBe('text/plain');
  expect(download.headers.get('content-disposition')).toContain(
    'filename="passwd.txt"',
  );
  expect(await download.text()).toBe('hello');
});

test('upload rejects size, type, and content that does not match', async () => {
  const { app, cookie } = await boot();
  const big = new File([new Uint8Array(256 * 1024 + 1)], 'big.txt', {
    type: 'text/plain',
  });
  const bigForm = new FormData();
  bigForm.append('files', big);
  const tooBig = await app.request('/api/uploads', {
    method: 'POST',
    body: bigForm,
    headers: { cookie },
  });
  expect(tooBig.status).toBe(400);
  expect((await tooBig.json()).fields.files[0]).toContain('256 KB');

  const bad = new FormData();
  bad.append(
    'files',
    new File(['hello'], 'x.exe', { type: 'application/x-msdownload' }),
  );
  const rejected = await app.request('/api/uploads', {
    method: 'POST',
    body: bad,
    headers: { cookie },
  });
  expect(rejected.status).toBe(400);

  const lying = new FormData();
  lying.append(
    'files',
    new File(['not a png'], 'x.png', { type: 'image/png' }),
  );
  const mismatch = await app.request('/api/uploads', {
    method: 'POST',
    body: lying,
    headers: { cookie },
  });
  expect(mismatch.status).toBe(400);
  expect((await mismatch.json()).fields.files[0]).toContain('do not match');
});

test('body limit rejects an oversized content-length', async () => {
  const { app, cookie } = await boot();
  const res = await app.request('/api/uploads', {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'multipart/form-data; boundary=x',
      'content-length': String(3 * 1024 * 1024),
    },
    body: 'x',
  });
  expect(res.status).toBe(413);
});

test('download ids cannot escape the upload directory', async () => {
  const { app, cookie } = await boot();
  for (const id of [
    '../package.json',
    '..%2F..%2Fpackage.json',
    '%2e%2e%2fpackage.json',
    'not-a-uuid',
  ]) {
    const res = await app.request(`/api/uploads/${id}`, {
      headers: { cookie },
    });
    expect([400, 404]).toContain(res.status);
    const text = await res.text();
    expect(text).not.toContain('create-riot-app');
  }
});

test('cross-site origin is rejected', async () => {
  const { app, cookie } = await boot();
  const res = await app.request('/api/profile', {
    method: 'PUT',
    headers: {
      cookie,
      'content-type': 'application/json',
      origin: 'https://evil.example',
    },
    body: JSON.stringify({
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hello',
    }),
  });
  expect(res.status).toBe(403);
});

test('openapi spec describes the multipart upload and the event stream', async () => {
  const { app } = await boot();
  const res = await app.request('/api/openapi.json');
  expect(res.status).toBe(200);
  const spec = await res.json();
  const upload =
    spec.paths['/api/uploads']?.post ?? spec.paths['/uploads']?.post;
  expect(upload).toBeTruthy();
  const content = upload.requestBody.content;
  expect(content['multipart/form-data']).toBeTruthy();
  const encoded = JSON.stringify(spec.components.schemas.UploadForm);
  expect(encoded).toContain('binary');
  const events = spec.paths['/api/events']?.get ?? spec.paths['/events']?.get;
  expect(events).toBeTruthy();
  expect(JSON.stringify(events.responses['200'])).toContain('event-stream');
});

test('scalar docs render', async () => {
  const { app } = await boot();
  const res = await app.request('/api/docs');
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html.toLowerCase()).toContain('scalar');
});

test('sse delivers a profile edit and a resync when the cursor is stale', async () => {
  const { app, cookie } = await boot();
  const stream = await app.request('/api/events', {
    headers: { cookie, accept: 'text/event-stream' },
  });
  expect(stream.status).toBe(200);
  const reader = stream.body?.getReader();
  if (!reader) throw new Error('no body');
  const decoder = new TextDecoder();
  let text = '';
  const first = await reader.read();
  text += decoder.decode(first.value);
  expect(text).toContain('ready');

  const saved = await app.request('/api/profile', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Grace',
      email: 'grace@example.com',
      message: 'Live',
    }),
  });
  expect(saved.status).toBe(200);

  const next = await reader.read();
  text += decoder.decode(next.value);
  expect(text).toContain('"type":"profile"');
  expect(text).toContain('Grace');
  await reader.cancel();

  const stale = await app.request('/api/events?cursor=0', {
    headers: { cookie, accept: 'text/event-stream' },
  });
  const replayReader = stale.body?.getReader();
  if (!replayReader) throw new Error('no body');
  const replayChunk = await replayReader.read();
  const replay = new TextDecoder().decode(replayChunk.value);
  expect(replay).toContain('Grace');
  await replayReader.cancel();
});

test('a cursor older than the ring buffer asks the client to resync', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'riot-uploads-'));
  const app = createApp(env, { uploadDir: dir });
  const cookie = await login(app, 'ada@example.com');
  // Fill past the buffer by publishing through profile saves. The bus limit is 100.
  for (let i = 0; i < 105; i++) {
    const res = await app.request('/api/profile', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `N${i}`,
        email: 'ada@example.com',
        message: 'x',
      }),
    });
    expect(res.status).toBe(200);
  }
  const stale = await app.request('/api/events', {
    headers: { cookie, 'last-event-id': '1', accept: 'text/event-stream' },
  });
  const reader = stale.body?.getReader();
  if (!reader) throw new Error('no body');
  const chunk = await reader.read();
  const text = new TextDecoder().decode(chunk.value);
  expect(text).toContain('"type":"resync"');
  await reader.cancel();
  expect(await stat(dir)).toBeTruthy();
});

async function walkFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'manifest.json') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walkFiles(full)));
    else found.push(entry.name);
  }
  return found;
}

function pngBytes(): ArrayBuffer {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]).buffer;
}
