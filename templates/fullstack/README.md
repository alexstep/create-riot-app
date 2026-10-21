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

The browser talks to this server only through `src/client/api.ts`. Screens and islands call `login`, `listItems`, `sendContact`, and the other functions in that file. The Hono client stays inside the module, so replacing the data layer does not require edits in the tags. Cookies are sent with `credentials: 'include'`. A bearer token of the same signed session value also works.

## API docs and auth

`/api/docs` is Scalar. `/api/openapi.json` is the spec, generated from the routes, with `info.version` read from `package.json`. Cookie and bearer security schemes are registered.

In development and test the docs are public. In production they answer 404 until both `DOCS_USER` and `DOCS_PASSWORD` are set. Those two values turn on HTTP basic auth for `/api/docs` and `/api/openapi.json`.

Sessions are in memory. The cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production. `SESSION_SECRET` signs the cookie value. `DEMO_PASSWORD` is the only accepted password. Login is limited to 5 attempts per minute per client. `hono/csrf` rejects cross-site form posts. JSON requests are not form posts; the browser still sends `Origin` on same-site fetches.

Copy `.env.example` to `.env`. The process refuses to boot when the schema does not match. Do not put real secrets in source.

## Dev and production

Development is one Vite process on port 3000. The `dev` script runs Vite's JavaScript entry with Bun. `@hono/vite-dev-server` loads `src/server/dev.ts` with the Bun adapter, so Hono handles the pages and `/api` while Vite serves modules. `parseEnv` also reads `.env`, because a Node-hosted Vite process would not.

`bun test` compiles `.riot` imports through `bunfig.toml` (`[test] preload`). `@riotjs/ssr`'s `renderAsync` asks the tag for `onAsyncRendering`, and the compiled tags do not expose that hook, so handlers load any data first and call `render`.

## Deploy

Ship the Bun process. `bun run build` writes `dist/client` and `dist/server`. `bun run start` runs `dist/server/index.js` on `PORT` (3000) and listens on every interface. Set `SESSION_SECRET`, `DEMO_PASSWORD`, and, when the site has a public https origin, `PUBLIC_ORIGIN` (canonical URLs, and HSTS only then). The process exits if the environment does not match the schema.

`GET /api/health` returns `{ "ok": true }` with no session. Use it for a process check.

`Dockerfile` is three stages on `oven/bun:1.4.3`: production dependencies with a frozen lockfile, the Vite client build and the server build, then `oven/bun:1.4.3-slim`. The last stage runs as the `bun` user and serves the pages, the API, Scalar, and `dist/client`. Hashed files under `/assets/` stay `immutable`. HTML stays `no-cache`. The image has no secret. `HEALTHCHECK` calls `/api/health`.

```bash
docker build -t riot-app .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e SESSION_SECRET=replace-me-with-a-long-random-string \
  -e DEMO_PASSWORD=demo \
  riot-app
```

Scalar stays off in that container until both docs variables are set. Then basic auth protects `/api/docs` and `/api/openapi.json`:

```bash
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e SESSION_SECRET=replace-me-with-a-long-random-string \
  -e DEMO_PASSWORD=demo \
  -e DOCS_USER=docs \
  -e DOCS_PASSWORD=replace-me \
  riot-app
```

Lint: `bun run lint` runs Biome and `scripts/biome-riot.ts` for `<script>` and `<style>` inside `.riot` files. Tag markup is not reformatted.
