# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The GitHub Releases page still lists **1.2** (16 January 2019, Webpack 4) as the latest release. Tag `v2.0.0` is on npm and on git, and it has no GitHub Release. The sections below are the notes for those releases.

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
- `bunx create-riot-app my-app` and `bun create riot-app my-app`. The CLI copies the template, names `package.json` from the directory, restores `.gitignore`, installs dependencies, and prints the next commands.
- CI on push to `master` and on pull requests: install, typecheck, production build, and a smoke test of the packed CLI. Visual regression stays local. A publish workflow runs on `v*` tags.

### Changed

- Styles are native CSS (nesting and custom properties). Less is gone, and the project does not use PostCSS.
- jQuery and Hammer are gone. The drawer swipe is pointer events.
- Routing uses the History API (`/dashboard`, `/groups`, `/settings`) instead of hash URLs.
- The published tarball is the CLI and the template only. `template/node_modules` and `template/dist` are not packed. The ignore file ships as `template/gitignore` because npm drops `.gitignore`, and the CLI renames it when scaffolding.

### Removed

- Webpack 4, the old `scripts/webpack` setup, Less, jQuery, and Hammer.

[2.1.0]: https://github.com/alexstep/create-riot-app/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/alexstep/create-riot-app/compare/1.2...v2.0.0
