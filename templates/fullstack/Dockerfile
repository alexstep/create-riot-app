FROM oven/bun:1.4.3
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
ENV NODE_ENV=production
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
