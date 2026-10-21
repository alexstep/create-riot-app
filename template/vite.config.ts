import { defineConfig } from 'vite'
import { riotPlugin } from './riot-plugin.ts'

export default defineConfig({
  plugins: [riotPlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    outDir: 'dist',
  },
})
