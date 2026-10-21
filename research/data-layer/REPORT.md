# Riot + Hono data layer

Checked against npm and GitHub on 21 October 2026. The proof of concept lives in this folder. It is a research branch, not the template.

## Recommendation

Keep `@hono/zod-openapi` as the only router. Export `AppType` from the chained routes and call them with `hc<AppType>`. Put a SharedWorker in front of that client. The worker is the only thing that talks to the network: it deduplicates requests, holds the session, caches GET topics in Cache Storage, and keeps one SSE connection. Tabs render a snapshot. They do not each call `/api/session`.

That is the lightest design that still gives one source of types, real server validation, Scalar docs, forms, file uploads, offline reads, and server-pushed updates. Heavier sync engines and a SQL database in the browser do not earn a place in the starter.

## What a new endpoint costs

The contract is the route. The page does not redeclare the body, the success shape, or the field errors.

```ts
const profilePut = createRoute({
  method: 'put',
  path: '/profile',
  request: {
    body: { content: { 'application/json': { schema: ProfileInputSchema } }, required: true },
  },
  responses: {
    200: { description: 'Saved profile', content: { 'application/json': { schema: ProfileSchema } } },
    400: { description: 'Invalid profile', content: { 'application/json': { schema: ErrorBodySchema } } },
    401: { description: 'No session', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
})

api.openapi(profilePut, (c) => {
  const input = c.req.valid('json')
  const event = deps.bus.publish({
    type: 'profile',
    version: 0,
    profile: { ...input, updatedAt: Date.now(), version: 0 },
  })
  if (event.type !== 'profile') throw new Error('Expected a profile event')
  deps.profile = event.profile
  c.header('X-Topic', 'profile')
  c.header('X-Version', String(event.version))
  c.header('X-Cursor', String(deps.bus.current()))
  return c.json(event.profile, 200)
})
```

The Riot side then calls a helper whose argument type is inferred:

```ts
export type ProfileInput = InferRequestType<typeof shape.api.profile.$put>['json']

export async function submitProfile(client: Client, input: ProfileInput) {
  const res = await client.api.profile.$put({ json: input })
  if (!res.ok) {
    const body = await res.json() // { error, fields } from the 400 response
    return { ok: false as const, error: body.error, fields: body.fields ?? {} }
  }
  return { ok: true as const, profile: await res.json() }
}
```

`cabinet.riot` calls `cabinet.save({ name, email, message })`. It does not declare `Profile`. `tsc` checks `src/client/cabinet.ts` and `src/client/api.ts`. Riot's `<script lang="ts">` is not part of `tsc` in this repo (the current template is the same); the checked module is what the component imports, so a wrong field fails the build.

A duplicated client, for contrast, would repeat the path, the TypeScript interface, the fetch wrapper, the error parser, and an OpenAPI fragment that can drift from the handler. None of that remains.

Uploads are the one extra helper. `fetch` cannot report upload progress, so `uploadFiles()` sends the files through the hub on purpose and types the result as `InferResponseType<typeof shape.api.uploads.$post, 201>`. The URL still comes from `client.api.uploads.$url()`.

## Comparison

Weekly downloads are the npm point API for the week of 21 October 2026. Unpacked size is `dist.unpackedSize` from the registry, which is the published package, not a gzipped app bundle.

