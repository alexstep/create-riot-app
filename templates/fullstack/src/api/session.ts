import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../server/env';

export interface SessionUser {
  email: string;
}

const COOKIE = 'session';
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

export interface SessionStore {
  login(email: string): string;
  read(id: string | undefined): SessionUser | null;
  destroy(id: string | undefined): void;
  attempt(key: string): boolean;
}

export function createSessionStore(): SessionStore {
  const users = new Map<string, SessionUser>();
  const attempts = new Map<string, number[]>();

  return {
    login(email) {
      const id = crypto.randomUUID();
      users.set(id, { email });
      return id;
    },
    read(id) {
      if (!id) return null;
      return users.get(id) ?? null;
    },
    destroy(id) {
      if (id) users.delete(id);
    },
    attempt(key) {
      const now = Date.now();
      const recent = (attempts.get(key) ?? []).filter(
        (time) => now - time < WINDOW_MS,
      );
      if (recent.length >= MAX_ATTEMPTS) {
        attempts.set(key, recent);
        return false;
      }
      recent.push(now);
      attempts.set(key, recent);
      return true;
    },
  };
}

function seal(secret: string, id: string): string {
  const mac = createHmac('sha256', secret).update(id).digest('base64url');
  return `${id}.${mac}`;
}

function openToken(
  secret: string,
  token: string | undefined,
): string | undefined {
  if (!token) return undefined;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const id = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(id).digest('base64url');
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return undefined;
  return id;
}

export function sessionIdFrom(c: Context, secret: string): string | undefined {
  const header = c.req.header('authorization');
  const bearer = header ? /^Bearer\s+(\S+)$/i.exec(header)?.[1] : undefined;
  return openToken(secret, getCookie(c, COOKIE) ?? bearer);
}

export function writeSessionCookie(c: Context, env: AppEnv, id: string): void {
  setCookie(c, COOKIE, seal(env.SESSION_SECRET, id), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
  });
}

export function clearSessionCookie(c: Context, env: AppEnv): void {
  deleteCookie(c, COOKIE, {
    path: '/',
    secure: env.NODE_ENV === 'production',
  });
}

export function clientKey(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}
