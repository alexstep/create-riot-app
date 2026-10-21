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
            // `exclude` replaces the plugin defaults, so this list keeps them.
            // `.riot` and `.svg` are modules. Without them here, Hono answers
            // the request with "Not found", the login form never hydrates,
            // and cabinet icons do not load.
            exclude: [
              /.*\.css$/,
              /.*\.ts$/,
              /.*\.tsx$/,
              /.*\.mdx?$/,
              /^\/@.+$/,
              /\?t=\d+$/,
              /^\/favicon\.ico$/,
              /^\/static\/.+/,
              /^\/node_modules\/.*/,
              /^\/\.vite\/.*/,
              /.*\.svelte$/,
              /.*\.vue$/,
              /.*\.js$/,
              /.*\.jsx$/,
              /.*\.mjs$/,
              /.*\.riot$/,
              /.*\.svg$/,
            ],
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