| Approach | Version (published) | Weekly downloads | Maintenance | Fit |
| --- | --- | --- | --- | --- |
| Hono RPC `hc<AppType>` on `@hono/zod-openapi` | hono 4.13.13 (10 Oct), zod-openapi 1.6.3 (4 Sep) | hono 45.2M, zod-openapi 1.7M | hono pushed 17 Oct, middleware repo pushed 20 Oct. 32.6k stars | Use this. Types, validation, and Scalar come from the routes the template already chose. Client is `hono/client`. |
| oRPC `@orpc/server` + `@orpc/client` + `@orpc/openapi` | 1.16.0 (21 Oct) | server 1.0M, client 1.2M | middleapi/orpc, 5.7k stars, pushed 21 Oct | Strong product, wrong slot. It replaces OpenAPIHono with its own router and a Fetch adapter. OpenAPI is a second handler. File and `z.file()` support is real. Adopt it only if the template drops zod-openapi. |
| tRPC v11 + `@hono/trpc-server` + `trpc-to-openapi` | tRPC 11.19.0 (17 Oct), Hono adapter 0.4.2 (12 Jan), trpc-to-openapi 3.3.3 (18 Oct) | tRPC server 3.4M, adapter 0.29M, openapi bridge 0.21M | tRPC pushed 21 Oct, 40.7k stars. The Hono adapter is a thin `fetchRequestHandler` and has not moved since January. trpc-to-openapi is a community fork and documents JSON bodies; its HTTP adapters are Node, Express, Fastify, Next, Nuxt. No multipart in the generated spec | FormData works on `httpLink`, not in the OpenAPI document. A second procedure router beside zod-openapi duplicates the API. |
| ts-rest | 3.52.1 (2 Jun 2025) | 0.45M | 3.3k stars. Last push 6 Feb 2026. v4 was still a draft in June 2026. No official Hono adapter; `@ts-rest/serverless/fetch` bypasses Hono's router | Zod 4 support is an unreleased RC. Skip. |
| Zodios `@zodios/core` | 10.9.6 (22 Aug 2023) | 0.18M | Core package has not shipped in three years | Skip. |
| `openapi-typescript` + `openapi-fetch` | 7.13.0 and 0.17.0 (15 Jun) | 5.8M and 6.6M | openapi-ts/openapi-typescript, 8.4k stars, pushed 25 Sep | Right tool when the client cannot import the server (a public API, another language). Inside one project the spec is a generated artifact. Upload progress is still custom. |
| `hono-openapi` (rhinobase) | 1.5.0 (18 Oct) | 1.3M | 789 stars, pushed 20 Oct | A cousin of zod-openapi that describes ordinary Hono routes. Not a second client. No reason to switch the template off zod-openapi. |
| chanfana | 3.4.0 (17 Aug) | 56k | Cloudflare-oriented | Skip for this starter. |
| Elysia + Eden | elysia 1.4.30 (19 Oct), Eden 1.4.9 (31 Mar) | elysia 0.97M | Not Hono | Skip. |
| Effect RPC | 0.76.2 (16 Oct) | 0.53M | A different runtime and error model | Too large a bet for a Riot starter. |

Also current, and not a fit as the app's data layer: `@hey-api/openapi-ts` 0.99.0 and kubb 5.11.6 are code generators. `@hono/standard-validator` 0.4.0 is how Hono runs Standard Schema validators; zod-openapi already sits on that.

Hono RPC limits, from the current docs and the August 2026 zod-openapi change (middleware PR 1988):

- IDE cost grows with the route chain. The mitigation that Hono documents is to compute `hc<typeof app>` once in a module and export `typeof client`, or to compile that declaration so the language server does not re-instantiate it. Splitting route groups does the same. PR 1988 cut instantiations on a 100-route synthetic app by about 53–60% under TypeScript 6 and 7, with no runtime change. A starter does not need the compile trick yet. Do not invent a `.d.ts` rewrite step; the template notes already warn against that.
- `strict: true` is required. The client and the server must resolve the same `hono` version or TypeScript reports an infinitely deep instantiation.
- Status-aware responses need a literal status on `c.json` (`200`, `400`, `404`) and the same status in `createRoute.responses`. `c.notFound()` is not inferred. `onError` is not inferred either; use `ApplyGlobalResponse` only if a global 500 shape must appear on every call. This PoC declares 400 on the route, and the `defaultHook` returns that same shape, so `res.status === 400` narrows to `{ error, fields }`.
- `InferRequestType` / `InferResponseType` are the right helpers. Path and query values are strings on the wire even when Zod later coerces them.
- `$url()` needs an absolute base (`http://127.0.0.1:4317`, not `''`).
- Import `AppType` with `import type`. A value import pulls the server into the Vite bundle. The built page was checked: it does not contain the server's upload error string. Page JS is 32.7 kB (11.6 kB gzip) plus a 2.2 kB caller. The SharedWorker is 413 kB (97 kB gzip) because it parses events with the same Zod schemas. That cost stays off the first paint; Zod is not in the page chunk.

## Realtime

The hub holds one `GET /api/events` stream, built with Hono's `streamSSE`. Each event is a JSON value of `LiveEventSchema` (profile snapshot, uploads snapshot, invalidate, or resync). The id is a per-process monotonic version. The hub sends it back as `Last-Event-ID`. If the ring buffer (100 events) no longer contains the next id, the server emits `resync` and the hub refetches those topics. Backoff is exponential with jitter and has no attempt cap. `online` wakes it immediately. A 401 refreshes the session once; a dropped socket does not.

