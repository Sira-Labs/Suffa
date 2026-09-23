# syntax=docker/dockerfile:1.7
# arabictutor-web: builds the offline-first PWA and serves it with Caddy.
# Build context is the repository root (same convention as Tabayyun's Dockerfiles).
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Supabase settings are compiled into the bundle by Vite (public anon key, protected by RLS).
# Leave them empty to build the pure offline variant (NoopSyncProvider).
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_SYNC_ENABLED="true"
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SYNC_ENABLED=$VITE_SYNC_ENABLED

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2-alpine AS web
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz-web || exit 1
