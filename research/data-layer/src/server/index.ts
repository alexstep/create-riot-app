import { existsSync } from 'node:fs'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { createApp } from './app'

const api = await createApp({
  uploadDir: `${process.cwd()}/tmp/uploads`,
  clean: process.env.CLEAN_UPLOADS !== '0',
})

const root = new Hono()
root.route('/', api)

if (existsSync('dist/index.html')) {
  root.use(
    '/assets/*',
    serveStatic({
      root: './dist',
      onFound: (_path, c) => {
        c.header('Cache-Control', 'public, max-age=31536000, immutable')
      },
    }),
  )
  root.use('*', serveStatic({ root: './dist' }))
  root.get('/api/*', (c) => c.json({ error: 'Not found' }, 404))
  root.get('*', serveStatic({ path: './dist/index.html' }))
}

export { root as app }

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 4317)
  Bun.serve({ hostname: '127.0.0.1', port, fetch: root.fetch })
  console.log(`http://127.0.0.1:${port}`)
}
