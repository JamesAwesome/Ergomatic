FROM node:26.5.0-slim AS build

# Node 25+ images no longer bundle corepack; install pnpm directly.
RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
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
