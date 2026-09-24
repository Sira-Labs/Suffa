# syntax=docker/dockerfile:1.7
# suffa-web: builds the offline-first PWA (apps/web) and serves it with Caddy.
# Build context is the repository root (npm workspaces, one lockfile).
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Sync goes to suffa-api on the same origin; `off` builds the pure offline variant.
ARG VITE_SYNC_ENABLED="true"
ARG VITE_SYNC_BACKEND=""
ENV VITE_SYNC_ENABLED=$VITE_SYNC_ENABLED \
    VITE_SYNC_BACKEND=$VITE_SYNC_BACKEND

# Manifests first for layer caching; every workspace manifest is needed for `npm ci`.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/engagement/package.json packages/engagement/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY packages/engagement packages/engagement
COPY apps/web apps/web
# Release tag (sha-…) attached to browser error reports, matching the api's SUFFA_VERSION.
# Declared this late because it changes on every commit and would bust the npm ci cache.
ARG SUFFA_VERSION="dev"
RUN VITE_SUFFA_VERSION=$SUFFA_VERSION npm run build -w @suffa/web

FROM caddy:2-alpine AS web
# Reported by /healthz-web, so deploy checks can see which web image is live.
ARG SUFFA_VERSION="dev"
ENV SUFFA_VERSION=$SUFFA_VERSION
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz-web || exit 1
