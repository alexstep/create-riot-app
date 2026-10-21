import { createApp } from './app';
import { type AppEnv, parseEnv } from './env';

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

function readEnv(): AppEnv {
  try {
    return parseEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const env = readEnv();
const app = createApp(env);

let server: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({
    hostname: '0.0.0.0',
    port: env.PORT,
    fetch: app.fetch,
  });
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EADDRINUSE') {
    console.error(
      `Port ${env.PORT} is already in use. Set PORT in .env or stop the other process.`,
    );
    process.exit(1);
  }
  throw error;
}

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
