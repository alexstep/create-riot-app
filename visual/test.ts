import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { chromium, type Browser, type Page } from 'playwright'
import { PNG } from 'pngjs'

const root = dirname(fileURLToPath(import.meta.url))
const baselinesDir = join(root, 'baselines')
const actualDir = join(root, 'actual')
const diffDir = join(root, 'diff')

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const

const SCENES = ['dashboard', 'drawer', 'groups', 'settings'] as const

// Anti-aliased text is ignored by pixelmatch. Anything above this share of
// the viewport is a real layout regression.
const MAX_MISMATCH = 0.002

const args = process.argv.slice(2)
const update = args.includes('--update')
const updateDark = args.includes('--update-dark')
const urlIndex = args.indexOf('--url')
const givenUrl = urlIndex >= 0 ? args[urlIndex + 1] : undefined

if (update && !givenUrl) {
  console.error('Для --update нужен --url со старым или новым сервером.')
  process.exit(1)
}

const AUDIO_HOOK = `
  window.__audioCalls = []
  const __origPlay = HTMLAudioElement.prototype.play
  HTMLAudioElement.prototype.play = function () {
    window.__audioCalls.push(this.currentSrc || this.src || '')
    return __origPlay.apply(this, arguments)
  }
`

const FREEZE_CSS = `*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important;scroll-behavior:auto !important;}`

type Scene = (typeof SCENES)[number]
type ViewportName = keyof typeof VIEWPORTS

const consoleErrors: string[] = []

function track(page: Page) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message)
  })
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images].map((img) =>
        img.decode?.().catch(() => undefined) ?? Promise.resolve(),
      ),
    )
    const avatar = document.querySelector('.avatar')
    if (!(avatar instanceof HTMLElement)) return
    const match = getComputedStyle(avatar).backgroundImage.match(/url\(["']?(.*?)["']?\)/)
    const src = match?.[1]
    if (!src) return
    await new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => resolve()
      image.src = src
    })
  })
}

async function clickAny(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if ((await locator.count()) > 0) {
      await locator.click()
      return
    }
  }
  throw new Error(`Не найден элемент: ${selectors.join(' | ')}`)
}

async function openDrawer(page: Page) {
  if (await page.locator('.drawer-wrap.show').count()) return
  await page.locator('.toggle-drawer').click()
  await page.locator('.drawer-wrap.show').waitFor({ timeout: 4000 })
}

async function gotoApp(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'load' })
  await page.locator('#topbar h1').waitFor()
  await settle(page)
}

async function freezeMotion(page: Page) {
  await page.addStyleTag({ content: FREEZE_CSS })
}

async function showGroups(page: Page) {
  await openDrawer(page)
  await clickAny(page, ['a[href="/groups/"]', 'a[href="/groups"]'])
  await page.waitForFunction(
    () => document.querySelector('#topbar h1')?.textContent?.trim().toLowerCase() === 'groups',
  )
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.groups-list .group').length >= 1 ||
      document.querySelector('.no-groups'),
    undefined,
    { timeout: 15000 },
  )
  await page.locator('.drawer-wrap:not(.show)').waitFor()
  await settle(page)
}

async function showSettings(page: Page) {
  await openDrawer(page)
  await clickAny(page, ['a[href="/settings/"]', 'a[href="/settings"]'])
  await page.getByRole('button', { name: 'Some option' }).waitFor()
  await page.locator('.drawer-wrap:not(.show)').waitFor()
  await settle(page)
}

async function capture(page: Page, scene: Scene): Promise<Buffer> {
  if (scene === 'dashboard') {
    await page.locator('#screen_dashboard h1').waitFor()
  }
  if (scene === 'drawer') {
    await openDrawer(page)
    await page.locator('.user-info .name').waitFor()
  }
  if (scene === 'groups') await showGroups(page)
  if (scene === 'settings') await showSettings(page)
  await settle(page)
  return page.screenshot({ animations: 'disabled', caret: 'hide' })
}

