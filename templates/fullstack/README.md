# Riot app

One Bun process serves a JSON API, a few server-rendered pages, and a client-side cabinet. Riot draws the pages. Hono is the HTTP router. Vite builds the client and the server.

```bash
cp .env.example .env
bun install
bun run dev
```

Open <http://localhost:3000>. `/` and `/about` are rendered on the server. `/login` signs you in (any email, password from `DEMO_PASSWORD`). `/app/dashboard`, `/app/groups`, and `/app/settings` are the cabinet.

```bash
bun run test
bun run typecheck
bun run lint
bun run format
bun run build
bun run start
```

`bun run start` listens on `PORT` (3000) and sets `NODE_ENV` to `production` when it is missing. Hashed files under `/assets/` are cached as immutable. HTML is `no-cache` with an ETag.

## Layout

```
src/server/app.ts     Hono app: API, pages, static files, /app
src/server/index.ts   Bun.serve and shutdown
src/server/dev.ts     same app, loaded by Vite in development
src/api/routes.ts     OpenAPI routes and AppType
src/client/api.ts     browser calls to this server (the swappable data layer)
src/pages/            server-rendered Riot tags
src/islands/          custom elements used on those pages
src/cabinet/          client-only app mounted at /app
src/styles/           landing CSS (imports the shared theme)
app.html              cabinet shell
```

Shared colors live in `src/cabinet/styles/theme.css`. The landing stylesheet imports that file. The cabinet imports it too.

## Where to add something

Server-rendered page: add a `.riot` tag under `src/pages` and a `GET` handler in `src/server/app.ts` that calls `renderPage`. Give it a title, description, and path so the document has canonical and Open Graph tags. Add the path to the sitemap in that same file. Only the pages you render this way are server-rendered.

Island: add a custom element under `src/islands`, register it with `define('x-tag', Component)` in `src/islands/client.ts`, and put the tag in a page. Props that must be set from HTML go in `observedAttributes`. The element upgrades itself in the browser. Landing pages are not hydrated.

Cabinet screen: add a screen to `src/cabinet/router.ts` and a tag under `src/cabinet/components/screens`. It is a normal client Riot app. Unauthenticated requests to `/app/*` redirect to `/login`.

API route: add a zod schema (`.openapi('Name')`) and `createRoute` in `src/api/routes.ts`, then chain `.openapi(...)` on `routes`. `export type AppType = typeof routes` is what `src/client/api.ts` imports. Keep paths literal (`/items/{id}`, not a wildcard middleware) so `hc<AppType>` keeps real methods. Auth routes are `/api/login` and `/api/logout` for that reason.

The browser talks to this server only through `src/client/api.ts`. See [Data layer](#data-layer).

## API docs and auth

`/api/docs` is Scalar. `/api/openapi.json` is the spec, generated from the routes, with `info.version` read from `package.json`. Cookie and bearer security schemes are registered.

In development and test the docs are public. In production they answer 404 until both `DOCS_USER` and `DOCS_PASSWORD` are set. Those two values turn on HTTP basic auth for `/api/docs` and `/api/openapi.json`.

Sessions are in memory. The cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production. `SESSION_SECRET` signs the cookie value. `DEMO_PASSWORD` is the only accepted password for the login form. Login is limited to 5 attempts per minute per client. A mutation with a foreign `Origin`, or with `Sec-Fetch-Site` other than `same-origin` or `none`, is rejected. curl and the tests send neither header, so they still work. The hub never signs a person in. A 401 clears the cached session and tells every tab. The login form is the only way to start a session. Profile, files, and the event stream belong to that user.

## Data layer

One place describes each endpoint: a zod schema and a `createRoute` on the Hono router. The page does not repeat that shape. `src/client/api.ts` calls `hc<AppType>` and exports helpers such as `submitProfile`. A 400 body is `{ error, fields }`. The profile form on the Data screen puts `fields.email` under the email box.

The cabinet does not call `fetch` itself. A SharedWorker (`src/client/hub.worker.ts`) is the only client of this origin. It deduplicates GETs, keeps one copy of each topic (`session`, `profile`, `uploads`), and broadcasts that snapshot to every tab. A new tab renders the snapshot without another request. The session is the httpOnly cookie; the worker does not store a token. If the browser has no SharedWorker, one tab takes a Web Lock and runs the same hub over a BroadcastChannel. Uploads go through `XMLHttpRequest` in the hub so the tab that dropped the files can show progress. Files are checked for size and type, stored under `./tmp/uploads` with a random name, and the download path cannot leave that directory.

Live updates are one `GET /api/events` stream in the hub. Events are zod objects. The hub sends `Last-Event-ID`. If the server's ring buffer no longer has the next event, it sends `resync` and the hub loads the topics again. Saving the profile in one tab, or with curl, updates the other tabs.

Offline, a service worker caches the app shell only. The cache name includes the build hash. HTML is network-first. `/api` and POST requests are not intercepted. When a new worker is waiting, the page shows "A new version is ready. Reload". GET topics that the hub already stored stay in Cache Storage. Writes while offline are refused, and the Data screen says the saved data may be stale. There is no database in the browser.

Copy `.env.example` to `.env`. The process refuses to boot when the schema does not match. Do not put real secrets in source.

## Dev and production

Development is one Vite process on port 3000. The `dev` script runs Vite's JavaScript entry with Bun. `@hono/vite-dev-server` loads `src/server/dev.ts` with the Bun adapter, so Hono handles the pages and `/api` while Vite serves modules. `parseEnv` also reads `.env`, because a Node-hosted Vite process would not.

`bun test` compiles `.riot` imports through `bunfig.toml` (`[test] preload`). `@riotjs/ssr`'s `renderAsync` asks the tag for `onAsyncRendering`, and the compiled tags do not expose that hook, so handlers load any data first and call `render`.

## Deploy

Ship the Bun process. `bun run build` writes `dist/client` and `dist/server`. `bun run start` runs `dist/server/index.js` on `PORT` (3000) and listens on every interface. Set `SESSION_SECRET`, `DEMO_PASSWORD`, and `PUBLIC_ORIGIN`. Production refuses to boot without `PUBLIC_ORIGIN`. HSTS is sent only when that origin is `https`. The process exits if the environment does not match the schema.

`GET /api/health` returns `{ "ok": true }` with no session. Use it for a process check.

`Dockerfile` is three stages on `oven/bun:1.4.3`: production dependencies with a frozen lockfile, the Vite client build and the server build, then `oven/bun:1.4.3-slim`. The last stage runs as the `bun` user and serves the pages, the API, Scalar, and `dist/client`. Hashed files under `/assets/` stay `immutable`. HTML stays `no-cache`. The image has no secret. `HEALTHCHECK` calls `/api/health`.

```bash
docker build -t riot-app .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e PUBLIC_ORIGIN=http://localhost:3000 \
  -e SESSION_SECRET=replace-me-with-a-long-random-string \
  -e DEMO_PASSWORD=demo \
  riot-app
```

Scalar stays off in that container until both docs variables are set. Then basic auth protects `/api/docs` and `/api/openapi.json`:

```bash
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e PUBLIC_ORIGIN=http://localhost:3000 \
  -e SESSION_SECRET=replace-me-with-a-long-random-string \
  -e DEMO_PASSWORD=demo \
  -e DOCS_USER=docs \
  -e DOCS_PASSWORD=replace-me \
  riot-app
```

Lint: `bun run lint` runs Biome and `scripts/biome-riot.ts` for `<script>` and `<style>` inside `.riot` files. Tag markup is not reformatted.