SSE rather than a WebSocket: the client already has typed HTTP for anything it sends. The missing piece is server to client. SSE is ordinary HTTP, proxies understand it, resume is a header, and Hono implements it. Bun's native WebSocket is the upgrade when the browser must stream to the server (cursors, audio). It would mean a second protocol and a reconnect loop we would have to write anyway.

Sync engines, if the product later needs multi-device offline writes with merge:

| Library | Version | Unpacked package | What it actually requires |
| --- | --- | --- | --- |
| ElectricSQL client | 1.5.28 | 2.4 MB | Postgres and the Electric service. The shape of the API becomes Electric's, not the Hono routes. |
| PowerSync web | 2.5.0 | 10.3 MB | Their service and a schema. |
| Zero `@rocicorp/zero` | 1.11.0 | 11.9 MB | Their sync server. Replicache's successor, not a cache in front of REST. |
| TanStack Query core | 5.104.5 | 3.9 MB package | A query layer the component must call. It does not read `hc` types. Persistence is a plugin, usually IndexedDB, which this starter is not adopting. |
| TinyBase, RxDB | 10.0.1 / 17.6.0 | 16 MB / 11 MB | You still declare tables and write the sync. |

None of these let a Riot component call a typed Hono route and have persistence fall out. They replace that call. They are future upgrades for a product that already has Postgres and real conflict rules, not for the starter.

The event schema is the same Zod object the server publishes. The worker parses with `LiveEventSchema.safeParse`. The page never handles the stream. A bad frame is dropped. An `invalidate` event refetches those topics; a full `profile` or `uploads` event updates memory and Cache Storage with no GET. Versions are per topic, so an older event cannot overwrite a newer snapshot. The route is registered with `createRoute` so Scalar shows `text/event-stream`, and it is attached after `buildApi()` so `AppType` stays the JSON routes. A streamed response mixed into the chain is how Hono RPC types collapse to `unknown`.

Checked in headless Chrome 156: two tabs reported `shared-worker`, the document's resource list contained no `/api/` URLs, a `curl` PUT changed both name fields to Grace, and both logs gained a single `EVENT /api/profile` line. The page bundle does not call the API.

## Workers

SharedWorker is the hub.

Support, checked against MDN and the Web Platform feature list on 21 October 2026, not from memory:

- MDN marks SharedWorker Baseline newly available since May 2026.
- Chrome desktop has had it since Chrome 5. Chrome for Android gained it in Chrome 148, released 5 May 2026 (web-features). The caniuse table's current row also shows it enabled; caniuse's global figure on that page was about 93%.
- Safari desktop and iOS: 16 and later (12 September 2022).
- Firefox: 29 and later, including Firefox for Android.
- The caniuse snapshot still showed Samsung Internet 30 without it. That is why a fallback exists. "Newly available" means phones a couple of years old can still miss it.

Web Locks has been widely available since March 2022, including in workers, and only in secure contexts (localhost counts). BroadcastChannel is in the same set of browsers.

Fallback, in order:

1. `SharedWorker` named `riot-hub`.
2. Otherwise, if `navigator.locks` and `BroadcastChannel` exist, one tab holds the lock `riot-hub-leader` and runs the same `Hub` class. Other tabs send the same messages over `BroadcastChannel`. When the leader closes, the lock moves and the next tab hydrates from Cache Storage.
3. Otherwise the tab runs the hub itself. Other tabs do not share its requests.

A dedicated `Worker` per tab is the wrong fallback. The Calendar TG client does that, and IndexedDB `liveQuery` is what makes the other tabs update. Every tab still opens its own socket and refreshes its own token. That is the bug this design exists to avoid. Dedicated workers also cannot see each other's in-flight map.

The protocol is a closed set of messages (`hello`, `bye`, `http`, `upload`, `online`, `visibility`, `pong`, and the matching replies). It is not `this[method]`. Ids are `crypto.randomUUID()`. One listener owns the pending map. Failures arrive as `http-error` and reject the promise; they do not sit until a timeout. The timeout is cleared when the reply arrives. `pagehide` sends `bye`. A heartbeat drops ports that miss two pongs, because a `MessagePort` has no close event. SharedWorker logs are in `chrome://inspect/#workers`, not in the page console.

