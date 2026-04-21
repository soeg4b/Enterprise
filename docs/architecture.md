# Architecture

PDC Enterprise is a modular monolith with offline-capable mobile, packaged as an npm-workspaces monorepo.

See also: [data-model.md](data-model.md), [milestone-engine.md](milestone-engine.md), [api.md](api.md), [security.md](security.md).

## 1. Containers (C4 Level 2)

```
+-------------------+        +-------------------+        +-------------------+
|  Web (Next.js 14) |        |  Mobile (Expo RN) |        |  Adminer (dev)    |
|  Port 3601        |        |  iOS / Android    |        |  Port 3606        |
+---------+---------+        +---------+---------+        +---------+---------+
          |                            |                            |
          |  HTTPS (JWT Bearer)        |  HTTPS (JWT Bearer)        |
          v                            v                            v
+--------------------------------------------------------------------------+
|                     Backend API (Fastify, Node 20)                       |
|                     Port 4000   /v1/**  +  /healthz /readyz              |
|                                                                          |
|  Routes  ->  Auth / RBAC  ->  Modules ->  Prisma  ->  Postgres 16        |
|                                |                                         |
|                                +->  BullMQ producer                      |
|                                +->  Cache get/set      Redis 7           |
|                                                                          |
|  Workers (in-process for MVP):                                           |
|    milestone.worker     <- BullMQ "milestone:recompute"                  |
|    import.worker        <- BullMQ "import:parse"                         |
+----+--------------------+--------------------+--------------------+------+
     |                    |                    |                    |
     v                    v                    v                    v
+----------+        +----------+         +----------+         +----------+
| Postgres |        |  Redis   |         | MinIO/S3 |         |  SMTP    |
|   16     |        |   7      |         | (objects)|         | (Phase2) |
+----------+        +----------+         +----------+         +----------+
```

## 2. Modules (C4 Level 3, backend monolith)

```
src/backend/src/
  server.ts             Fastify bootstrap, CORS, security headers, error handler
  config/env.ts         zod-validated env
  auth/                 JWT (access + refresh namespaces), bcrypt, requireAuth/Role
  middleware/           in-process token-bucket rate limiter
  db/                   Prisma + Redis singletons, soft-delete middleware
  engine/milestone.ts   pure compute (Progress %, GAP, OverallStatus)
  services/cache.ts     SCAN-based Redis cache w/ getOrBuild + invalidatePattern
  audit/audit.ts        append-only audit writer
  queues/queues.ts      BullMQ producer (milestone, import, notification)
  workers/              in-process consumers
  modules/
    auth, users, orders, sites, milestones, imports, reports,
    sync, notifications, stubs (501 placeholders)
```

## 3. Request lifecycle

1. nginx (prod) terminates TLS, applies per-IP rate limits, forwards to backend.
2. Fastify assigns `X-Request-Id`, runs CORS + security headers.
3. `requireAuth` decodes the JWT (default namespace = access). Refresh tokens use the dedicated `refresh` namespace + secret.
4. `requireRole(...)` enforces RBAC. See [rbac.md](rbac.md).
5. Route validates body / params / query with Zod. Failures = RFC 7807 `400 VALIDATION_FAILED`.
6. Service performs Prisma calls (parameterised), audit-writes via `audit()`, optionally enqueues a BullMQ job.
7. Response envelope is JSON; errors follow `{type,title,status,code,detail,errors?,requestId}`.

## 4. Domain model (high level)

`Order` -> `SO` -> `SOW` -> `Site (NE/FE)` -> `Milestone (10 types)` plus `VendorAssignment`, `RevenueClaim`, `CapexBudget/Entry`, `FieldUpdate`, `Photo`. Engine outputs (`progressPct`, `gapDays`, `warningLevel`, `lastComputedAt`) are denormalised on `SOW` and `Site` for sub-second dashboard reads.

Full ERD: [data-model.md](data-model.md).

## 5. Mobile sync architecture

Push/pull over `/v1/sync/*`. Mobile keeps an `expo-sqlite` mirror plus an `outbox` table keyed by client UUID. See [mobile.md](mobile.md) and [api.md](api.md#sync).

Conflict policy:
- `Milestone.status` / `actualDate`: server-wins on `updatedAt`; client receives `REJECTED_STALE` + `serverState`.
- `Milestone.remark`: append-only with `[ts][author]` prefix.
- `Photo` / `FieldUpdate`: append-only, deduped by `clientId`.

## 6. Cross-cutting

- Logging: Pino JSON to stdout, redacted (`authorization`, `cookie`, `*.password*`, tokens, `set-cookie`).
- Tracing: `X-Request-Id` propagation; OpenTelemetry planned (Phase 2).
- Cache: Redis namespaced keys; SCAN-based invalidation; BOD report TTL = 60 s.
- Audit: append-only via app convention plus Postgres trigger denying UPDATE/DELETE on `AuditLog` (see [security.md](security.md)).

## 7. Deployment topology

Dev: `docker compose up`. Staging/Prod: nginx -> backend (N) + web (N), managed Postgres + Redis, S3 for blobs, Loki/Prometheus/Grafana. Full plan: [deployment.md](deployment.md).
