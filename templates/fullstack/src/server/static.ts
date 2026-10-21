import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { Context } from 'hono';

const types: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

function contentType(file: string): string {
  const dot = file.slice(file.lastIndexOf('.'));
  return types[dot] ?? 'application/octet-stream';
}

export function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

export function isCabinetPath(path: string): boolean {
  return path === '/app' || path.startsWith('/app/');
}

export function resolveStatic(root: string, urlPath: string): string | null {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '');
  } catch {
    return null;
  }
  if (!decoded.startsWith('/')) return null;
  if (decoded === '/.vite' || decoded.startsWith('/.vite/')) return null;
  const base = resolve(root);
  const full = resolve(base, `.${decoded}`);
  if (full !== base && !full.startsWith(`${base}${sep}`)) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  return full;
}

export function staticResponse(
  c: Context,
  file: string,
  immutable: boolean,
): Response {
  const stat = statSync(file);
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  c.header('ETag', etag);
  c.header(
    'Cache-Control',
    immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  );
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  c.header('Content-Type', contentType(file));
  return c.body(createReadStream(file) as unknown as ReadableStream);
}
