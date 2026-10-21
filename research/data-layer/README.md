# Data-layer research

Comparison and a runnable proof of concept for the full-stack Riot template. The write-up is [REPORT.md](./REPORT.md). This branch is not for merging into the template.

```bash
bun install
bun test
bun run typecheck
bun run build
bun run start          # http://127.0.0.1:4317
```

`bun run dev` runs the API on port 4317 and Vite on port 5173, with `/api` proxied and `X-Forwarded-Host` set so cookies and CSRF see the page origin.

With the production server up, `bun scripts/check-browser.ts` opens two headless Chrome tabs and checks that a curl profile update lands in both. Chrome must be installed. That script is not a test dependency.
