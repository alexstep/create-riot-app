# Riot.js app

The demo scaffolded by `create-riot-app`: a top bar, a sliding menu, click sounds, and three screens. The runtime is Bun, the bundler is Vite, and the components are Riot 10 with TypeScript.

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

The menu opens from the button on the left. On a phone it can be pulled in with a swipe from the left edge. Sounds live in `public/sounds`. The drawer avatar is `VITE_APP_AVATAR_URL` in `.env`.

The default theme follows `prefers-color-scheme`. On Settings, the Light / Dark / System switch stores the choice in `localStorage` and sets `data-theme` on `<html>`.
