import { existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

declare const Bun: {
  serve(options: {
    hostname: string;
    port: number;
    fetch: (request: Request) => Response;
  }): { port: number };
  file(path: string): Blob;
};

const root = resolve(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 4173);

function fileInsideRoot(urlPath: string): string | null {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '');
  } catch {
    return null;
  }
  if (!decoded.startsWith('/')) return null;
  const full = resolve(root, `.${decoded}`);
  if (full !== root && !full.startsWith(`${root}${sep}`)) return null;
  return full;
}

const server = Bun.serve({
  hostname: '0.0.0.0',
  port,
  fetch(request) {
    const path = fileInsideRoot(new URL(request.url).pathname);
    const file =
      path && existsSync(path) && statSync(path).isFile()
        ? path
        : resolve(root, 'index.html');
    if (!existsSync(file)) return new Response('Not found', { status: 404 });
    const asset = file.includes(`${sep}assets${sep}`);
    const html = file.endsWith('.html');
    return new Response(Bun.file(file), {
      headers: {
        'Cache-Control': html
          ? 'no-cache'
          : asset
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
      },
    });
  },
});

console.log(`Listening on http://localhost:${server.port}`);
