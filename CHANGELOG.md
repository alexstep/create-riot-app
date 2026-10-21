# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.3] - 2026-10-21

### Fixed

- `bun test` could still open a `.riot` file from a deleted project after 3.1.2. Bun keys its global transpiler cache by source contents, so unchanged server files kept the absolute paths written by 3.1.0 and 3.1.1. `bun run test` now starts the test process with `BUN_RUNTIME_TRANSPILER_CACHE_PATH` set to `node_modules/.cache/bun-transpiler`. That directory is chosen before Bun reads the global cache, including on macOS, Linux, and Windows. A cache that is already poisoned is left unused.

## [3.1.2] - 2026-10-21

### Fixed

- `bun test` in a new full-stack app could throw `ENOENT` for a `.riot` file that belonged to a project already deleted. The test loader rewrote tag imports to absolute paths, and Bun's content-addressed transpiler cache reused that output for identical source. Imports are now project-relative (`riot:src/...`, `riot-file:src/...`) and resolved from the current directory when the file loads. `bun run dev` and `bun run build` use Vite and do not run this loader.

### Changed

- Docs and the CLI help use `bunx create-riot-app@latest` and `bun create riot-app@latest`. `bunx` otherwise reuses a cached older package.
- When npm has a newer release, the CLI prints one line. The lookup is skipped if it does not answer quickly or the network is down.

## [3.1.1] - 2026-10-21

### Fixed

- A new full-stack app starts with `bun run dev` when `.env` was never created. Outside production, missing `SESSION_SECRET` and `DEMO_PASSWORD` use demo defaults (password `demo`, and a dev-only session secret). The process prints one notice. The login page shows that password in development and fills it in.
- Production, including `bun run start` and the Docker image, still refuses to boot without `SESSION_SECRET`, `DEMO_PASSWORD`, and `PUBLIC_ORIGIN`. The process prints those names and exits, instead of a stack trace. `bun run start` stays production mode. The CLI writes `.env` from `.env.example`, and that file already sets `PUBLIC_ORIGIN=http://localhost:3000` and the demo secrets, so `bun run build && bun run start` works immediately after scaffolding.
- The CLI creates `.env` from `.env.example` when `.env` is absent, including on `--force` when a `.env` is already there (that file is left as-is). The printed next steps no longer include `cp .env.example .env`.
- The upload directory `tmp/uploads` is created on boot. A failure names the path. If `PORT` is already taken, `bun run start` says so.
- The client-only template still runs with no extra setup. `VITE_APP_AVATAR_URL` falls back to the image in `.env` when the variable is unset.
- In development, Vite compiles `.riot` files and raw `.svg` icons. The dev server was answering those URLs with "Not found", so the login form never hydrated and cabinet icons did not load.

## [3.1.0] - 2026-10-21

### Added

- The full-stack template hydrates server-rendered Riot tags. `theme-toggle`, `subscribe-form`, and `login-form` are in the first HTML response, and the client binds those nodes instead of rendering a second copy.
- Initial props are embedded as JSON in `<script type="application/json" id="riot-state">`. `<` is escaped, so the payload cannot close the script. The hydrated tag does not fetch that data again.
- `bun test` covers the server markup and a client bind that keeps the same DOM nodes, including text typed into an input before the module runs.

### Changed

- `@riotjs/hydrate` v10 is not used to bind those tags. It clones the root, mounts a new tree, and `replaceChild`s the server node. The template mounts Riot with DOM injection skipped, after copying the compiler's `exprN` markers onto the matching elements.
- The cabinet at `/app` stays client-rendered. One cached document still serves every cabinet URL.

### Removed

- `@riotjs/custom-elements` from the full-stack template. The log-in link is a plain anchor.

## [3.0.0] - 2026-10-21

The default scaffold is a full-stack Bun app. `2.1.0` was the client-only template.

### Breaking

- `bunx create-riot-app@latest my-app` now creates the full-stack app. Pass `--template spa` to get the client-only app that `2.x` created.

### Added

- `templates/fullstack`. One Bun process serves a Hono API, server-rendered Riot pages (`/` and `/about`), and the client cabinet at `/app`.
- `bunx create-riot-app@latest my-app --template spa` scaffolds the previous client-only app. The default template name is `fullstack`. Unknown names are rejected.
- Server-rendered landing pages with title, description, canonical, and Open Graph tags, plus `sitemap.xml` and `robots.txt`. Interactive parts of those pages are custom-element islands (`@riotjs/custom-elements`).
- Live updates over one Server-Sent Events stream with `Last-Event-ID` resume. Without SharedWorker, one tab takes a Web Lock and runs the same hub for the others over a BroadcastChannel.
- OpenAPI routes (`@hono/zod-openapi`), Scalar docs at `/api/docs`, and a typed `hc` client. A SharedWorker hub is the only browser client of the API. The Records screen (`/app/records`) validates a profile form and uploads files to `tmp/uploads`. One SSE stream updates every open tab. A service worker caches the app shell and disables offline writes. A failed fetch shows that the server is unreachable. An expired session sends every open tab to `/login`.
- Demo auth: signed httpOnly cookie, bearer token of the same value, in-memory sessions, login rate limit, and CSRF protection for cookie auth.
- `bun test` covers server HTML, auth, validation, and the OpenAPI document.
- `GET /api/health` for process checks.
- Multi-stage `Dockerfile` on `oven/bun` for the full-stack app (frozen lockfile, client and server build, slim non-root runtime, `HEALTHCHECK` on `/api/health`). The spa template has no container image.

