import { createApp } from './app';
import { parseEnv } from './env';

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

const env = parseEnv();
const app = createApp(env);
const server = Bun.serve({
  hostname: '0.0.0.0',
  port: env.PORT,
  fetch: app.fetch,
});

let stopping = false;

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await server.stop();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

console.log(`Listening on http://localhost:${server.port}`);
