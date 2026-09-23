# syntax=docker/dockerfile:1.7
# suffa-api image; the same image runs the worker with SUFFA_ROLE=worker.
# Build context is the repository root.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY apps/api/package.json ./
COPY apps/api/migrations ./migrations
ARG SUFFA_VERSION=dev
ENV SUFFA_VERSION=$SUFFA_VERSION
USER node
EXPOSE 8000
CMD ["node", "dist/main.js"]