Typing survives the hop because the hop is not the API. The page still holds `hc<AppType>` and passes a `fetch` that posts the `Request` to the hub. Autocomplete is the normal Hono client. The worker speaks HTTP plus a topic cache. It does not re-list routes. Comlink (4.4.2, last published November 2024) would proxy functions and fight upload progress and dedup; it is not used.

Calendar TG patterns kept: request ids, the worker owns the network, single-flight refresh, reload only after a real 401, new clients render current state, stale topics revalidate when a tab becomes visible, service worker caches the shell by build hash and does not cache `/api`. Patterns dropped: stringly method names, `Date.now()*Math.random()` ids, errors that look like timeouts, subscriptions that never unsubscribe, polling instead of the in-flight promise, a WebSocket that gives up after three tries, and a service worker that calls `respondWith` for POST and cross-origin requests.

## Storage

The acceptable baseline is what this PoC implements.

- The service worker precaches the built shell under `shell-<hash>`, serves HTML network-first, serves `/assets/*` cache-first, and falls back to `offline.html`.
- The hub writes successful GET topics (session user, profile, file list) into Cache Storage under a different name, `api-topics-v1`, with `x-stored-at` and `x-version`. A new shell build does not delete that cache.
- While online, a topic younger than 30 seconds is reused. Older topics are revalidated. A worker that restarts inside that window reads the cache and does not call `/api/session` again.
- While offline, a GET returns the cached JSON and the snapshot says `online: false`. The cabinet shows "You are offline. Showing saved data from {time}. It may be stale." Writes return 503 and the buttons are disabled. There is no offline mutation queue. File uploads are not queued either.

No IndexedDB, Dexie, or `localStorage` token. The owner ruled raw IndexedDB and Dexie out as the default. Cache Storage is already required for the shell, and it is available in windows and workers.

SQLite-in-WASM and the sync engines were checked against the decision rule (simple, light, maintained, no SQL in app code, the API layer persists by itself):

| Option | Version | Unpacked | Why it stays a future upgrade |
| --- | --- | --- | --- |
| `@sqlite.org/sqlite-wasm` | 3.54.1-build1 | 3.0 MB | Official OPFS build. App code still needs a schema. OPFS has had a long list of Safari connection limits. |
| wa-sqlite | 1.0.0 | 2.2 MB | Same: you write storage, then teach it about routes. |
| PGlite | 0.5.11 | 25.6 MB | A Postgres build in the page. |
| Drizzle | 0.45.4 | 10.5 MB | An ORM. The Riot component would not "just call the API"; someone writes tables. |
| idb-keyval | 6.3.0 (8 Jul) | 56 kB, 6.0M weekly downloads | The smallest IndexedDB wrapper, and still a database the owner does not want as the default. |
| Dexie | 4.4.6 (19 Oct) | 3.2 MB | What Calendar TG uses for `liveQuery`. Not the default. |

Nothing in that list persists a Hono route by itself. The hub already does, with zero storage dependencies.

## Service worker

Hand-written. `vite-plugin-pwa` 2.0.0 is popular (3.4M weekly downloads) and Workbox precaching alone is a 366 kB unpacked package. The failure mode in the reference app is a `fetch` handler that calls `respondWith` for every request, including POST and other origins, plus an update hook that does nothing. A 70-line worker can say the rules in code: `shouldHandle()` is unit-tested.

`scripts/write-sw.ts` runs after `vite build`, hashes the file list, and bundles `src/sw.ts` with that hash and the precache list. Hashed assets are immutable. HTML is network-first and stored under `/index.html`. `/api` is never handled. Dev startup unregisters any service worker and deletes `shell-*` caches so a production worker cannot pin a dev bundle. The first install calls `skipWaiting` only when there is no controller. Later installs show "A new version is ready. Reload", which posts `skip-waiting`. `controllerchange` reloads once.

## Files and uploads

`POST /api/uploads` takes one or many parts named `files`. Hono's form parser yields a `File` for one part and `File[]` for several; the schema preprocesses that into an array of 1 to 5. Each file must be one of png, jpeg, webp, text, or pdf, at most 256 kB, and the bytes must match the type. The stored name is `crypto.randomUUID()` plus an extension from the validated type. The client filename is kept only as a display name: path separators are stripped, and `Content-Disposition` is built from that display name with an ASCII fallback and `filename*`. Download looks up the id, then resolves `id + ext` and checks the path stays inside the upload directory.

