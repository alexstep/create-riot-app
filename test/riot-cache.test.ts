import { expect, test } from 'bun:test';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repo = resolve(import.meta.dir, '..');
const template = join(repo, 'templates/fullstack');

function childEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ['HOME', 'USER', 'TMPDIR', 'LANG', 'SHELL']) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  env.PATH = `${dirname(process.execPath)}:${process.env.PATH ?? ''}`;
  return { ...env, ...extra };
}

async function copyTemplate(dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const pack = Bun.spawn(
    [
      'tar',
      '-C',
      template,
      '--exclude=node_modules',
      '--exclude=dist',
      '--exclude=tmp',
      '-cf',
      '-',
      '.',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const unpack = Bun.spawn(['tar', '-C', dest, '-xf', '-'], {
    stdin: pack.stdout,
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const [packCode, unpackCode, packErr, unpackErr] = await Promise.all([
    pack.exited,
    unpack.exited,
    new Response(pack.stderr).text(),
    new Response(unpack.stderr).text(),
  ]);
  if (packCode !== 0 || unpackCode !== 0) {
    throw new Error(
      `copy failed ${packCode}/${unpackCode}\n${packErr}\n${unpackErr}`,
    );
  }
}

async function runTests(
  cwd: string,
  cache: string,
): Promise<{ status: number; output: string }> {
  const proc = Bun.spawn([process.execPath, 'test'], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: childEnv({ BUN_RUNTIME_TRANSPILER_CACHE_PATH: cache }),
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { status, output: `${stdout}\n${stderr}` };
}

async function cacheHas(cache: string, needle: string): Promise<boolean> {
  const names = await readdir(cache);
  for (const name of names) {
    const data = await readFile(join(cache, name));
    if (data.includes(needle)) return true;
  }
  return false;
}

const tagTest = `import { expect, test } from 'bun:test';
import Drawer from '../src/cabinet/components/drawer.riot';
import LoginForm from '../src/islands/login-form.riot';

test('riot tags load', () => {
  expect(Drawer).toBeTruthy();
  expect(LoginForm).toBeTruthy();
});
`;

test('a second copy does not reuse absolute riot paths from a deleted one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'riot-cache-'));
  const cache = join(root, 'transpiler');
  const first = join(root, 'first');
  const second = join(root, 'second');
  await mkdir(cache, { recursive: true });
  try {
    const pkg = JSON.parse(
      await readFile(join(template, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.dev ?? '').not.toContain('riot-loader');
    expect(pkg.scripts?.build ?? '').not.toContain('riot-loader');
    expect(pkg.scripts?.start ?? '').not.toContain('riot-loader');
    const bunfig = await readFile(join(template, 'bunfig.toml'), 'utf8');
    expect(bunfig).toContain('[test]');
    expect(bunfig).toContain('./scripts/riot-loader.ts');
    const vite = await readFile(join(template, 'vite.config.ts'), 'utf8');
    expect(vite).not.toContain('riot-loader');

    await copyTemplate(first);
    await copyTemplate(second);
    await writeFile(join(first, 'test/load-tags.test.ts'), tagTest);
    await writeFile(join(second, 'test/load-tags.test.ts'), tagTest);
    await symlink(join(template, 'node_modules'), join(first, 'node_modules'));
    await symlink(
      join(template, 'node_modules'),
      join(second, 'node_modules'),
    );

    const firstRun = await runTests(first, cache);
    expect(firstRun.status, firstRun.output).toBe(0);
    expect(await cacheHas(cache, 'riot-file:src/')).toBe(true);
    expect(await cacheHas(cache, first)).toBe(false);

    await rm(first, { recursive: true, force: true });

    const secondRun = await runTests(second, cache);
    expect(secondRun.status, secondRun.output).toBe(0);
    expect(secondRun.output).not.toContain('ENOENT');
    expect(secondRun.output).not.toContain(first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

// The loader shipped in 3.1.1. Its compiled output is what a machine that
// already ran `bun test` still has in ~/.bun/install/cache/@t@.
const loader311 = `import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { compile } from '@riotjs/compiler';
import { plugin } from 'bun';

function rewriteRelativeImports(code: string, dir: string): string {
  return code.replace(
    /(from\\s+|import\\s*\\(\\s*|import\\s+)(['"])(\\.[^'"]+)\\2/g,
    (_match, prefix: string, quote: string, spec: string) => {
      const path = resolve(dir, spec);
      return \`\${prefix}\${quote}\${path}\${quote}\`;
    },
  );
}

plugin({
  name: 'riot',
  setup(build) {
    build.onResolve({ filter: /\\.riot$/ }, (args) => {
      const from = args.importer
        ? dirname(args.importer.replace(/^riot:/, ''))
        : args.resolveDir || process.cwd();
      const path = isAbsolute(args.path) ? args.path : resolve(from, args.path);
      return { path, namespace: 'riot' };
    });
    build.onLoad({ filter: /.*/, namespace: 'riot' }, (args) => {
      const result = compile(readFileSync(args.path, 'utf8'), {
        file: args.path,
      });
      return {
        contents: rewriteRelativeImports(result.code, dirname(args.path)),
        loader: 'ts',
      };
    });
  },
});
`;

const poisonTags = `import { expect, test } from 'bun:test';
import About from '../src/pages/about.riot';
import Subscribe from '../src/islands/subscribe-form.riot';
import Drawer from '../src/cabinet/components/drawer.riot';

test('tags from an older loader', () => {
  expect(About).toBeTruthy();
  expect(Subscribe).toBeTruthy();
  expect(Drawer).toBeTruthy();
});
`;

test('bun run test ignores a global cache poisoned by the 3.1.1 loader', async () => {
  const root = await mkdtemp(join(tmpdir(), 'riot-poison-'));
  const poisonDir = join(root, 'global-cache');
  const older = join(root, 'older');
  const current = join(root, 'current');
  await mkdir(poisonDir, { recursive: true });
  const sharedModules = join(template, 'node_modules');
  const localCache = join(sharedModules, '.cache/bun-transpiler');
  try {
    await rm(localCache, { recursive: true, force: true });
    await copyTemplate(older);
    await writeFile(join(older, 'scripts/riot-loader.ts'), loader311);
    await writeFile(join(older, 'test/poison-tags.test.ts'), poisonTags);
    await symlink(sharedModules, join(older, 'node_modules'));

    const seeded = await runTests(older, poisonDir);
    expect(seeded.status, seeded.output).toBe(0);
    expect(await cacheHas(poisonDir, older)).toBe(true);

    await rm(older, { recursive: true, force: true });

    await copyTemplate(current);
    await writeFile(join(current, 'test/poison-tags.test.ts'), poisonTags);
    await symlink(sharedModules, join(current, 'node_modules'));
    const script = JSON.parse(
      await readFile(join(current, 'package.json'), 'utf8'),
    ) as { scripts?: { test?: string } };
    expect(script.scripts?.test).toContain('scripts/run-tests.ts');
    const poisonedBefore = (await readdir(poisonDir)).length;

    const proc = Bun.spawn([process.execPath, 'run', 'test'], {
      cwd: current,
      stdout: 'pipe',
      stderr: 'pipe',
      env: childEnv({ BUN_RUNTIME_TRANSPILER_CACHE_PATH: poisonDir }),
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const output = `${stdout}\n${stderr}`;
    expect(status, output).toBe(0);
    expect(output).not.toContain('ENOENT');
    expect(output).not.toContain(older);

    expect((await readdir(poisonDir)).length).toBe(poisonedBefore);
    const localNames = await readdir(localCache);
    expect(localNames.some((name) => name.endsWith('.pile'))).toBe(true);
    expect(await cacheHas(localCache, 'riot-file:src/')).toBe(true);
    expect(await cacheHas(localCache, older)).toBe(false);
    expect(await cacheHas(poisonDir, older)).toBe(true);
  } finally {
    await rm(localCache, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
