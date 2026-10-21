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

async function cacheText(cache: string): Promise<string> {
  const names = await readdir(cache);
  const parts: string[] = [];
  for (const name of names) {
    parts.push(await readFile(join(cache, name), 'latin1'));
  }
  return parts.join('\n');
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
    const cached = await cacheText(cache);
    expect(cached).toContain('riot-file:src/');
    expect(cached).not.toContain(first);

    await rm(first, { recursive: true, force: true });

    const secondRun = await runTests(second, cache);
    expect(secondRun.status, secondRun.output).toBe(0);
    expect(secondRun.output).not.toContain('ENOENT');
    expect(secondRun.output).not.toContain(first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
