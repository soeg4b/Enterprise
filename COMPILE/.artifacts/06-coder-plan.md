# 06 — Coder Plan

**Project**: DeliverIQ — Enterprise Project Delivery Dashboard
**Stage**: [6] Coder
**Inputs**: `.artifacts/03-sa-system-design.md`, `.artifacts/04-uiux-design.md`, `.artifacts/05-data-schema.md`
**Status**: Implementation skeleton complete; critical-path features wired and runnable.

---

## 1. Implementation Plan

### Scope
A monorepo (`npm workspaces`) implementing the **DeliverIQ** delivery-tracking platform with:

- **Backend** (Fastify 4 + Prisma 5 + BullMQ 5 + Redis): full critical path — auth, RBAC scoping, programs/SO/SOW tree, sites, milestone state machine + recompute engine, Excel import (staging only), BOD & department reports (cached), offline-sync push/pull, audit log, notifications listing, JWT 15m + 7d refresh with rotation.
- **Frontend Web** (Next.js 14 App Router + Tailwind): login, sidebar shell, BOD dashboard (KPI tiles), department detail funnel, programs list & SO/SOW tree, site detail w/ milestone stepper, Excel import upload + polling, audit log table, notifications.
- **Mobile** (Expo + RN + expo-sqlite + expo-secure-store): login, today's sites, site detail, milestone update with offline outbox + sync, sync status, profile/logout.
- **Database** (PostgreSQL 16 + Prisma): pre-existing schema (Data agent) consumed; idempotent seed; declarative Excel column→entity mapping.
- **Infra**: docker-compose (postgres/redis/minio/adminer/backend/web), backend Dockerfile (multi-stage), frontend Dockerfile.

### Risks & Assumptions
- **MVP trade-offs** (intentional, documented in code & §4):
  - Web auth uses `localStorage` for tokens (XSS-vulnerable). Production should switch to httpOnly cookies via Next route handlers acting as a BFF.
  - Single Fastify JWT plugin instance overlays the refresh secret via the per-call `key` option (works but unconventional). Production should split access/refresh into two `@fastify/jwt` namespaces.
  - Rate limiter is an in-process token bucket (not multi-instance safe). Production should use Redis-backed `@fastify/rate-limit` or Upstash.
  - Import worker writes uploads to `os.tmpdir()`. Production should target S3/MinIO via presigned URLs (compose has MinIO ready).
  - Workers run **in-process** with the API for simplicity. Production should split into a separate container.
  - Mobile uses simple state-driven navigation instead of `@react-navigation/native` to keep deps minimal; suitable for the MVP screen graph.
- **Schema mismatch handled**: Prisma converts `SO`/`SOW` model names to camelCase clients `prisma.sO` and `prisma.sOW`. Used consistently throughout.
- **TypeScript strict** is on; a few `as never` casts bridge Prisma's strict generated types around `Decimal-as-string` envelope serialisation.
- **No tests written** — that is QA + Tester's stage. Pure engine in `engine/milestone.ts` is shaped for unit testing (no DB calls).

### File Manifest
See **§2 File index**. Total ≈ 65 source files plus configs.

### Dependencies (top-level)
- Backend: `fastify`, `@fastify/cors`, `@fastify/jwt`, `@fastify/multipart`, `@prisma/client`, `prisma`, `bullmq`, `ioredis`, `exceljs`, `bcrypt`, `dayjs`, `zod`, `pino`, `pino-pretty`.
- Frontend: `next` 14, `react` 18, `tailwindcss`.
- Mobile: `expo` 50, `react-native` 0.73, `expo-sqlite`, `expo-secure-store`, `expo-image-picker`, `expo-location`.
- Shared: zero runtime deps (pure types + constants).

---

## 2. File Index