`/api/openapi.json` describes `multipart/form-data` with `format: binary` (component `UploadForm`). `/api/docs` is Scalar 0.12.13 and returns HTML that contains Scalar. Both are asserted by `bun test`.

Upload progress: the hub uses `XMLHttpRequest` `upload.onprogress` when that constructor exists (it does in window and worker contexts that have XHR; it does not in a service worker). Otherwise it builds the multipart body and feeds `fetch` a `ReadableStream` with `duplex: 'half'`, counting bytes as the runtime pulls them. That second number is "bytes the runtime has read", which is the closest `fetch` can get. Progress events go only to the tab that started the upload. The new file list reaches every tab through the SSE snapshot.

## Auth and CSRF

`POST /api/session` sets an httpOnly `SameSite=Lax` cookie. The hub keeps no token in JavaScript. Concurrent 401s share one refresh promise. If the retry is still 401, tabs get `session-lost`. A thrown network error rejects that call and does not ask for a reload.

`SameSite=Lax` still allows a cross-site top-level POST. Mutations therefore reject a foreign `Origin`, and reject `Sec-Fetch-Site` when it is present and not `same-origin` or `none`. curl and `app.request` send neither header, so tests and the manual curl keep working. Browser `fetch` from the worker sends both.

## Tests

`bun test` (21 tests) and `tsc --noEmit` pass.

- Field errors for an empty name, a bad email, and an empty message.
- One file and several files; display names lose directories; on-disk names match `uuid.ext`; a sibling canary file is untouched.
- Oversize file, disallowed type, and a PNG content-type whose bytes are not a PNG.
- `Content-Length` above the body limit returns 413.
- Download ids `../package.json`, encoded `..`, and a non-uuid do not return file contents.
- OpenAPI multipart and the event stream; Scalar HTML.
- SSE delivers a profile save; a cursor behind the ring buffer returns `resync`.
- Hub: one in-flight GET shared, a new subscriber does not refetch, an event updates every attached port, an older version does not, `bye` stops delivery, offline GET is the cached body, offline PUT is 503, one session POST for two parallel 401s, a network throw is `http-error` and not `session-lost`, a warm cache performs no requests.
- `hc` paths are `/api/profile`, `/api/uploads`, `/api/uploads/:id`.
- Service-worker policy: not POST, not `/api`, not another origin; navigations are network-first; `/assets/` is cache-first.

## Manual check

Production server:

```bash
cd research/data-layer
bun install
bun test
bun run build
PORT=4317 CLEAN_UPLOADS=1 bun src/server/index.ts
```

Three tabs at `http://127.0.0.1:4317/`:

1. Each tab's header says `shared-worker` (or `leader` if the browser has no SharedWorker). The hub log is the same list in every tab.
2. DevTools on a tab shows no `/api/` document requests. Those run inside the worker (`chrome://inspect/#workers`).
3. Save the profile in tab A, with a bad email first. The field error appears under Email. Fix it. Tabs B and C show the new name without a new GET, and the log grows by one `EVENT /api/profile` line.
4. Drop two small `.txt` or `.png` files on tab A. The progress bar moves on A. The list appears on B and C. The download link uses the id. The saved file's name on disk is a uuid, not the dropped name.
5. In another shell:

```bash
curl -c /tmp/cj -b /tmp/cj -X POST http://127.0.0.1:4317/api/session \
  -H 'content-type: application/json' -d '{}'
curl -b /tmp/cj -X PUT http://127.0.0.1:4317/api/profile \
  -H 'content-type: application/json' \
  -d '{"name":"Grace","email":"grace@example.com","message":"From curl"}'
```

All three tabs show Grace.

6. Open a fourth tab. It renders the current profile immediately. The log does not gain another `POST /api/session`.
7. Offline: DevTools network offline, then reload. The shell loads. The banner names the saved time. Save and upload are disabled. Back online, the banner goes away.
8. Rebuild, reload once so the new service worker installs, and confirm the reload button appears instead of a silent swap.

`bun scripts/check-browser.ts` does steps 1 and 5 with headless Chrome (PUT `/json/new` on the DevTools port; current Chrome rejects GET). It is what was run here against Chrome 156.

