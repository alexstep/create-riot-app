#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const templateDir = resolve(here, '..', 'template')

const usage = `create-riot-app — Riot.js demo (Bun + Vite + TypeScript)

Usage:
  bunx create-riot-app <directory>
  bun ./bin/create-riot-app.ts <directory>
  bun create ./template <directory>

Options:
  --force        write into a non-empty directory
  --no-install   skip bun install
  -h, --help     show this help
`

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'riot-app'
}

const args = process.argv.slice(2).filter((arg) => arg !== '--')
if (args.includes('-h') || args.includes('--help')) {
  console.log(usage)
  process.exit(0)
}

const force = args.includes('--force')
const noInstall = args.includes('--no-install')
const destArg = args.find((arg) => !arg.startsWith('-'))
if (!destArg) {
  console.log(usage)
  fail('Pass a directory for the new project.')
}

const dest = resolve(process.cwd(), destArg)
if (dest === templateDir) {
  fail('Refusing to generate a project on top of the template directory.')
}

try {
  const existing = await stat(dest)
  if (!existing.isDirectory()) fail(`${dest} already exists and is not a directory.`)
  const entries = (await readdir(dest)).filter((name) => name !== '.git')
  if (entries.length > 0 && !force) {
    fail(`Directory ${dest} is not empty. Pick another directory or pass --force.`)
  }
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code
  if (code !== 'ENOENT') throw error
}

await mkdir(dest, { recursive: true })
await cp(templateDir, dest, {
  recursive: true,
  filter(source) {
    const rel = relative(templateDir, source)
    if (!rel) return true
    const parts = rel.split(sep)
    return !parts.includes('node_modules') && !parts.includes('dist')
  },
})

const pkgPath = join(dest, 'package.json')
const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
  name?: string
  'bun-create'?: unknown
}
pkg.name = slug(basename(dest))
delete pkg['bun-create']
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

console.log(`Project created: ${dest}`)

if (!noInstall) {
  console.log('Installing dependencies with Bun…')
  const install = spawn('bun', ['install'], {
    cwd: dest,
    stdio: 'inherit',
  })
  const code = await new Promise<number>((resolveCode, reject) => {
    install.on('error', reject)
    install.on('close', (status) => resolveCode(status ?? 1))
  })
  if (code !== 0) process.exit(code)
}

const folder = destArg
console.log(`
Next:
  cd ${folder}
  bun run dev      # http://localhost:5173
  bun run build    # write dist/
  bun run preview  # serve the production build
`)
