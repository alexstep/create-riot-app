import type { Context } from 'hono';

/**
 * Browser mutations carry Origin and Sec-Fetch-Site. A cross-site form cannot
 * set Sec-Fetch-Site to same-origin, and it cannot omit Origin.
 * curl and server-side tests send neither header, so they are allowed.
 * The session cookie is httpOnly + SameSite=Lax. That is not enough on its own:
 * a top-level cross-site POST is still a classic CSRF on Lax cookies.
 */
export function requestOrigin(c: Context): string {
  const forwarded = c.req.header('x-forwarded-host');
  if (forwarded) {
    const proto = c.req.header('x-forwarded-proto') ?? 'http';
    return `${proto}://${forwarded}`;
  }
  return new URL(c.req.url).origin;
}

export function csrfOk(c: Context): boolean {
  const origin = c.req.header('origin');
  if (origin && origin !== requestOrigin(c)) return false;
  const site = c.req.header('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}
