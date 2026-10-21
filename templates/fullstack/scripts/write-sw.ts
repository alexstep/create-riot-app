import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist/client');
const files: string[] = [];

async function walk(dir: string): Promise<void> {
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walk(full);
      continue;
    }
    const rel = `/${path.relative(dist, full).split(path.sep).join('/')}`;
    if (rel === '/sw.js' || rel.endsWith('.map') || rel.startsWith('/.vite/'))
      continue;
    files.push(rel);
  }
}

await walk(dist);
files.sort();
const hash = createHash('sha256');
for (const rel of files) {
  hash.update(rel);
  hash.update(await readFile(path.join(dist, rel.slice(1))));
}
const id = hash.digest('hex').slice(0, 12);
const built = await Bun.build({
  entrypoints: [path.resolve('src/sw.ts')],
  outdir: dist,
  naming: 'sw.js',
  minify: true,
  define: {
    BUILD_HASH: JSON.stringify(id),
    PRECACHE_JSON: JSON.stringify(JSON.stringify(files)),
  },
});
if (!built.success) {
  console.error(built.logs);
  process.exit(1);
}
console.log(`sw.js shell-${id} (${files.length} files)`);
