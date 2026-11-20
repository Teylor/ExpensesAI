# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10.34.9
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/domain ./packages/domain
COPY apps/web ./apps/web

RUN pnpm --filter @agenticf/domain build && pnpm --filter @agenticf/web build

FROM caddy:2-alpine AS runner
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/web/dist /srv/web

EXPOSE 80
