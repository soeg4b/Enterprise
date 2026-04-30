# syntax=docker/dockerfile:1.7
# Backend multi-stage build (non-root, healthchecked)
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
COPY src/shared/package.json src/shared/package.json
COPY src/database/package.json src/database/package.json
COPY src/backend/package.json src/backend/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=src/database/prisma/schema.prisma
RUN npm -w deliveriq-shared run build || true
RUN npx tsc -p src/backend/tsconfig.json
RUN npm prune --omit=dev --workspaces --include-workspace-root || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3600 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
RUN apk add --no-cache tini openssl curl \
 && addgroup -S app -g 1001 \
 && adduser  -S app -u 1001 -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/src/backend/dist ./dist
COPY --from=build --chown=app:app /app/src/database/prisma ./prisma
COPY --from=build --chown=app:app /app/src/shared ./src/shared
COPY --from=build --chown=app:app /app/package.json ./package.json
RUN mkdir -p /app/data && chown app:app /app/data
USER app
EXPOSE 3600
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3600/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