### Changed

- The client template moved from `template/` to `templates/spa`. Package `files`, CI, and the visual suite follow that path.
- Cabinet routes in the full-stack template are `/app/dashboard`, `/app/groups`, `/app/settings`, and `/app/records`. The spa template keeps `/dashboard`, `/groups`, and `/settings`.

## [2.1.0] - 2026-10-21

One release for the interaction polish and for linting `.riot` files. `2.0.1` was not published.

### Added

- Biome 2.6.2 for `.ts`, `.js`, `.css`, `.json`, and `.html` in the template and the CLI.
- `scripts/biome-riot.ts` lints and formats `<script>` and `<style>` inside `.riot` files. `@riotjs/parser` finds the blocks, Biome checks each one, and diagnostics use the `.riot` line and column. Tag markup is not formatted. An `each` without `key` is reported.
- `lint`, `lint:fix`, and `format`. CI runs lint and `format:check`.
- The Biome VS Code extension. `.riot` is not part of format-on-save. `bun run format` or the `format` task covers those files.

### Changed

- Links, buttons, images, and drawer or menu items are not natively draggable (`draggable="false"` and `-webkit-user-drag: none`). Text in screen content and in form fields can still be selected. `user-select: none` applies only to chrome: the top bar, the drawer, buttons, and list cards.
- Tappable controls (buttons, the menu button, drawer rows, the profile link, and list cards) scale to `0.98` on `:active` over `0.1s`. `prefers-reduced-motion: reduce` removes the scale and the transition. The drawer panel keeps its own `translate3d`. An empty `touchstart` listener lets iOS apply `:active`.
- The drawer open and close animation is `0.1s`, three times faster than `0.3s`. Easing is unchanged. Swipe open and close still use that duration. The 100ms hamburger debounce is unchanged.
- Riot 10 cleanups: `key` on `each` lists, factory components so state is not shared, broken list images tracked in state, and `aria-hidden` / `aria-expanded` expressed in the template. `inert` stays a DOM property because Riot's boolean-attribute list does not include it.

## [2.0.0] - 2026-10-21

Rewrite of the 1.2 Webpack 4 starter. The demo is the same idea: a side drawer, sounds, and three screens (dashboard, list, settings).

### Added

- Bun for install, scripts, and the dev server. Vite 8 builds the app and serves history routes. Riot **10.1.6** (the current stable line; the last 9.x release is 9.4.11). TypeScript in `.ts` modules and in `.riot` scripts (`lang="ts"`).
- Light, dark, and system themes. Colors are CSS custom properties. The default follows `prefers-color-scheme`. The Settings switch stores the choice in `localStorage` and sets `data-theme` on `<html>`.
- `bunx create-riot-app@latest my-app` and `bun create riot-app@latest my-app`. The CLI copies the template, names `package.json` from the directory, restores `.gitignore`, installs dependencies, and prints the next commands.
- CI on push to `master` and on pull requests: install, typecheck, production build, and a smoke test of the packed CLI. Visual regression stays local. A publish workflow runs on `v*` tags.

### Changed

- Styles are native CSS (nesting and custom properties). Less is gone, and the project does not use PostCSS.
- jQuery and Hammer are gone. The drawer swipe is pointer events.
- Routing uses the History API (`/dashboard`, `/groups`, `/settings`) instead of hash URLs.
- The published tarball is the CLI and the template only. `template/node_modules` and `template/dist` are not packed. The ignore file ships as `template/gitignore` because npm drops `.gitignore`, and the CLI renames it when scaffolding.

### Removed

- Webpack 4, the old `scripts/webpack` setup, Less, jQuery, and Hammer.

[3.1.3]: https://github.com/alexstep/create-riot-app/compare/v3.1.2...v3.1.3
[3.1.2]: https://github.com/alexstep/create-riot-app/compare/v3.1.1...v3.1.2
[3.1.1]: https://github.com/alexstep/create-riot-app/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/alexstep/create-riot-app/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/alexstep/create-riot-app/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/alexstep/create-riot-app/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/alexstep/create-riot-app/compare/1.2...v2.0.0
