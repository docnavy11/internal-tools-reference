# syntax=docker/dockerfile:1

# ---- Stage 1: build ---------------------------------------------------------
# Builds the SPA (dist/client) and the bundled server (dist/server/main.js).
FROM node:22-alpine AS build
WORKDIR /app

# Install full deps (including dev) so the build tooling (vite, esbuild, tsc) is
# available. package-lock.json makes this reproducible.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: runtime ---------------------------------------------------------
# Small, production-only image. Only what's needed to run node dist/server/main.js.
FROM node:22-alpine AS runtime
WORKDIR /app

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

# Production dependencies only (no vite/esbuild/typescript/etc).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Build output and DB migrations. Migrations are applied at runtime from
# ./drizzle relative to the working directory (see runMigrations()), so this
# must land at /app/drizzle. Nothing else from source is copied in.
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

# Disk storage driver writes uploaded files here; docker-compose mounts a
# volume on this path. Only this directory is chowned to the non-root "node"
# user (built into the base image): everything else was written by root with
# the default umask, so it's already world-readable, and a recursive chown
# over node_modules would needlessly copy-up the whole layer (~240MB) in
# overlayfs.
RUN mkdir -p /app/data/files && chown node:node /app/data/files

USER node

EXPOSE 3000

# busybox wget ships in alpine, so no extra package is needed for the healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000/healthz || exit 1

CMD ["node", "dist/server/main.js"]
