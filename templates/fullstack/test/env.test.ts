import { describe, expect, test } from 'bun:test';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server/app';
import { demoLoginPassword, parseEnv } from '../src/server/env';

const devSecret = 'dev-only-insecure-session-secret';

function captureLog(run: () => void): string {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    run();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

describe('parseEnv', () => {
  test('development with no environment variables uses demo defaults', () => {
    const notice = captureLog(() => {
      const env = parseEnv({});
      expect(env.NODE_ENV).toBe('development');
      expect(env.SESSION_SECRET).toBe(devSecret);
      expect(env.DEMO_PASSWORD).toBe('demo');
      expect(env.PORT).toBe(3000);
      expect(env.PUBLIC_ORIGIN).toBeUndefined();
    });
    expect(notice).toContain('Demo defaults are in use');
    expect(notice).toContain('SESSION_SECRET');
    expect(notice).toContain('DEMO_PASSWORD');
    expect(notice).toContain('password is "demo"');
  });

  test('blank values are treated as missing', () => {
    const env = parseEnv({
      SESSION_SECRET: '   ',
      DEMO_PASSWORD: ' ',
      PUBLIC_ORIGIN: '',
      PORT: '',
    });
    expect(env.SESSION_SECRET).toBe(devSecret);
    expect(env.DEMO_PASSWORD).toBe('demo');
    expect(env.PORT).toBe(3000);
    expect(env.PUBLIC_ORIGIN).toBeUndefined();
  });

  test('explicit values are kept and no demo notice is printed', () => {
    const notice = captureLog(() => {
      const env = parseEnv({
        SESSION_SECRET: 'test-session-secret-value',
        DEMO_PASSWORD: 'custom',
        PORT: '4000',
      });
      expect(env.SESSION_SECRET).toBe('test-session-secret-value');
      expect(env.DEMO_PASSWORD).toBe('custom');
      expect(env.PORT).toBe(4000);
    });
    expect(notice).not.toContain('Demo defaults');
  });

  test('only the missing demo values are filled', () => {
    const notice = captureLog(() => {
      const env = parseEnv({
        SESSION_SECRET: 'test-session-secret-value',
      });
      expect(env.SESSION_SECRET).toBe('test-session-secret-value');
      expect(env.DEMO_PASSWORD).toBe('demo');
    });
    expect(notice).toContain('DEMO_PASSWORD');
    expect(notice).not.toContain('SESSION_SECRET');
  });

  test('a short session secret is rejected instead of replaced', () => {
    expect(() =>
      parseEnv({
        SESSION_SECRET: 'short',
        DEMO_PASSWORD: 'demo',
      }),
    ).toThrow(/Invalid environment[\s\S]*at least 16/);
  });

  test('production with no environment variables fails', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(
      /Cannot start in production[\s\S]*SESSION_SECRET[\s\S]*DEMO_PASSWORD[\s\S]*PUBLIC_ORIGIN/,
    );
    let message = '';
    try {
      parseEnv({ NODE_ENV: 'production' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain('received undefined');
    expect(message).not.toContain('dev-only');
    expect(message).toContain('.env');
  });

  test('production lists only what is missing', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: 'test-session-secret-value',
        DEMO_PASSWORD: 'demo',
      }),
    ).toThrow(/PUBLIC_ORIGIN/);
    let message = '';
    try {
      parseEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: 'test-session-secret-value',
        DEMO_PASSWORD: 'demo',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain('SESSION_SECRET');
    expect(message).not.toContain('DEMO_PASSWORD');
    expect(message).not.toContain('received undefined');
  });

  test('production accepts the local origin from .env.example', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      SESSION_SECRET: 'replace-me-with-a-long-random-string',
      DEMO_PASSWORD: 'demo',
      PUBLIC_ORIGIN: 'http://localhost:3000',
    });
    expect(env.PUBLIC_ORIGIN).toBe('http://localhost:3000');
    expect(env.DEMO_PASSWORD).toBe('demo');
    expect(demoLoginPassword(env)).toBeNull();
  });

  test('an invalid production origin names PUBLIC_ORIGIN', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: 'test-session-secret-value',
        DEMO_PASSWORD: 'demo',
        PUBLIC_ORIGIN: 'not-a-url',
      }),
    ).toThrow(/Cannot start in production[\s\S]*PUBLIC_ORIGIN/);
  });
});

describe('demo login', () => {
  test('development shows the password and production does not', () => {
    const dev = parseEnv({
      SESSION_SECRET: 'test-session-secret-value',
      DEMO_PASSWORD: 'demo',
      NODE_ENV: 'development',
    });
    expect(demoLoginPassword(dev)).toBe('demo');
    const prod = parseEnv({
      SESSION_SECRET: 'test-session-secret-value',
      DEMO_PASSWORD: 's3cret-value',
      PUBLIC_ORIGIN: 'https://example.com',
      NODE_ENV: 'production',
    });
    expect(demoLoginPassword(prod)).toBeNull();
  });

  test('an empty environment can create the app and sign in', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'riot-uploads-'));
    const env = parseEnv({});
    const app = createApp(env, { uploadDir: dir });
    expect((await stat(dir)).isDirectory()).toBe(true);

    const home = await app.request('http://localhost/');
    expect(home.status).toBe(200);

    const login = await app.request('http://localhost/login');
    expect(login.status).toBe(200);
    const html = await login.text();
    expect(html).toContain('<code>demo</code>');

    const signed = await app.request('http://localhost/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'demo' }),
    });
    expect(signed.status).toBe(200);
  });

  test('a password that looks like markup cannot close the page', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'riot-uploads-'));
    const nasty = '</script><script>alert(1)</script>';
    const env = parseEnv({
      SESSION_SECRET: 'test-session-secret-value',
      DEMO_PASSWORD: nasty,
      NODE_ENV: 'test',
    });
    const app = createApp(env, { uploadDir: dir });
    const html = await (await app.request('http://localhost/login')).text();
    expect(html).not.toContain('<script>alert');
    const state = /id="riot-state">([^<]*)<\/script>/.exec(html)?.[1] ?? '';
    const parsed = JSON.parse(state) as {
      'login-form'?: { password?: string };
    };
    expect(parsed['login-form']?.password).toBe(nasty);
  });
});
