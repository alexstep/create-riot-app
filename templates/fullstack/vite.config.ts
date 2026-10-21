import devServer from '@hono/vite-dev-server';
import bunAdapter from '@hono/vite-dev-server/bun';
import { type ConfigEnv, defineConfig } from 'vite';
import { riotPlugin } from './riot-plugin.ts';

export default defineConfig(({ isSsrBuild }: ConfigEnv) => ({
  plugins: [
    riotPlugin(),
    ...(isSsrBuild
      ? []
      : [
          devServer({
            entry: 'src/server/dev.ts',
            adapter: bunAdapter(),
          }),
        ]),
  ],
  server: {
    port: 3000,
    strictPort: false,
  },
  build: isSsrBuild
    ? {
        outDir: 'dist/server',
        emptyOutDir: false,
        ssr: true,
        rollupOptions: {
          input: 'src/server/index.ts',
        },
      }
    : {
        outDir: 'dist/client',
        emptyOutDir: true,
        manifest: true,
        sourcemap: true,
        rollupOptions: {
          input: {
            app: 'app.html',
            islands: 'src/islands/client.ts',
          },
        },
      },
}));
