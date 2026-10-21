#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const templateDir = resolve(here, '..', 'template')

const usage = `create-riot-app — демо Riot.js (Bun + Vite + TypeScript)

Использование:
  bunx create-riot-app <папка>
  bun ./bin/create-riot-app.ts <папка>
  bun create ./template <папка>

Опции:
  --force        скопировать в непустую папку
  --no-install   не запускать bun install
  -h, --help     эта справка
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
  fail('Укажите папку нового проекта.')
}

const dest = resolve(process.cwd(), destArg)
if (dest === templateDir) {
  fail('Нельзя генерировать проект поверх каталога template.')
}

try {
  const existing = await stat(dest)
  if (!existing.isDirectory()) fail(`${dest} уже существует и это не папка.`)
  const entries = (await readdir(dest)).filter((name) => name !== '.git')
  if (entries.length > 0 && !force) {
    fail(`Папка ${dest} не пуста. Укажите другую папку или --force.`)
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

console.log(`Проект создан: ${dest}`)

if (!noInstall) {
  console.log('Устанавливаю зависимости через Bun…')
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
Дальше:
  cd ${folder}
  bun run dev      # http://localhost:5173
  bun run build    # сборка в dist/
  bun run preview  # посмотреть прод-сборку
`)