async function checkBehavior(browser: Browser, url: string) {
  const page = await browser.newPage({
    viewport: VIEWPORTS.desktop,
    deviceScaleFactor: 1,
    colorScheme: 'light',
  })
  track(page)
  await page.addInitScript(AUDIO_HOOK)
  await gotoApp(page, url)

  const duration = await page.evaluate(() => getComputedStyle(document.querySelector('#drawer')!).transitionDuration)
  if (!/0\.3s|300ms/.test(duration)) {
    throw new Error(`У #drawer нет анимации 0.3s, сейчас: ${duration}`)
  }

  await page.locator('.toggle-drawer').click()
  const frames: string[] = []
  for (let i = 0; i < 8; i++) {
    frames.push(
      await page.evaluate(() => getComputedStyle(document.querySelector('#drawer')!).transform),
    )
    await page.waitForTimeout(40)
  }
  const distinct = new Set(frames)
  if (distinct.size < 2) {
    throw new Error(`Drawer не анимировался, кадры: ${frames.join(' | ')}`)
  }
  await page.locator('.drawer-wrap.show').waitFor()

  const calls = async () => page.evaluate(() => (window as unknown as { __audioCalls: string[] }).__audioCalls)
  const afterOpen = await calls()
  if (!afterOpen.some((src) => src.includes('tick'))) {
    throw new Error(`Открытие drawer не запустило tick: ${afterOpen.join(', ') || 'пусто'}`)
  }

  await clickAny(page, ['a[href="/groups/"]', 'a[href="/groups"]'])
  await page.waitForFunction(
    () => document.querySelector('#topbar h1')?.textContent?.trim().toLowerCase() === 'groups',
  )
  await page.waitForFunction(
    () => document.querySelectorAll('.groups-list .group').length >= 1 || document.querySelector('.no-groups'),
    undefined,
    { timeout: 15000 },
  )
  const afterNav = await calls()
  if (afterNav.filter((src) => src.includes('tick')).length < 2) {
    throw new Error(`Клик по пункту меню не запустил tick: ${afterNav.join(', ')}`)
  }

  await openDrawer(page)
  await clickAny(page, ['a[href="/settings/"]', 'a[href="/settings"]'])
  await page.locator('[data-choice="dark"]').click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark' && localStorage.getItem('theme') === 'dark')
  await page.reload({ waitUntil: 'load' })
  await page.locator('[data-choice="system"]').waitFor()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.locator('[data-choice="system"]').click()
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-theme') && localStorage.getItem('theme') === null)

  await page.close()
}

function nameOf(viewport: ViewportName, scene: Scene) {
  return `${viewport}-${scene}.png`
}

async function compareOne(baselineRoot: string, actualRoot: string, diffRoot: string, viewport: ViewportName, scene: Scene, actual: Buffer) {
  const name = nameOf(viewport, scene)
  await writeFile(join(actualRoot, name), actual)
  const baselinePath = join(baselineRoot, name)
  let baseline: Buffer
  try {
    baseline = await readFile(baselinePath)
  } catch {
    throw new Error(`Нет эталона ${name}. Снимите его: bun test.ts --update --url <старый сервер>`)
  }
  const expected = PNG.sync.read(baseline)
  const received = PNG.sync.read(actual)
  if (expected.width !== received.width || expected.height !== received.height) {
    return {
      name,
      mismatch: 1,
      strict: 1,
      pixels: expected.width * expected.height,
      note: `размер ${received.width}x${received.height} против ${expected.width}x${expected.height}`,
    }
  }
  const diff = new PNG({ width: expected.width, height: expected.height })
  const pixels = pixelmatch(expected.data, received.data, diff.data, expected.width, expected.height, {
    threshold: 0.1,
    includeAA: false,
  })
  const strict = pixelmatch(expected.data, received.data, undefined, expected.width, expected.height, {
    threshold: 0,
    includeAA: true,
  })
  await writeFile(join(diffRoot, name), PNG.sync.write(diff))
  const total = expected.width * expected.height
  return {
    name,
    mismatch: pixels / total,
    strict: strict / total,
    pixels,
    note: '',
  }
}

let devServer: ReturnType<typeof Bun.spawn> | undefined

