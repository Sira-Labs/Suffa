# syntax=docker/dockerfile:1.7
# suffa-api image (apps/api); the same image runs the worker with SUFFA_ROLE=worker.
# Build context is the repository root (npm workspaces, one lockfile).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY apps/api apps/api
RUN npm run build -w @suffa/api

# Production dependencies of the api workspace only.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
# npm nests packages it cannot hoist (e.g. better-auth) under the workspace; keep that
# directory even when it is empty so the runtime stage can always copy it.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace @suffa/api --include-workspace-root=false --no-audit --no-fund \
    && mkdir -p apps/api/node_modules

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/package.json ./
COPY apps/api/migrations ./migrations
ARG SUFFA_VERSION=dev
ENV SUFFA_VERSION=$SUFFA_VERSION
USER node
EXPOSE 8000
CMD ["node", "dist/main.js"]