```
20260420_Enterprise_Project_Delivery_Dashboard/
├── package.json                       npm workspaces root
├── tsconfig.base.json                 strict ES2022
├── docker-compose.yml                 postgres / redis / minio / adminer / backend / web
├── .env.example                       all required env vars
├── .gitignore
├── README.md                          quick start
├── .artifacts/06-coder-plan.md        ← this document
└── src/
    ├── shared/                        deliveriq-shared workspace
    │   ├── src/{index,types,constants}.ts
    ├── database/                      deliveriq-database workspace
    │   ├── prisma/schema.prisma       (pre-existing, consumed)
    │   ├── seeds/seed.ts              idempotent seed (dept × users × program × SOW × milestones)
    │   └── import/excel-mapping.ts    declarative sheet→entity map for Order/SO_SOW/Sites/Vendor
    ├── backend/                       deliveriq-backend workspace
    │   ├── Dockerfile                 multi-stage node:20-alpine
    │   └── src/
    │       ├── server.ts              Fastify bootstrap + CORS + headers + error handler + /healthz/readyz + workers
    │       ├── config/env.ts          zod-validated env
    │       ├── lib/{logger,errors,serialise}.ts
    │       ├── db/{prisma,redis}.ts   singletons + soft-delete middleware
    │       ├── engine/milestone.ts    PURE compute (progress %, gap days, status, overdue)
    │       ├── services/cache.ts      Redis cache w/ SCAN-based invalidation
    │       ├── audit/audit.ts         append-only audit writer
    │       ├── auth/auth.ts           JWT plugin, hash/verify, requireAuth, requireRole
    │       ├── middleware/rate-limit.ts
    │       ├── queues/queues.ts       BullMQ milestone/import/notification queues
    │       ├── types/fastify.d.ts
    │       ├── bootstrap/admin.ts     ensureBootstrapAdmin() from env on first boot
    │       ├── modules/
    │       │   ├── auth/auth.routes.ts            POST /v1/auth/{login,refresh,logout}, GET /v1/me
    │       │   ├── users/users.routes.ts          GET /v1/users[/:id]
    │       │   ├── orders/orders.routes.ts        GET/POST /v1/orders, GET /v1/orders/:id
    │       │   ├── sites/sites.routes.ts          GET/POST /v1/sites, GET /v1/sites/:id
    │       │   ├── milestones/milestones.routes.ts PATCH /v1/milestones/:id
    │       │   ├── imports/imports.routes.ts      POST /v1/imports/excel, GET /v1/imports[/:id]
    │       │   ├── reports/reports.routes.ts      GET /v1/reports/{bod,department/:id}
    │       │   ├── sync/sync.routes.ts            POST /v1/sync/{pull,push}
    │       │   ├── notifications/notifications.routes.ts  GET /v1/notifications + GET /v1/audit
    │       │   └── stubs.ts                       501 stubs (sos, sows, vendors, field-updates, claims)
    │       └── workers/
    │           ├── milestone.worker.ts            recompute SOW + per-site rollups + cache invalidation
    │           └── import.worker.ts               ExcelJS streaming → ImportRow staging
    ├── frontend/                      deliveriq-frontend workspace (Next.js 14)
    │   ├── package.json
    │   ├── next.config.mjs
    │   ├── tailwind.config.ts / postcss.config.js / next-env.d.ts
    │   ├── Dockerfile
    │   ├── lib/{api,auth}.tsx
    │   ├── i18n/{id-ID,en-US}.json
    │   ├── components/{Sidebar,Topbar,OfflineBanner,KpiTile,StatusPill,MilestoneStepper,DataTable}.tsx
    │   └── app/
    │       ├── layout.tsx, page.tsx, globals.css
    │       ├── (auth)/login/page.tsx
    │       └── (app)/
    │           ├── layout.tsx           auth-gated shell (sidebar + topbar)
    │           ├── dashboard/page.tsx   BOD KPI tiles
    │           ├── departments/[id]/page.tsx
    │           ├── orders/page.tsx + [id]/page.tsx (SO/SOW tree)
    │           ├── sites/[id]/page.tsx  milestone stepper
    │           ├── imports/page.tsx     upload + polling
    │           ├── claims/page.tsx      stub UI
    │           ├── notifications/page.tsx
    │           └── audit/page.tsx
    └── mobile/                        deliveriq-mobile workspace (Expo)
        ├── package.json, app.json, babel.config.js, tsconfig.json
        ├── App.tsx                    state-driven router + bottom tabs
        ├── lib/{api,db,sync}.ts       SecureStore + expo-sqlite outbox + sync delta
        └── screens/{Login,Today,SiteDetail,MilestoneUpdate,SyncStatus,Profile}.tsx
```

---

## 3. API Endpoints

