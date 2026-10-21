import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@riotjs/ssr';
import type { Context } from 'hono';
import { type RiotComponent, type RiotComponentWrapper, register } from 'riot';
import LoginForm from '../islands/login-form.riot';
import SubscribeForm from '../islands/subscribe-form.riot';
import ThemeToggle from '../islands/theme-toggle.riot';
import type { AppEnv } from './env';

register('subscribe-form', SubscribeForm);
register('login-form', LoginForm);

const islandCss = [ThemeToggle.css, SubscribeForm.css, LoginForm.css]
  .filter((css): css is string => Boolean(css))
  .join('\n');

const fouc = `<script>
var saved=null,dark=false,theme='light';
try{try{saved=localStorage.getItem('theme')}catch(_e){}
dark=matchMedia('(prefers-color-scheme: dark)').matches;
theme=saved==='light'||saved==='dark'?saved:(dark?'dark':'light');
document.documentElement.setAttribute('data-theme',theme)}catch(_e){
document.documentElement.setAttribute('data-theme','light')}
</script>`;

// Runs after the header is parsed, before the first paint. The label matches
// what theme-toggle binds once its module loads.
const themeLabel = `<script>
try{var choice=localStorage.getItem('theme');if(choice!=='light'&&choice!=='dark')choice='system';var button=document.querySelector('theme-toggle button');if(button)button.textContent='Theme: '+choice}catch(_e){}
</script>`;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** JSON for a script tag. `<` cannot close the tag; the value still parses. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function originOf(c: Context, env: AppEnv): string {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/$/, '');
  return new URL(c.req.url).origin;
}

export interface Assets {
  css: string;
  islands: string;
}

export function assetsFor(env: AppEnv): Assets {
  if (env.NODE_ENV !== 'production') {
    return {
      css: '/src/styles/landing.css',
      islands: '/src/islands/client.ts',
    };
  }
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'dist/client/.vite/manifest.json'),
      'utf8',
    ),
  ) as Record<string, { file?: string; css?: string[] }>;
  const entry = manifest['src/islands/client.ts'];
  if (!entry?.file)
    throw new Error('Client manifest is missing the island entry');
  return {
    css: `/${entry.css?.[0] ?? ''}`,
    islands: `/${entry.file}`,
  };
}

export function renderPage<Props extends object>(
  c: Context,
  env: AppEnv,
  name: string,
  component: RiotComponentWrapper<RiotComponent>,
  props: Props,
  meta: { title: string; description: string; path: string },
  state: Record<string, object> = {},
): Response {
  const body = render(name, component as RiotComponentWrapper<Props>, props);
  const theme = render(
    'theme-toggle',
    ThemeToggle as RiotComponentWrapper<object>,
    {},
  );
  const origin = originOf(c, env);
  const canonical = `${origin}${meta.path}`;
  const assets = assetsFor(env);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${fouc}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#5181b8">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="${escapeHtml(assets.css)}">
<style riot>${islandCss.replaceAll('</', '<\\/')}</style>
</head>
<body class="site">
<header class="site-header">
  <a class="brand" href="/">Riot app</a>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    ${theme}
    <a href="/login">Log in</a>
  </nav>
</header>
${themeLabel}
<main>${body}</main>
<script type="application/json" id="riot-state">${safeJson(state)}</script>
<script type="module" src="${escapeHtml(assets.islands)}"></script>
</body>
</html>`;
  const etag = `W/"${Bun.hash(html).toString(16)}"`;
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  c.header('ETag', etag);
  c.header('Cache-Control', 'no-cache');
  return c.html(html);
}
