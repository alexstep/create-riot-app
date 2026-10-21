#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templatesRoot = resolve(here, '..', 'templates');
const templateNames = ['fullstack', 'spa'] as const;
type TemplateName = (typeof templateNames)[number];

const usage = `create-riot-app — Riot.js app starter (Bun + Vite + TypeScript)

Usage:
  bunx create-riot-app <directory> [--template fullstack|spa]
  bun create riot-app <directory>
  bun ./bin/create-riot-app.ts <directory>

Options:
  --template <name>  fullstack (default) or spa
  --force            write into a non-empty directory
  --no-install       skip bun install
  -h, --help         show this help

Templates:
  fullstack  One Bun process: Hono API, server-rendered pages, and the client cabinet
  spa        Client-only cabinet (Vite)
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function isTemplateName(value: string): value is TemplateName {
  return (templateNames as readonly string[]).includes(value);
}

async function restoreGitignore(dest: string): Promise<void> {
  const dot = join(dest, '.gitignore');
  for (const name of ['gitignore', '_gitignore']) {
    const source = join(dest, name);
    try {
      await stat(source);
    } catch {
      continue;
    }
    try {
      await stat(dot);
      await rm(source);
    } catch {
      await rename(source, dot);
    }
  }
}

function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'riot-app';
}

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.includes('-h') || args.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const force = args.includes('--force');
const noInstall = args.includes('--no-install');
let template: TemplateName = 'fullstack';
let destArg: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i] ?? '';
  if (arg === '--force' || arg === '--no-install') continue;
  if (arg === '--template' || arg.startsWith('--template=')) {
    const value = arg.startsWith('--template=')
      ? arg.slice('--template='.length)
      : args[++i];
    if (!value || value.startsWith('-')) {
      fail('--template needs a name. Use "fullstack" or "spa".');
    }
    if (!isTemplateName(value)) {
      fail(`Unknown template "${value}". Use "fullstack" or "spa".`);
    }
    template = value;
    continue;
  }
  if (arg.startsWith('-')) fail(`Unknown option "${arg}".`);
  if (destArg) fail('Pass one directory.');
  destArg = arg;
}

if (!destArg) {
  console.log(usage);
  fail('Pass a directory for the new project.');
}

const templateDir = resolve(templatesRoot, template);
const dest = resolve(process.cwd(), destArg);
if (
  dest === templateDir ||
  dest === templatesRoot ||
  dest.startsWith(`${templateDir}${sep}`)
) {
  fail('Refusing to generate a project on top of the template directory.');
}

try {
  const existing = await stat(dest);
  if (!existing.isDirectory())
    fail(`${dest} already exists and is not a directory.`);
  const entries = (await readdir(dest)).filter((name) => name !== '.git');
  if (entries.length > 0 && !force) {
    fail(
      `Directory ${dest} is not empty. Pick another directory or pass --force.`,
    );
  }
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== 'ENOENT') throw error;
}

await mkdir(dest, { recursive: true });
await cp(templateDir, dest, {
  recursive: true,
  filter(source) {
    const rel = relative(templateDir, source);
    if (!rel) return true;
    const parts = rel.split(sep);
    return (
      !parts.includes('node_modules') &&
      !parts.includes('dist') &&
      !parts.includes('.npmignore')
    );
  },
});

const pkgPath = join(dest, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
  name?: string;
  'bun-create'?: unknown;
};
pkg.name = slug(basename(dest));
delete pkg['bun-create'];
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
await restoreGitignore(dest);

console.log(`Project created: ${dest}`);
console.log(`Template: ${template}`);

if (!noInstall) {
  console.log('Installing dependencies with Bun…');
  const install = spawn('bun', ['install'], {
    cwd: dest,
    stdio: 'inherit',
  });
  const code = await new Promise<number>((resolveCode, reject) => {
    install.on('error', reject);
    install.on('close', (status) => resolveCode(status ?? 1));
  });
  if (code !== 0) process.exit(code);
}

const folder = destArg;
if (template === 'spa') {
  console.log(`
Next:
  cd ${folder}
  bun run dev      # http://localhost:5173
  bun run build    # write dist/
  bun run preview  # serve the production build
`);
} else {
  console.log(`
Next:
  cd ${folder}
  cp .env.example .env
  bun run dev      # http://localhost:3000
  bun run build && bun run start
`);
}
