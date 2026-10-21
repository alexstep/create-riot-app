export type CacheStrategy = 'network-first' | 'cache-first';

/**
 * The service worker only handles same-origin GETs that are not API calls.
 * API GETs live in the hub's Cache Storage. Mutations and other origins are ignored.
 */
export function shouldHandle(
  method: string,
  url: string,
  origin: string,
): boolean {
  if (method !== 'GET') return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin !== origin) return false;
  if (parsed.pathname.startsWith('/api/')) return false;
  return true;
}

export function strategy(pathname: string, mode: string): CacheStrategy {
  if (mode === 'navigate' || pathname === '/' || pathname.endsWith('.html'))
    return 'network-first';
  if (pathname.startsWith('/assets/')) return 'cache-first';
  return 'network-first';
}
