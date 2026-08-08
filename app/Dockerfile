FROM node:26.5.0-slim AS build

# Node 25+ images no longer bundle corepack; install pnpm directly.
RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Phase 7B Task 8: the e2e/screenshots compose override (compose.e2e.yml)
# passes this build arg so `vite build` inlines `import.meta.env
# .VITE_ENABLE_FAKE_MONITOR` as `"1"` — the ONLY thing that makes
# `src/monitor/transports/index.ts`'s fake-injection seam reachable in a
# build produced by THIS Dockerfile, since `compose.e2e.yml` overrides no
# other part of the `web` service and `import.meta.env.DEV` is `false` in
# every build this file ever produces (`vite build`, always — there is no
# `vite dev` path here). A REAL deploy (`scripts/deploy.sh`'s `docker
# compose up`, `compose.yml` alone, no override) never sets this arg, so it
# defaults to empty and the seam's dynamic `import("./fake")` stays
# provably dead code — `scripts/dist-grep.sh` is what proves that, not this
# comment.
ARG VITE_ENABLE_FAKE_MONITOR=""
ENV VITE_ENABLE_FAKE_MONITOR=$VITE_ENABLE_FAKE_MONITOR
RUN pnpm build

# ---- api: Express, JSON-only, ships zero client assets ----
FROM node:26.5.0-slim AS api

RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/drizzle ./drizzle

ENV NODE_ENV=production
ENV PORT=8080
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 8080

USER node

CMD ["node", "dist/server/server/index.js"]

# ---- web: nginx serving the Vite build, proxying /api ----
FROM nginxinc/nginx-unprivileged:1.30.4-alpine AS web

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client /usr/share/nginx/html

EXPOSE 8080
