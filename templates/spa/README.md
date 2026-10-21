# Riot.js app

The client-only template (`bunx create-riot-app@latest my-spa --template spa`): a top bar, a sliding menu, click sounds, and three screens. `bunx` caches packages, so `@latest` avoids an older copy. The runtime is Bun, the bundler is Vite, and the components are Riot 10 with TypeScript. The default `create-riot-app` template is the full-stack app, which serves this cabinet at `/app`.

```bash
bun install
bun run dev
```

Open <http://localhost:5173>. Routes: `/dashboard`, `/groups`, `/settings`.

```bash
bun run typecheck
bun run lint
bun run format
bun run build
bun run preview
```

`bun run lint` runs Biome, and also checks `<script>` and `<style>` inside `.riot` files. `bun run format` writes those fixes. Tag markup is not reformatted. Format-on-save covers `.ts` and `.css` only. For `.riot`, run `bun run format` or the `format` task.

The menu opens from the button on the left. On a phone it can be pulled in with a swipe from the left edge. Sounds live in `public/sounds`. The drawer avatar is `VITE_APP_AVATAR_URL` in `.env`. The template ships that file. If the variable is unset, the same default image is used, so `bun run dev` does not need any setup.

The default theme follows `prefers-color-scheme`. On Settings, the Light / Dark / System switch stores the choice in `localStorage` and sets `data-theme` on `<html>`.

Serve the production build locally with `bun run preview`. This template has no container image.