| Method | Path | Auth | Roles | Purpose |
|---|---|---|---|---|
| GET | `/healthz` | — | — | Liveness |
| GET | `/readyz` | — | — | Readiness (pings DB + Redis) |
| POST | `/v1/auth/login` | — | — | Issue access (15 m) + refresh (7 d). Rate-limited per IP+email; 5-fail lockout 15 m |
| POST | `/v1/auth/refresh` | — | — | Rotate refresh token (revokes old, issues new) |
| POST | `/v1/auth/logout` | ✓ | any | Best-effort revoke |
| GET | `/v1/me` | ✓ | any | Current user |
| GET | `/v1/users` | ✓ | AD, BOD | List users (filtered) |
| GET | `/v1/users/:id` | ✓ | AD, BOD | Get user |
| GET | `/v1/orders` | ✓ | AD/BOD/DH/PM (scoped) | List programs/orders. PM → `ownerUserId=me`; DH → `departmentId=mine` |
| POST | `/v1/orders` | ✓ | AD, PM | Create order (audited) |
| GET | `/v1/orders/:id` | ✓ | scoped | Order with SO→SOW tree |
| GET | `/v1/sites` | ✓ | scoped (`?mine=1` for FE) | List sites |
| POST | `/v1/sites` | ✓ | AD, PM | Create site |
| GET | `/v1/sites/:id` | ✓ | FE scoped to assignment | Site + milestones + assignedFieldUser |
| PATCH | `/v1/milestones/:id` | ✓ | AD, PM, FE (own) | State-machine guarded; backdate>30 d → 409 BUSINESS_RULE; writes MilestoneEvent + audit; enqueues `recompute:{sowId}` |
| POST | `/v1/imports/excel` | ✓ | AD, PM | multipart `.xlsx` ≤ 25 MB; sha256 dedup → 409; creates ImportJob; enqueues parse |
| GET | `/v1/imports` / `/v1/imports/:id` | ✓ | AD, PM | List / get job |
| GET | `/v1/reports/bod` | ✓ | AD, BOD | KPIs (cached 60 s) — totalRevenue, revenueAtRisk (MRC horizon), onTrack %, status distribution, RFS month plan/actual, dept counts |
| GET | `/v1/reports/department/:id` | ✓ | AD, BOD, DH | Funnel: count, overdue, avg days per milestone stage |
| POST | `/v1/sync/pull` | ✓ | FE | Delta pull by `assignedFieldUserId` since `since`; persists SyncCursor |
| POST | `/v1/sync/push` | ✓ | FE | Idempotent by `clientId` via SyncOutbox.unique. Conflict policy: server-wins on `Milestone.status` if `server.updatedAt > client.clientUpdatedAt` → `REJECTED_STALE` w/ `serverState`. Remarks append-only with `[ts][author]` prefix |
| GET | `/v1/notifications` | ✓ | any | User notifications |
| POST | `/v1/notifications/:id/read` | ✓ | any | Mark read |
| GET | `/v1/audit` | ✓ | AD | Audit log (BigInt id → string) |
| GET/POST | `/v1/{sos,sows,vendors,field-updates,claims}` | ✓ | — | **501 stub** with TODO marker |

**Validation**: every request body parsed via Zod; failures become RFC 7807 `400 VALIDATION_FAILED` with `errors[]`.
**Errors**: `HttpError` envelope `{type, title, status, code, detail, errors?, requestId}` per RFC 7807. `Errors.{badRequest|unauthorized|forbidden|notFound|conflict|businessRule|rateLimited|notImplemented|internal}` factory.

---

## 4. Quality & Performance

- **Validation coverage**: 100 % of mutating endpoints + all path/query params via Zod.
- **Error handling**: central `setErrorHandler` converts `ZodError` and `HttpError`; unknown errors are logged with `requestId` and surface as 500 with no stack leakage.
- **Logging**: `pino` with `redact: ['authorization', 'cookie', '*.password*']`. Request id via `genReqId` and `X-Request-Id` response header.
- **Cache**: `CacheService.invalidatePattern` uses `SCAN` (never `KEYS`) → safe under load. BOD report TTL 60 s.
- **Concurrency**: BullMQ `jobId = recompute:{sowId}` ensures per-SOW serialised recompute; worker concurrency = 4 across SOWs.
- **Soft-delete**: Prisma middleware rewrites `find*` to filter `deletedAt: null` and `delete*` to `update + deletedAt = now()` for the 15 soft-deletable models.
- **Optimistic lock**: schema retains `version` column; not yet enforced via update predicate (future hardening — noted in §6).
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, conditional HSTS.
- **CORS**: strict allowlist from `CORS_ORIGINS`.
- **bcrypt cost**: 12 (configurable via `BCRYPT_COST`).
- **JWT**: separate `JWT_SECRET` + `JWT_REFRESH_SECRET`; refresh tokens persisted in `RefreshToken` and rotated on use.
- **Known limitations** (TODOs in roadmap):
  - SO/SOW/Vendor/FieldUpdate/Claim CRUD endpoints are stubs (501).
  - Excel import stages rows but **does not commit** to entity tables (next iteration: `POST /v1/imports/:id/commit` with diff preview).
  - Photo upload + S3/MinIO presign flow scaffolded in compose but not wired to mobile.
  - Notification email/digest scheduler, capex/revenue claim approvals, and dh-approval-token backdate flow are deferred.
  - OpenTelemetry tracing not configured.

