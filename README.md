# create-riot-app

A Riot.js starter, in the spirit of Create React App. The CLI scaffolds a demo with a side drawer, sounds, and three screens. The dev server and production build run on Bun.

The repository has two layers:

- `bin/create-riot-app.ts` copies the template into a new directory.
- `template/` is the demo itself. A generated project is a copy of it.

## Stack

| | |
| --- | --- |
| Runtime and packages | [Bun](https://bun.sh) |
| UI | [Riot.js 10.1.6](https://riot.js.org) |
| Tag compiler | `@riotjs/compiler` 10.0.5 via `rollup-plugin-riot` |
| Router | `@riotjs/route` 10 |
| Dev server and build | [Vite](https://vite.dev) 8, with fast refresh and a production build |
| Language | TypeScript where Riot supports it (`lang="ts"` in components and plain `.ts` modules) |
| Styles | Native CSS: nesting, custom properties, `hsl(from …)` |

Riot 10 is the current stable line on npm (the last 9.x release is 9.4.11; 10.0.0 replaced it in August 2025). Components are still `.riot` files with `export default`. Riot does not publish a dedicated Vite plugin: the official compiler is a Rollup plugin, and Vite runs that plugin. Vite is used instead of `bun.build` because Bun has no equivalent dev server with hot reload for `.riot` files, while Vite provides both fast refresh and `vite build`.

## Create a project

```bash
bunx create-riot-app my-app
cd my-app
bun run dev
```

`bun create riot-app my-app` does the same thing. Bun runs `bunx create-riot-app my-app` for that command. The CLI installs dependencies, names `package.json` after the directory, and prints the next commands. `--no-install` copies files only. `--force` writes into a non-empty directory.

From a checkout of this repository, without publishing:

```bash
bun ./bin/create-riot-app.ts my-app
```

## Run the demo from this repository

```bash
cd template
bun install
bun run dev
```

Dev server: <http://localhost:5173>. Routes: `/dashboard`, `/groups`, `/settings`. The dev server and `vite preview` serve `index.html` for those paths, so a reload stays on the same screen.

Typecheck and production build:

```bash
bun run typecheck
bun run build
bun run preview
```

The build is written to `template/dist`.

## What the demo includes

- Top bar and a sliding drawer: button, dimmed overlay, 0.1s animation, and a swipe from the left edge on touch screens.
- Sounds in `public/sounds`: `tick` when the menu opens, a menu item is chosen, or the settings button is pressed; `hover` on mouse enter; `card` when a list card is selected. Mp3 is used when the browser cannot play Ogg. A rejected autoplay does not show up in the console.
- Screens: Dashboard, a list that loads the first ten photos from jsonplaceholder (spinner for about a second), Settings.
- On a narrow viewport the list hides the top bar while scrolling, as the old demo did.
- Icons, favicons, and the manifest live in `public/` and `src/icons`.

Application logic is TypeScript (`src/router.ts`, `src/sounds.ts`, `src/swipe.ts`, `src/api.ts`). Screens are `.riot` components with `lang="ts"`. Styles live in `src/styles` and are imported once. There is no jQuery and no Hammer.

The default theme follows `prefers-color-scheme`. On Settings, the Light / Dark / System switch stores the choice in `localStorage` and sets `data-theme` on `<html>`.

## Template scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Vite dev server with hot reload |
| `bun run build` | Production build in `dist/` |
| `bun run preview` | Serve the production build locally |
| `bun run typecheck` | `tsc --noEmit` for `.ts` files |
| `bun run lint` | Biome for `.ts`, `.css`, `.json`, and `.html`, plus `<script>` and `<style>` inside `.riot` |
| `bun run format` | Biome write. Markup inside `.riot` is left as authored |

## Lint and format

Biome 2.6.2 checks `.ts`, `.js`, `.css`, `.json`, and `.html` in the template and in `bin/`. It ignores `.riot` files. Parsing a tag as HTML fails: unquoted `{expr}` attributes are syntax errors, and `<script>` `import` / `export` is reported as being outside a module. Biome plugins cannot add a file type.

`scripts/biome-riot.ts` uses `@riotjs/parser` to find each `<script>` and `<style>` block, then runs Biome on that block. Diagnostics are printed with the `.riot` line and column. `--write` formats the block and splices it back at the same indentation. The tag markup is not formatted. An `each` without `key` is reported. `lang="ts"`, `export default`, `:host`, and CSS nesting are covered.

Biome 2.6.2's stdin mode does not return rule diagnostics, so the script writes each block to a temporary `*.riot.ts` or `*.riot.css` file and lints that path.

`.vscode` recommends the Biome extension and formats `.ts` and `.css` on save. `.riot` is not formatted on save. Run `bun run format`, or the `format` task in `.vscode/tasks.json`.

Unknown element selectors and untitled SVGs are not lint errors here: the tags are `app` and `drawer`, and the icons are decorative. Selector order is left as it is, because that order is the layout.

Variables prefixed with `VITE_` are read from `.env`. The drawer avatar URL is `VITE_APP_AVATAR_URL`.

## Visual test

`visual/test.ts` captures eight screens (desktop 1280×800 and mobile 390×844: home, open drawer, list, settings) in light and dark themes. The page list comes from the drawer menu. Light screens are compared with the legacy demo in `visual/baselines`. Dark screens are compared with `visual/baselines/dark`. On light captures the `[data-theme-control]` block is hidden, because that switch did not exist in the old demo; the rest of the layout must match. List photos are a local fixture, not the live API. Animations are disabled for screenshots. The same run checks the drawer animation, touch taps, the `tick` sound, the theme switch, and that the console has no errors. Chromium is launched with font hinting disabled so the legacy system font stack stays stable.

```bash
cd visual && bun install
bunx playwright install chromium
cd ..
bun run visual
```

Recapture baselines from a running server with:

```bash
cd visual && bun test.ts --update --url http://127.0.0.1:9999
cd visual && bun test.ts --update-dark --url http://127.0.0.1:5173
```
