# create-riot-app

A Riot.js starter for a full-stack app: readable tags, one Bun process, and a small client. Routes are written in the server file. The CLI copies a template into a new directory. The default template is that Bun process: a Hono API, server-rendered Riot pages, and a client cabinet. `--template spa` copies the client-only cabinet.

The repository has two layers:

- `bin/create-riot-app.ts` copies a template, names `package.json` from the directory, restores `.gitignore`, writes `.env` from `.env.example` when that file is missing, and installs dependencies.
- `templates/fullstack` and `templates/spa` are those projects.

## Stack

| | |
| --- | --- |
| Runtime and packages | [Bun](https://bun.sh) |
| HTTP | [Hono](https://hono.dev) on Bun, in the full-stack template |
| UI | [Riot.js 10.1.6](https://riot.js.org) |
| Server HTML | `@riotjs/ssr` for the pages that opt in |
| Hydration | The same tags, bound to the server markup in the browser |
| Tag compiler | `@riotjs/compiler` 10.0.5 via `rollup-plugin-riot` |
| Router | `@riotjs/route` 10, inside the cabinet |
| Dev server and build | [Vite](https://vite.dev) 8 |
| Language | TypeScript in `.ts` modules and in `.riot` scripts (`lang="ts"`) |
| Styles | Native CSS: nesting and custom properties |

Riot 10 is the current stable line on npm (the last 9.x release is 9.4.11). Components are `.riot` files with `export default`. Riot does not publish a dedicated Vite plugin: the official compiler is a Rollup plugin, and Vite runs that plugin.

## Create a project

```bash
bunx create-riot-app my-app
cd my-app
bun run dev
```

That is the full-stack template. The client-only app:

```bash
bunx create-riot-app my-spa --template spa
```

`bun create riot-app my-app` does the same thing as the default. `--no-install` copies files only. `--force` writes into a non-empty directory. Any other template name exits with `Unknown template "<name>". Use "fullstack" or "spa".`

From a checkout of this repository, without publishing:

```bash
bun ./bin/create-riot-app.ts my-app
bun ./bin/create-riot-app.ts my-spa --template spa
```

## Full-stack template

`bun run dev` is one process on <http://localhost:3000>. `@hono/vite-dev-server` loads `src/server/dev.ts` through its Bun adapter. Hono serves the pages and `/api`. Vite serves the modules.

```bash
bun run build    # dist/client and dist/server
bun run start    # Bun.serve, one process
bun run test     # app.request() against the Hono app
```

`src/server/index.ts` stops the server on SIGINT and SIGTERM. `bun run start` sets `NODE_ENV` to `production` when it is unset, then reads `.env`. Hashed files under `/assets/` are `immutable`. HTML is `no-cache` with an ETag. Paths that leave the static root are rejected. Mount order is API and special routes, then static files, then server-rendered pages, then the `/app/*` fallback. `/api/*` that does not match is JSON `{ "error": "Not found" }`.

### Pages, islands, cabinet, API

`/`, `/about`, and `/login` are rendered with `@riotjs/ssr` `render`. Handlers pass props, including the title and description used for `<title>`, the meta description, Open Graph, and the canonical URL. `sitemap.xml` and `robots.txt` are routes. Other URLs are not server-rendered.

`theme-toggle`, `subscribe-form`, and `login-form` are rendered in that HTML and bound in the browser. The client entry does not build a second copy of the markup. The props for that render are `<script type="application/json" id="riot-state">`. The JSON escapes `<`, so a value cannot close the script, and the client does not fetch those props again. The log-in link is a plain anchor. The theme choice is in `localStorage`: the server prints "Theme", and a short script writes the real label before the first paint.

`@riotjs/hydrate` v10 is not the binder. It mounts on a clone of the root and then replaces the server node. Details and the tag pattern are in `templates/fullstack/README.md`.

The cabinet at `/app` stays a client app. The service worker stores one document for every `/app/*` URL, and the client router picks the screen. Rendering each screen on the server would make that cache show the wrong screen until JavaScript runs, and it would not make the cabinet bundle smaller.

`/login` accepts any email and `DEMO_PASSWORD`. In development the page shows that password (the scaffolded default is `demo`) and fills it in. The session cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production. `SESSION_SECRET` signs it. The same signed value works as a bearer token. Login allows 5 attempts per minute. `hono/csrf` rejects a cross-site form post. After login, `/app/*` is the cabinet (drawer, screens, themes, sounds) from `app.html`. Without a session, `/app/*` redirects to `/login?next=` (the cabinet path) and `/api/me` is 401. Logout clears the cookie. A session that expires in an open tab sends every tab to that same login URL.

Add a server-rendered page in `src/pages` and a `renderPage` route in `src/server/app.ts`. Add a cabinet screen in `src/cabinet/router.ts`. Add an API route by chaining `.openapi()` in `src/api/routes.ts`. Colors are the custom properties in `src/cabinet/styles/theme.css`, imported by both the landing CSS and the cabinet.

The router is `OpenAPIHono` from `@hono/zod-openapi`. Schemas use zod 4 and `.openapi('Name')`. `defaultHook` returns `{ error }` with status 400. `basePath('/api')` is set before the routes. One `onError` returns an `HTTPException` response as-is and `{ error: "Internal Server Error" }` for anything else. `requireUser` and `optionalUser` are `createMiddleware` handlers with typed variables. Demo routes: `/api/login`, `/api/logout`, `/api/me`, `/api/hello` (optional auth), `/api/contact`, and in-memory `/api/items`.

`/api/docs` is Scalar (`@scalar/hono-api-reference`). `customCss` maps the app tokens (`--page-bg`, `--card-text`, `--theme-color`, and the dark values) onto `--scalar-*` for the light page and `.dark-mode`. `/api/openapi.json` is produced by `app.doc`, with `info.version` from `package.json`, plus cookie and bearer security schemes. Docs are public when `NODE_ENV` is not `production`. In production they answer 404 until `DOCS_USER` and `DOCS_PASSWORD` are both set, and then HTTP basic auth protects them.

The browser talks to this server only through `src/client/api.ts`. A SharedWorker is the only client of that API: it deduplicates requests, broadcasts GET snapshots to every tab, holds the httpOnly session, and keeps one event stream. The Records screen (`/app/records`) is a profile form (field errors from `{ error, fields }`) and file uploads saved under `tmp/uploads`. Offline mode caches the app shell and disables writes. If the browser is online but the server does not answer, the same screen says the server is unreachable. Details are in `templates/fullstack/README.md`.

Environment variables are checked with zod at boot. `.env.example` lists them. Nothing secret is committed. The CLI copies that file to `.env`. Outside production, a missing `SESSION_SECRET` or `DEMO_PASSWORD` falls back to demo defaults (password `demo`, and a dev-only session secret) and the process prints one notice. `bun run start` sets `NODE_ENV` to `production` when it is unset, same as the Docker image, and does not use those defaults. The generated `.env` already has `SESSION_SECRET`, `DEMO_PASSWORD`, and `PUBLIC_ORIGIN=http://localhost:3000`, so `bun run build && bun run start` works right after scaffolding. If any of those are missing, the process prints the list and exits. When `PUBLIC_ORIGIN` is `https`, responses include HSTS. A local `bun run start` on http does not send HSTS.

`templates/fullstack/Dockerfile` builds on `oven/bun:1.4.3` in three stages (frozen production install, Vite and server build, slim runtime). The container runs as `bun`, reads `PORT`, and answers `GET /api/health`. Pass `SESSION_SECRET`, `DEMO_PASSWORD`, and `PUBLIC_ORIGIN` when you start it; production refuses to boot without `PUBLIC_ORIGIN`. Set `DOCS_USER` and `DOCS_PASSWORD` as well when `/api/docs` should be on. See the full-stack README for `docker build` and `docker run`. The client-only template is served with `bun run preview`.

`@riotjs/ssr` `renderAsync` throws unless the mounted tag implements `onAsyncRendering`. Compiled tags do not expose that method, so a handler loads data and then calls `render`. A tag's `<style>` is scoped to its name by the compiler and inlined in `<style riot>` so it applies before JavaScript. CSS variables still come from the shared theme.

## Client-only template

```bash
cd templates/spa
bun install
bun run dev
```

Dev server: <http://localhost:5173>. Routes: `/dashboard`, `/groups`, `/settings`. `vite preview` serves `index.html` for those paths.

The cabinet has a top bar, a drawer (0.1s, swipe from the left edge), sounds in `public/sounds`, and three screens. The default theme follows `prefers-color-scheme`. Settings stores Light / Dark / System in `localStorage`. `VITE_APP_AVATAR_URL` overrides the drawer avatar.

## Lint and format

Biome 2.6.2 checks `.ts`, `.js`, `.css`, `.json`, and `.html` in both templates and in `bin/`. It ignores `.riot` files. `scripts/biome-riot.ts` in each template uses `@riotjs/parser` to lint and format `<script>` and `<style>`. Diagnostics use the `.riot` line and column. Tag markup is not formatted. An `each` without `key` is reported.

```bash
bun run lint
bun run format:check
```

`.vscode` in each template recommends the Biome extension. `.riot` is not part of format-on-save.

## Visual test

`visual/test.ts` captures the spa template: eight screens (desktop 1280×800 and mobile 390×844: home, open drawer, list, settings) in light and dark themes. Light screens are compared with `visual/baselines`. Dark screens are compared with `visual/baselines/dark`. The suite is not part of CI.

```bash
cd visual && bun install
bunx playwright install chromium
cd ..
bun run visual
```

## Scripts in this repository

| Command | What it does |
| --- | --- |
| `bun run demo` | Full-stack dev server |
| `bun run demo:spa` | Client-only dev server |
| `bun run demo:test` | Full-stack `bun test` |
| `bun run demo:typecheck` | Typecheck both templates |
| `bun run demo:build` | Production build of both templates |
| `bun run lint` | Biome for `bin/` and both templates, including `.riot` script and style |
| `bun run visual` | Spa screenshot suite |