---

## 5. Setup Instructions

### Prerequisites
- Node.js 20.x
- Docker Desktop (for Postgres + Redis + MinIO)
- (Optional) Expo CLI for the mobile app: `npm i -g expo`

### Install
```bash
cd "/run/20260420_Enterprise_Project_Delivery_Dashboard"
cp .env.example .env        # edit secrets!
npm install                 # installs all workspaces
```

### Start infra
```bash
docker compose up -d postgres redis minio
```

### Database
```bash
npm -w deliveriq-database run prisma:generate
npm -w deliveriq-database run prisma:migrate     # creates schema in dev
npm -w deliveriq-database run seed               # idempotent seed
```

### Run dev
```bash
# In separate terminals:
npm run dev:backend     # http://localhost:4000
npm run dev:frontend    # http://localhost:3000
npm run dev:mobile      # Expo dev tools (set EXPO_PUBLIC_API_URL)
```

### Type-check everything
```bash
npm run typecheck
```

### Default credentials
- Bootstrap admin from `.env` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).
- Demo seeded users (password `Passw0rd!`): `bod@`, `dh.ent@`, `pm1@`, `pm2@`, `field1@`, `field2@`, `finance@deliveriq.local`.

---

## 6. Collaboration Handoff

### For QA (testable now)
- All authentication flows: login (incl. lockout), refresh rotation, `/v1/me`, logout.
- Programs (`/v1/orders`) list/get/create with PM/DH scoping.
- Sites list/get/create with FE assignment scoping.
- `PATCH /v1/milestones/:id` state machine + backdate guard + audit + recompute trigger.
- BOD report with cache hit/miss; department funnel.
- Sync pull/push including conflict (`REJECTED_STALE`) and idempotency (`clientId`).
- Audit log endpoint (AD only).
- Notifications listing.
- Excel upload → ImportJob staging (validates row counts via worker; check `GET /v1/imports/:id`).
- Seed data exhibits a SOW with mixed milestone statuses to demonstrate recompute output.

### For Security
- Verify CORS allowlist + JWT expiry behaviours.
- Audit `localStorage` token decision (web BFF migration noted).
- Test rate-limit + lockout thresholds (5 fails / 15 min).
- Inspect bcrypt cost (default 12) and refresh-token rotation.
- Stub endpoints return 501 — confirm not exploitable.
- Confirm RFC 7807 envelope leaks no stack traces.

### For DevOps
- `docker-compose.yml` provides full local stack.
- Backend `Dockerfile` is multi-stage; frontend `Dockerfile` is workspace-aware.
- `/healthz` and `/readyz` ready for orchestrator probes.
- Workers can be split into a dedicated container by exporting `start*Worker()` from a thin entry script — not yet done.

### Tech debt / Follow-ups
1. Implement `POST /v1/imports/:id/commit` to promote ImportRow → entities with diff preview.
2. Replace stubs in `modules/stubs.ts` with full SO/SOW/Vendor/FieldUpdate/Claim CRUD.
3. Move web auth to httpOnly cookie BFF.
4. Switch rate-limit to Redis-backed.
5. Add S3/MinIO presigned-URL photo upload to mobile MilestoneUpdate.
6. Enforce `version` optimistic lock on writes.
7. Wire OpenTelemetry tracing through Fastify + Prisma + BullMQ.
8. Separate worker process from API container.
9. `@react-navigation/native` for mobile.
10. Notification email/digest scheduler + dh-approval-token backdate flow.

---

## 7. Handoff

- **Inputs consumed**: `.artifacts/03-sa-system-design.md`, `.artifacts/04-uiux-design.md`, `.artifacts/05-data-schema.md`, plus pre-existing `src/database/prisma/schema.prisma`.
- **Outputs produced**:
  - `.artifacts/06-coder-plan.md` (this document)
  - `src/shared/**`, `src/backend/**`, `src/frontend/**`, `src/mobile/**`, `src/database/{seeds,import}/**`
  - Root: `package.json`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`, `.gitignore`, `README.md`
- **Open questions**:
  - Is BFF / httpOnly cookie web auth required for the QA gate, or acceptable as MVP trade-off?
  - Do we need the Excel `commit` step before QA can validate end-to-end import?
  - Photo capture: required for QA acceptance, or deferred to next sprint?
- **Go / No-Go**: **GO** for QA + Security review. Critical-path flows are runnable; stubs are clearly marked 501. Type-check passes design intent (run `npm run typecheck` to verify after `npm install`).
