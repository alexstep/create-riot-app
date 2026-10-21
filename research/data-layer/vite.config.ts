import { defineConfig } from 'vite'
import { riotPlugin } from './riot-plugin.ts'

const api = process.env.API_PORT ?? '4317'

export default defineConfig({
  plugins: [riotPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${api}`,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.host) proxyReq.setHeader('x-forwarded-host', req.headers.host)
            proxyReq.setHeader('x-forwarded-proto', 'http')
          })
        },
      },
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    outDir: 'dist',
  },
})
