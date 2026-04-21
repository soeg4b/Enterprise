# syntax=docker/dockerfile:1.7
# Frontend (Next.js) multi-stage build (non-root, healthchecked)
FROM node:25-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
COPY src/shared/package.json src/shared/package.json
COPY src/frontend/package.json src/frontend/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:25-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm -w deliveriq-shared run build || true
RUN npm -w deliveriq-frontend run build
RUN npm prune --omit=dev --workspaces --include-workspace-root || true

FROM node:25-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3601
RUN apk add --no-cache tini curl \
 && addgroup -S app -g 1001 \
 && adduser  -S app -u 1001 -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/src/frontend ./src/frontend
COPY --from=build --chown=app:app /app/src/shared ./src/shared
COPY --from=build --chown=app:app /app/package.json ./package.json
USER app
WORKDIR /app/src/frontend
EXPOSE 3601
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3601/ || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "start"]