async function ensureServer(): Promise<string> {
  if (givenUrl) return givenUrl
  const probe = await fetch('http://127.0.0.1:5173/').then((r) => r.ok).catch(() => false)
  if (probe) return 'http://127.0.0.1:5173/'
  devServer = Bun.spawn(['bun', 'run', '--cwd', join(root, '..', 'template'), 'dev', '--host', '127.0.0.1', '--port', '5173'], {
    stdout: 'ignore',
    stderr: 'pipe',
    env: { ...process.env, PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}` },
  })
  for (let i = 0; i < 40; i++) {
    const ok = await fetch('http://127.0.0.1:5173/').then((r) => r.ok).catch(() => false)
    if (ok) return 'http://127.0.0.1:5173/'
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Dev-сервер Vite не поднялся на :5173')
}

const url = await ensureServer()
await mkdir(baselinesDir, { recursive: true })
await mkdir(actualDir, { recursive: true })
await mkdir(diffDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--font-render-hinting=none', '--disable-lcd-text'],
})

const HIDE_THEME_CONTROL = '[data-theme-control]{display:none !important}'

async function runShots(theme: 'light' | 'dark', writeBaseline: boolean) {
  const baselineRoot = theme === 'dark' ? join(baselinesDir, 'dark') : baselinesDir
  const actualRoot = theme === 'dark' ? join(actualDir, 'dark') : actualDir
  const diffRoot = theme === 'dark' ? join(diffDir, 'dark') : diffDir
  await mkdir(baselineRoot, { recursive: true })
  await mkdir(actualRoot, { recursive: true })
  await mkdir(diffRoot, { recursive: true })
  const rows: { name: string; mismatch: number; strict: number; pixels: number; note: string }[] = []

  for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
    const page = await browser.newPage({
      viewport: VIEWPORTS[viewport],
      deviceScaleFactor: 1,
      colorScheme: theme,
    })
    track(page)
    await page.addInitScript(AUDIO_HOOK)
    await page.addInitScript(`try { localStorage.setItem('theme', '${theme}') } catch (e) {}`)
    for (const scene of SCENES) {
      if (scene === 'dashboard') {
        await gotoApp(page, url)
        await freezeMotion(page)
        if (theme === 'light') await page.addStyleTag({ content: HIDE_THEME_CONTROL })
      }
      const png = await capture(page, scene)
      const name = `${theme} ${nameOf(viewport, scene)}`
      if (writeBaseline) {
        await writeFile(join(baselineRoot, nameOf(viewport, scene)), png)
        console.log(`эталон ${name}`)
      } else {
        const row = await compareOne(baselineRoot, actualRoot, diffRoot, viewport, scene, png)
        rows.push({ ...row, name })
      }
    }
    await page.close()
  }
  return rows
}

try {
  console.log(`Поведение: ${url}`)
  await checkBehavior(browser, url)

  const lightRows = await runShots('light', update)
  const darkRows = await runShots('dark', updateDark)
  const rows = [...lightRows, ...darkRows]

  if (consoleErrors.length) {
    console.error('Ошибки консоли:')
    for (const line of consoleErrors) console.error('  ' + line)
    throw new Error(`Ошибок в консоли: ${consoleErrors.length}`)
  }
  console.log('Консоль: ошибок нет. Анимация drawer и звук tick проверены.')

  if (!update) {
    console.log('')
    console.log('| Экран | Порог 0.1 | Строгое | Пикселей |')
    console.log('| --- | ---: | ---: | ---: |')
    let failed = false
    for (const row of rows) {
      const percent = (row.mismatch * 100).toFixed(3)
      const strict = (row.strict * 100).toFixed(3)
      console.log(`| ${row.name} | ${percent}% | ${strict}% | ${row.pixels}${row.note ? ` (${row.note})` : ''} |`)
      if (row.mismatch > MAX_MISMATCH) failed = true
    }
    if (failed) {
      console.error(`Есть экраны с расхождением больше ${MAX_MISMATCH * 100}%`)
      process.exitCode = 1
    }
  }
} finally {
  await browser.close()
  devServer?.kill()
}
