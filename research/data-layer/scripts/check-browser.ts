/**
 * Playwright-free check: two Chrome tabs share one hub, and a curl update
 * shows up in both. Requires the server on 127.0.0.1:4317 and google-chrome.
 */
export {}
const port = 9223
const app = 'http://127.0.0.1:4317/'
const view = `(() => {
  const name = document.querySelector('input[name="name"]')
  const log = [...document.querySelectorAll('.log li')].map((li) => li.textContent)
  const resources = performance.getEntriesByType('resource').map((entry) => entry.name).filter((url) => url.includes('/api/'))
  return { name: name && 'value' in name ? name.value : '', log, resources }
})()`
const chrome = Bun.spawn([
  'google-chrome',
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${port}`,
  '--user-data-dir=/tmp/riot-data-layer-chrome',
  'about:blank',
], { stdout: 'ignore', stderr: 'pipe' })

await waitFor(`http://127.0.0.1:${port}/json/version`)
const a = await open(app)
const b = await open(app)
await sleep(600)
const before = {
  a: await evalJson(a, view),
  b: await evalJson(b, view),
}
const login = Bun.spawn(['curl', '-sf', '-c', '/tmp/riot-data-layer-cookies', '-b', '/tmp/riot-data-layer-cookies', '-X', 'POST', 'http://127.0.0.1:4317/api/session', '-H', 'content-type: application/json', '-d', '{}'], { stdout: 'ignore' })
await login.exited
const put = Bun.spawn(['curl', '-sf', '-b', '/tmp/riot-data-layer-cookies', '-X', 'PUT', 'http://127.0.0.1:4317/api/profile', '-H', 'content-type: application/json', '-d', '{"name":"Grace","email":"grace@example.com","message":"From curl"}'], { stdout: 'pipe' })
const putText = await new Response(put.stdout).text()
if ((await put.exited) !== 0) throw new Error(putText || 'curl profile update failed')
await sleep(400)
const after = {
  a: await evalJson(a, view),
  b: await evalJson(b, view),
}
console.log(JSON.stringify({ before, after }, null, 2))
const ok = after.a?.name === 'Grace' && after.b?.name === 'Grace'
chrome.kill()
if (!ok) {
  console.error('tabs did not both show the curl update')
  process.exit(1)
}

async function open(url: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  const page = await res.json() as { webSocketDebuggerUrl: string }
  return page.webSocketDebuggerUrl
}

async function evalJson(wsUrl: string, expression: string) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve) => { ws.onopen = resolve })
  const id = 1
  const result = new Promise<unknown>((resolve, reject) => {
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: unknown } }; error?: unknown }
      if (msg.id !== id) return
      if (msg.error) reject(msg.error)
      else resolve(msg.result?.result?.value)
    }
  })
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }))
  const value = await result
  ws.close()
  return value as { name?: string; log?: string[]; text?: string }
}

async function waitFor(url: string) {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch { /* retry */ }
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${url}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
