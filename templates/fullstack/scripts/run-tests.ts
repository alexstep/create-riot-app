import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Bun's transpiler cache is content-addressed and global
// (~/.bun/install/cache/@t@). Entries written by 3.1.0 and 3.1.1 still hold
// absolute paths for source that 3.1.2 did not change, so a later `bun test`
// reopens a deleted project. The directory is chosen before .env and preload
// run, so the test process has to be started with the variable already set.
// This path is per project and works the same on macOS, Linux, and Windows.
const cacheDir = resolve(process.cwd(), 'node_modules/.cache/bun-transpiler');
mkdirSync(cacheDir, { recursive: true });

const child = spawn(process.execPath, ['test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: cacheDir,
  },
});

child.on('error', () => {
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
