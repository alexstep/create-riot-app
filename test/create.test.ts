import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repo = resolve(import.meta.dir, '..');
const cli = join(repo, 'bin/create-riot-app.ts');
const fullstackModules = join(repo, 'templates/fullstack/node_modules');
const spaModules = join(repo, 'templates/spa/node_modules');

function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ['HOME', 'USER', 'TMPDIR', 'LANG', 'SHELL']) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  const bunDir = dirname(process.execPath);
  env.PATH = `${bunDir}:${process.env.PATH ?? ''}`;
  return { ...env, ...extra };
}

async function scaffold(
  args: string[],
): Promise<{ status: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, cli, ...args], {
    cwd: repo,
    stdout: 'pipe',
    stderr: 'pipe',
    env: childEnv(),
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const status = await proc.exited;
  return { status, stdout, stderr };
}

describe('create-riot-app', () => {
  let dest = '';

  beforeAll(async () => {
    dest = await mkdtemp(join(tmpdir(), 'riot-create-'));
    const result = await scaffold([dest, '--no-install']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('cp .env.example');
    expect(result.stdout).toContain('password "demo"');
    await symlink(fullstackModules, join(dest, 'node_modules'), 'dir');
  });

  afterAll(async () => {
    if (dest) await rm(dest, { recursive: true, force: true });
  });

  test('writes .env from .env.example', async () => {
    const envText = await readFile(join(dest, '.env'), 'utf8');
    const example = await readFile(join(dest, '.env.example'), 'utf8');
    expect(envText).toBe(example);
    expect(envText).toContain('DEMO_PASSWORD=demo');
    expect(envText).toContain('PUBLIC_ORIGIN=http://localhost:3000');
    expect(envText).toContain('SESSION_SECRET=');
  });

  test('does not replace an existing .env', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'riot-force-'));
    try {
      await writeFile(join(dir, '.env'), 'DEMO_PASSWORD=keep-me\n');
      await writeFile(join(dir, 'keep.txt'), 'stay\n');
      const result = await scaffold([dir, '--force', '--no-install']);
      expect(result.status, result.stderr).toBe(0);
      expect(await readFile(join(dir, '.env'), 'utf8')).toBe(
        'DEMO_PASSWORD=keep-me\n',
      );
      expect(await readFile(join(dir, 'keep.txt'), 'utf8')).toBe('stay\n');
      expect(result.stdout).not.toContain('cp .env.example');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a scaffolded project with an empty environment can create the app', async () => {
    const envPath = join(dest, '.env');
    const saved = await readFile(envPath, 'utf8');
    await rm(envPath);
    const script = join(dest, 'scripts/empty-env-check.ts');
    await writeFile(
      script,
      `import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server/app.ts';
import { parseEnv } from '../src/server/env.ts';

const env = parseEnv(process.env);
if (env.NODE_ENV !== 'development') throw new Error('node ' + env.NODE_ENV);
if (env.DEMO_PASSWORD !== 'demo') throw new Error('password ' + env.DEMO_PASSWORD);
if (env.SESSION_SECRET !== 'dev-only-insecure-session-secret') {
  throw new Error('secret ' + env.SESSION_SECRET);
}
const dir = mkdtempSync(join(tmpdir(), 'riot-up-'));
const app = createApp(env, { uploadDir: dir });
if (!statSync(dir).isDirectory()) throw new Error('uploads missing');
const response = await app.request('http://localhost/login');
const html = await response.text();
if (response.status !== 200) throw new Error('status ' + response.status + html.slice(0, 200));
if (!html.includes('<code>demo</code>')) throw new Error(html.slice(0, 400));
const login = await app.request('http://localhost/api/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'ada@example.com', password: 'demo' }),
});
if (login.status !== 200) throw new Error('login ' + login.status);
console.log('scaffold-ok');
`,
    );
    try {
      const proc = Bun.spawn(
        [
          process.execPath,
          '--preload',
          './scripts/riot-loader.ts',
          './scripts/empty-env-check.ts',
        ],
        {
          cwd: dest,
          stdout: 'pipe',
          stderr: 'pipe',
          env: childEnv(),
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const status = await proc.exited;
      expect(status, `${stdout}\n${stderr}`).toBe(0);
      expect(stdout).toContain('scaffold-ok');
      expect(`${stdout}\n${stderr}`).toContain('Demo defaults are in use');
      expect(`${stdout}\n${stderr}`).not.toContain('received undefined');
    } finally {
      await writeFile(envPath, saved);
      await rm(script, { force: true });
    }
  });

  test('production start without env prints what to set and does not listen', async () => {
    const envPath = join(dest, '.env');
    const saved = await readFile(envPath, 'utf8');
    await rm(envPath);
    try {
      const proc = Bun.spawn(
        [
          process.execPath,
          '--preload',
          './scripts/riot-loader.ts',
          'src/server/index.ts',
        ],
        {
          cwd: dest,
          stdout: 'pipe',
          stderr: 'pipe',
          env: childEnv(),
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const status = await proc.exited;
      const output = `${stdout}\n${stderr}`;
      expect(status, output).toBe(1);
      expect(output).toContain('Cannot start in production');
      expect(output).toContain('SESSION_SECRET');
      expect(output).toContain('DEMO_PASSWORD');
      expect(output).toContain('PUBLIC_ORIGIN');
      expect(output).not.toContain('received undefined');
      expect(output).not.toContain('at parseEnv');
      expect(output).not.toContain('Listening on');
    } finally {
      await writeFile(envPath, saved);
    }
  });

  test('dev server boots with no .env and the login page shows the password', async () => {
    const envPath = join(dest, '.env');
    const saved = await readFile(envPath, 'utf8');
    await rm(envPath);
    const port = 21000 + Math.floor(Math.random() * 2000);
    const proc = Bun.spawn(
      [
        process.execPath,
        'run',
        'dev',
        '--',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      {
        cwd: dest,
        stdout: 'pipe',
        stderr: 'pipe',
        env: childEnv(),
      },
    );
    let logs = '';
    const stdoutTask = new Response(proc.stdout).text().then((text) => {
      logs += text;
    });
    const stderrTask = new Response(proc.stderr).text().then((text) => {
      logs += text;
    });
    try {
      let html = '';
      let status = 0;
      for (let i = 0; i < 50; i++) {
        if (proc.exitCode !== null) {
          await Promise.all([stdoutTask, stderrTask]);
          throw new Error(`dev server exited ${proc.exitCode}\n${logs}`);
        }
        try {
          const response = await fetch(`http://127.0.0.1:${port}/login`);
          status = response.status;
          html = await response.text();
          if (status === 200 && html.includes('<code>demo</code>')) break;
        } catch {
          // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (status !== 200 || !html.includes('<code>demo</code>')) {
        proc.kill();
        await proc.exited;
        await Promise.all([stdoutTask, stderrTask]);
        throw new Error(
          `login page was ${status}\n${html.slice(0, 500)}\n${logs}`,
        );
      }
      expect(html).not.toContain('received undefined');
      expect(html).not.toContain('Invalid environment');
      const riot = await fetch(
        `http://127.0.0.1:${port}/src/islands/login-form.riot?import`,
      );
      const moduleText = await riot.text();
      expect(riot.status, moduleText.slice(0, 200)).toBe(200);
      expect(moduleText).toContain('export');
      const icon = await fetch(
        `http://127.0.0.1:${port}/src/cabinet/icons/dashboard.svg?import&raw`,
      );
      expect(icon.status, await icon.text()).toBe(200);
    } finally {
      proc.kill();
      await proc.exited;
      await Promise.all([stdoutTask, stderrTask]);
      await writeFile(envPath, saved);
    }
    expect(logs).toContain('Demo defaults are in use');
  }, 30_000);
});

describe('spa template', () => {
  test('scaffolds with .env and serves with no extra setup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'riot-spa-'));
    const procRef: { current?: Bun.Subprocess } = {};
    try {
      const kept = await mkdtemp(join(tmpdir(), 'riot-spa-keep-'));
      await writeFile(
        join(kept, '.env'),
        'VITE_APP_AVATAR_URL=https://example.com/kept.png\n',
      );
      await writeFile(join(kept, 'keep.txt'), 'stay\n');
      const forced = await scaffold([
        kept,
        '--template',
        'spa',
        '--force',
        '--no-install',
      ]);
      expect(forced.status, forced.stderr).toBe(0);
      expect(await readFile(join(kept, '.env'), 'utf8')).toContain(
        'example.com/kept.png',
      );
      expect(forced.stdout).not.toContain('cp .env.example');
      await rm(kept, { recursive: true, force: true });

      const result = await scaffold([dir, '--template', 'spa', '--no-install']);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain('cp .env.example');
      const envText = await readFile(join(dir, '.env'), 'utf8');
      expect(envText).toContain('VITE_APP_AVATAR_URL=');
      await symlink(spaModules, join(dir, 'node_modules'), 'dir');

      const port = 23000 + Math.floor(Math.random() * 2000);
      const proc = Bun.spawn(
        [
          process.execPath,
          'run',
          'dev',
          '--',
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--strictPort',
        ],
        {
          cwd: dir,
          stdout: 'pipe',
          stderr: 'pipe',
          env: childEnv(),
        },
      );
      procRef.current = proc;
      let status = 0;
      let html = '';
      for (let i = 0; i < 50; i++) {
        if (proc.exitCode !== null) {
          const stderr = await new Response(proc.stderr).text();
          throw new Error(`spa dev exited ${proc.exitCode}\n${stderr}`);
        }
        try {
          const response = await fetch(`http://127.0.0.1:${port}/`);
          status = response.status;
          html = await response.text();
          if (status === 200) break;
        } catch {
          // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(status, html.slice(0, 400)).toBe(200);
      expect(html).toContain('RiotJS App');
      expect(html).toContain('/src/main.ts');
    } finally {
      procRef.current?.kill();
      if (procRef.current) await procRef.current.exited;
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
