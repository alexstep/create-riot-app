export const CABINET_SCREENS = [
  'dashboard',
  'groups',
  'settings',
  'records',
] as const;

export type CabinetScreen = (typeof CABINET_SCREENS)[number];

const SCREEN_SET = new Set<string>(CABINET_SCREENS);

/** `/app` and `/app/*`, including a doubled `/app/app/...` prefix. `/app.html` is not a screen. */
export function isCabinetPath(path: string): boolean {
  const bare = path.split(/[?#]/)[0] ?? '';
  return bare === '/app' || bare.startsWith('/app/');
}

/**
 * One canonical cabinet URL: `/app/<screen>`.
 * Repeated `/app` segments collapse. Anything else is the dashboard.
 */
export function normalizeCabinetPath(input: string): string {
  return `/app/${screenName(input)}`;
}

/** Login `next` and expired-session returns. Absolute and protocol-relative URLs stay on the dashboard. */
export function cabinetReturnPath(input: string): string {
  if (
    !input ||
    input.includes('\\') ||
    input.includes('://') ||
    input.startsWith('//')
  ) {
    return '/app/dashboard';
  }
  return normalizeCabinetPath(input);
}

function screenName(input: string): CabinetScreen {
  if (input.includes('\\')) return 'dashboard';
  let path = input.trim();
  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return 'dashboard';
    }
  } else {
    path = (path.split(/[?#]/)[0] ?? '').trim();
  }
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+$/, '') || '/';
  let guard = 0;
  while ((path === '/app' || path.startsWith('/app/')) && guard < 8) {
    path = path === '/app' ? '/' : path.slice(4);
    if (!path.startsWith('/')) path = `/${path}`;
    guard += 1;
  }
  const name = path.replace(/^\/+/, '').split('/')[0] ?? '';
  return SCREEN_SET.has(name) ? (name as CabinetScreen) : 'dashboard';
}
