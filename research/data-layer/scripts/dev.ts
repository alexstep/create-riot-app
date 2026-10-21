export {}

const server = Bun.spawn(['bun', '--watch', 'src/server/index.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
  env: { ...process.env, PORT: '4317', CLEAN_UPLOADS: process.env.CLEAN_UPLOADS ?? '0' },
})
const web = Bun.spawn(['bun', 'vite', '--port', '5173', '--strictPort'], {
  stdout: 'inherit',
  stderr: 'inherit',
  env: { ...process.env, API_PORT: '4317' },
})

function stop() {
  server.kill()
  web.kill()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
await Promise.race([server.exited, web.exited])
stop()
