# Build the client, then serve dist/ with Bun. History routes fall back to index.html.

FROM oven/bun:1.4.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.3-slim AS runtime
WORKDIR /app
ENV PORT=4173
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=build --chown=bun:bun /app/scripts/serve-dist.ts ./scripts/serve-dist.ts
USER bun
EXPOSE 4173
CMD ["bun", "scripts/serve-dist.ts"]