Dev (`bun run dev`) is two processes: Bun on 4317, Vite on 5173. The proxy sets `X-Forwarded-Host` so the CSRF origin check sees the page, not the API port. The service worker is not registered in dev.

## Guidance for the template

1. One `OpenAPIHono` with `basePath('/api')` set before routes, `defaultHook` returning `{ error, fields }` at 400, and `onError` that logs and returns a fixed 500. Chain `.openapi()` and export `type AppType = ReturnType<typeof buildApi>`. Mount SSE, Scalar, and `notFound` after that type is captured.
2. Schemas live in a module imported by the server and, as values, only by the worker. The page imports them with `import type` if it needs a name.
3. `src/client/api.ts` creates `hc<AppType>(origin, { fetch: connection.fetch })`. Components call helpers in that module. Do not add a hand-written `interface` per route.
4. `connectHub()` hides SharedWorker, leader election, and the solo fallback. The rest of the app never branches on `typeof SharedWorker`.
5. Responses that should update every tab set `X-Topic`, `X-Version`, and `X-Cursor`, and `publish` the same version on the bus. The hub stores the body and ignores older versions. Do not maintain a second invalidation map on the client.
6. Do not put the SSE route in `AppType`. Do not return `c.notFound()` or a bare `Response` from a JSON route.
7. Session cookie: httpOnly, `SameSite=Lax`, `Secure` in production, plus the Origin / `Sec-Fetch-Site` check on mutations. No token in `localStorage`.
8. Uploads go through `uploadFiles`, not through `hc`'s `fetch`, so progress has a callback. Downloads are ordinary links; do not pipe file bytes through the worker.
9. Service worker as in `src/sw.ts`. Do not add Workbox. Do not cache `/api` in the service worker. The hub's Cache Storage is the GET cache.
10. Offline writes stay disabled until a product has a real conflict story. The banner and the 503 are the starter.
11. When a route group gets large enough to slow the language server, export `type Client = typeof client` from a module that mentions `hc<AppType>` once, and split route modules so each chain stays small. Still no codegen and no `.d.ts` post-processing.
12. Dev can stay "Vite proxies to Bun" as in this PoC, because the event stream is a normal response from `Bun.serve`. `@hono/vite-dev-server` is the alternative when you want one process and you have confirmed the middleware does not buffer `text/event-stream`. Production is one `Bun.serve`: API routes, then hashed assets as `immutable`, then `index.html`, and `/api/*` never falls through to HTML.

## Gotchas

- Bun's multipart parser appends `;charset=utf-8` to `text/plain`, and it drops `Content-Type` when the filename has no extension (`passwd` arrived as type `""`, `passwd.txt` did not). Normalize with `type.split(';')[0]`. Treat an empty type as rejected. In this Bun, the parsed part's `constructor.name` is `Blob` while `instanceof File` is still true; validate with `instanceof File` or `Blob`, not the constructor name.
- `bodyLimit` trusts `Content-Length` when there is no `Transfer-Encoding`, and otherwise buffers until the cap. Zod's per-file cap still runs after parse. Set the body cap above the per-file cap so multipart overhead fits, and keep both checks.
- `z.instanceof(File).openapi({ type: 'string', format: 'binary' })` is what puts `format: binary` in the component schema. The path body is a `$ref`; assert the component, not the ref string.
- Hono RPC will not see the `defaultHook` body unless `400` is also in `responses`. The handler's `c.json(..., 400)` must use a numeric literal. A helper that takes `status: 200 | 400 | 401` widens every response to `unknown` and fails the route's return type. Set headers, then return `c.json(value, 200)` from the handler.
- `$get` / `$post` / `$url` are the client. Query values are strings.
- Do not `transfer` a deduped JSON body; two waiters need it. Do transfer upload `ArrayBuffer`s.
- Cache Storage and Web Locks need a secure context.
- The topic cache is per origin. Two accounts on one origin would share it. Key the cache by user id before that exists.
- `Last-Event-ID` of `0` means "I have no cursor", not "replay the world". A gap, not an empty buffer, is what triggers `resync`.
- The in-memory bus dies with the process. A restart is a `resync` (the new process's buffer does not contain the old cursor). That is acceptable for the starter; a durable log is a database, which this template does not have yet.
