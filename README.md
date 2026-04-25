# DeliverIQ — Enterprise Project Delivery Dashboard

> Replace the multi-team Excel tracker with a role-shaped, offline-capable control tower for enterprise telecom delivery — from PO to RFS to revenue claim.

<!-- Badges (placeholders — wire to your CI/registry):
[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](.github/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-pending-lightgrey)](#)
[![License](https://img.shields.io/badge/license-Proprietary-blue)](#)
[![Version](https://img.shields.io/badge/version-0.1.0-blue)](docs/changelog.md)
-->

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech Stack & Dependencies](#tech-stack--dependencies)
4. [Prerequisites](#prerequisites)
5. [Quick Start](#quick-start)
6. [Environment Variables](#environment-variables)
7. [Port Map](#port-map)
8. [Database Setup](#database-setup)
9. [Running the Application](#running-the-application)
10. [Demo Accounts](#demo-accounts)
11. [Testing](#testing)
12. [Production Docker Build](#production-docker-build)
13. [Scripts Reference](#scripts-reference)
14. [Repository Layout](#repository-layout)
15. [RBAC Roles](#rbac-roles)
16. [Documentation](#documentation)
17. [Status & Known Limitations](#status--known-limitations)
18. [License](#license)

---

## Features

- Role-shaped web dashboards for **BOD**, **Dept Heads**, **PMs**, **Finance**, **Admin**.
- Offline-first **mobile app** (Expo / React Native) for Field Engineers + Mitra crews.
- Domain model native to telecom delivery: `Order -> SO -> SOW -> Site -> Milestone`.
- Pure **milestone engine**: auto Progress %, GAP days to RFS, On-Track / At-Risk / Delay.
- **Excel importer** for the legacy "Draft Dashboard.xlsx".
- BOD KPI report cached in Redis; recompute fan-out via BullMQ.
- Append-only **audit log** (DB trigger + AD-only read endpoint).
- Dual-namespace JWT (access + refresh) with rotation, lockout, RFC 7807 errors.
- i18n shell (id-ID + en-US).
- Partner delivery search across product, customer, project, and site.

---

## Architecture

```
+-------------------+     +-------------------+     +-------------------+
|  Web (Next.js 14) |     |  Mobile (Expo RN) |     |  Adminer (dev)    |
|  Port 3601        |     |  iOS / Android    |     |  Port 3606        |
+--------+----------+     +--------+----------+     +--------+----------+
         |                         |                          |
         |   HTTPS (JWT Bearer)    |   HTTPS (JWT Bearer)     |
         v                         v                          v
+-------------------------------------------------------------------------+
|              Backend API (Fastify 4, Node 20, TypeScript)               |
|              Port 3600   /v1/**  +  /healthz  /readyz                   |
|                                                                         |
|  Routes -> requireAuth / requireRole -> Modules -> Prisma -> Postgres   |
|                                  |                                      |
|                                  +-> BullMQ producer   -> Redis 7       |
|                                  +-> cache.getOrBuild  -> Redis 7       |
|                                                                         |
|  In-process workers (MVP):                                              |
|    milestone.worker  <- BullMQ queue "milestone:recompute"              |
|    import.worker     <- BullMQ queue "import:parse"                     |
+----+-------------------+-------------------+-----------------+----------+
     |                   |                   |                 |
     v                   v                   v                 v
+----------+       +----------+       +----------+       +----------+
| Postgres |       |  Redis   |       | MinIO/S3 |       |  nginx   |
|   16     |       |   7      |       | (blobs)  |       | (prod)   |
+----------+       +----------+       +----------+       +----------+
```

Full diagram and module breakdown: [docs/architecture.md](docs/architecture.md).

---

## Tech Stack & Dependencies

### Runtime infrastructure

| Service | Image | Dev port | Purpose |
|---|---|---|---|
| PostgreSQL | `postgres:16-alpine` | `3602` | Primary relational store |
| Redis | `redis:7-alpine` | `3603` | BullMQ queue + report cache |
| MinIO | `minio/minio:latest` | API `3604`, Console `3605` | S3-compatible blob storage |
| Adminer | `adminer:latest` | `3606` | DB browser (dev only) |
| nginx | `nginx:1.27-alpine` | `80` / `443` | Reverse proxy (prod overlay) |

### Backend (`src/backend`) — Node.js 20, TypeScript

| Package | Version | Purpose |
|---|---|---|
| `fastify` | ^4.27 | HTTP server framework |
| `@fastify/cors` | ^9.0 | CORS allowlist |
| `@fastify/jwt` | ^8.0 | JWT verify / sign (dual namespace) |
| `@fastify/multipart` | ^8.2 | Excel file upload |
| `@prisma/client` | ^5.13 | Database ORM |
| `bcrypt` | ^5.1 | Password hashing (cost 12) |
| `bullmq` | ^5.7 | Job queue (milestone, import workers) |
| `ioredis` | ^5.4 | Redis client |
| `zod` | ^3.23 | Request validation + env schema |
| `pino` / `pino-pretty` | ^9.1 / ^11 | Structured JSON logging |
| `dayjs` | ^1.11 | Date arithmetic |
| `exceljs` | ^4.4 | Parse uploaded `.xlsx` imports |
| `tsx` | ^4.7 | TypeScript watch runner (dev) |

### Frontend Web (`src/frontend`) — Next.js 14

| Package | Version | Purpose |
|---|---|---|
| `next` | ^14.2 | App Router, RSC, SSR/SSG |
| `react` / `react-dom` | ^18.3 | UI framework |
| `tailwindcss` | ^3.4 | Utility CSS |
| `@svg-maps/indonesia` | ^2.0 | Province distribution map |
| `postcss` / `autoprefixer` | ^8.4 / ^10.4 | CSS toolchain |

### Mobile (`src/mobile`) — Expo SDK 50

| Package | Version | Purpose |
|---|---|---|
| `expo` | ~50.0 | Managed React Native runtime |
| `react-native` | 0.73.6 | Native UI bridge |
| `expo-sqlite` | ~13.2 | Offline-first local DB mirror |
| `expo-secure-store` | ~12.8 | Encrypted token storage |
| `expo-image-picker` | ~14.7 | Field photo capture |
| `expo-location` | ~16.5 | GPS tagging |
| `expo-status-bar` | ~1.11 | Status bar control |

### Shared library (`src/shared`)

Pure TypeScript — zero runtime deps. Exports domain types, enums (`ProductCategory`, `OverallStatus`, milestone types, roles), and constants used by backend, frontend, and mobile.

### Database workspace (`src/database`)

| Package | Purpose |
|---|---|
| `prisma` (dev) | Migrations, studio, schema tooling |
| `@prisma/client` | Generated query client |
| `bcrypt` | Admin password hashing in seed |
| `dayjs` | Date construction in seed |

### Test suite (`tests`)

| Package | Purpose |
|---|---|
| `vitest` ^1.6 | Unit + integration test runner |
| `supertest` ^7.0 | HTTP assertion against Fastify app |
| `@playwright/test` ^1.44 | End-to-end browser tests |
| `zod` ^3.23 | Schema helpers in tests |
| `dayjs` ^1.11 | Date helpers |

### Observability (optional, `infra/monitoring`)

| Tool | Config | Dev port |
|---|---|---|
| Prometheus | `infra/monitoring/prometheus.yml` | `3608` |
| Grafana | `infra/monitoring/grafana-provisioning/` | `3609` |
| Loki | `infra/monitoring/loki-config.yml` | `3607` |
| Promtail | `infra/monitoring/promtail-config.yml` | sidecar |

### CI / security tooling (`.github/workflows`, `infra/ci`)

| Tool | Purpose |
|---|---|
| GitHub Actions | CI + staging deploy workflows |
| Trivy | Container + dependency CVE scan |
| gitleaks | Secret scanning on push |
| CycloneDX | SBOM generation on build |

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| **Node.js** | 20.10.0 | `node --version` |
| **npm** | 10.0.0 | `npm --version` |
| **Docker Desktop** | any recent | Required for Postgres, Redis, MinIO |
| **Git** | any recent | |
| **Expo Go** (optional) | latest | Mobile dev on physical device |
| **Playwright browsers** (optional) | Chromium | `npx playwright install chromium` for e2e tests |

> Windows users: use **PowerShell 7+** or WSL2. The bootstrap script requires PowerShell 5.1+.

---

## Quick Start

### Option A — One-shot bootstrap (recommended)

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap-demo.ps1
```

```bash
# macOS / Linux / WSL
bash scripts/bootstrap-demo.sh
```

The script:
1. Copies `.env.example` → `.env`
2. Starts Postgres + Redis + MinIO + Adminer via Docker Compose
3. Waits for container readiness
4. Generates the Prisma client
5. Applies schema migrations
6. Seeds demo data (5 customers, 5 orders, 8 SOWs/sites, claims, CAPEX, notifications)
7. Launches backend (`3600`) and frontend (`3601`) dev servers in new terminal windows (Windows)

### Option B — Manual steps

```bash
# 1. Clone and configure
git clone <repo-url>
cd 20260420_Enterprise_Project_Delivery_Dashboard
cp .env.example .env          # then edit: rotate JWT_SECRET, JWT_REFRESH_SECRET, SEED_ADMIN_PASSWORD

# 2. Start infra containers
docker compose up -d postgres redis minio adminer

# 3. Install all npm workspaces
npm install

# 4. Set up the database
npm run prisma:generate        # generate Prisma client
npm run prisma:migrate         # create/apply schema migrations
npm run prisma:seed            # seed admin + sample portfolio

# 5. Start dev servers (separate terminals)
npm run dev:backend            # http://localhost:3600  (API + workers, hot-reload)
npm run dev:frontend           # http://localhost:3601  (Next.js)
npm run dev:mobile             # Expo Metro on 3610 (optional)
```

### Option C — Full Docker stack

```bash
docker compose up --build
```

This builds and runs all services (backend, web, postgres, redis, minio) via Docker. Suitable for integration testing. For production, overlay with `docker-compose.prod.yml` (see [Production Docker Build](#production-docker-build)).

---

## Environment Variables

Copy `.env.example` to `.env` and set the following before first run:

### Required — rotate before use

| Variable | Default in `.env.example` | Description |
|---|---|---|
| `JWT_SECRET` | `change-me-to-a-32-byte-random-secret` | Access JWT signing secret (>= 32 bytes) |
| `JWT_REFRESH_SECRET` | `change-me-to-a-different-32-byte-random-secret` | Refresh JWT secret — must differ from above |
| `SEED_ADMIN_PASSWORD` | `ChangeMe!2026` | Password for bootstrap admin account |

### Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://deliveriq:deliveriq@localhost:3602/deliveriq?schema=public` | Postgres connection string. In Docker containers use `postgres` as host |

### Redis

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:3603/0` | Redis connection string. In containers use `redis:6379` |

### Auth tuning

| Variable | Default | Description |
|---|---|---|
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | `7d` | Refresh token lifetime |
| `BCRYPT_COST` | `12` | bcrypt work factor (raise for prod, affects login latency) |

### Bootstrap admin (first boot only)

| Variable | Default | Description |
|---|---|---|
| `SEED_ADMIN_EMAIL` | `admin@deliveriq.local` | Bootstrap admin email |
| `SEED_ADMIN_FULLNAME` | `System Administrator` | Display name |

### CORS

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:3601,http://localhost:3610` | Comma-separated allowed origins |

### S3 / MinIO

| Variable | Default | Description |
|---|---|---|
| `S3_ENDPOINT` | `http://localhost:3604` | MinIO API endpoint (or AWS S3 URL in prod) |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_BUCKET` | `deliveriq` | Default bucket name |
| `S3_ACCESS_KEY` | `deliveriq` | Access key (use IAM role in prod) |
| `S3_SECRET_KEY` | `deliveriqsecret` | Secret key |
| `S3_FORCE_PATH_STYLE` | `true` | Required for MinIO; set `false` for real AWS S3 |

### Frontend / Mobile API base

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3600` | Next.js client-side API base URL |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3600` | Expo/RN API base URL. Use LAN IP for physical device, `10.0.2.2` for Android emulator |

### Server

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `production` |
| `PORT` | `3600` | Backend listen port |
| `LOG_LEVEL` | `info` | Pino log level |
| `TZ` | `Asia/Jakarta` | Server timezone |
| `MRC_HORIZON_MONTHS` | `12` | BOD revenue-at-risk MRC horizon in months |

---

## Port Map

| Service | Host port | Internal port | Notes |
|---|---|---|---|
| Backend API | `3600` | `3600` | REST API, health at `/healthz`, readiness at `/readyz` |
| Frontend Web | `3601` | `3601` | Next.js app, login at `/login` |
| PostgreSQL | `3602` | `5432` | Primary DB |
| Redis | `3603` | `6379` | Cache + BullMQ |
| MinIO API | `3604` | `9000` | S3-compatible object store |
| MinIO Console | `3605` | `9001` | Web UI (credentials: `deliveriq` / `deliveriqsecret`) |
| Adminer | `3606` | `8080` | DB browser (dev profile only) |
| Loki | `3607` | `3100` | Log aggregation (optional, monitoring stack) |
| Prometheus | `3608` | `9090` | Metrics (optional, monitoring stack) |
| Grafana | `3609` | `3000` | Dashboards (optional, monitoring stack) |
| Expo Metro | `3610–3612` | n/a | React Native dev bundler |

---

## Database Setup

### Migrations

```bash
npm run prisma:generate       # generate @prisma/client from schema.prisma
npm run prisma:migrate        # run migrations in dev (creates schema on first run)
```

For production (no prompt, no shadow DB):
```bash
npx prisma migrate deploy --schema=src/database/prisma/schema.prisma
```

### Seed

```bash
npm run prisma:seed
```

Idempotent — safe to re-run. Creates:
- Bootstrap admin from `.env` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)
- 5 customers, 8 vendors, 2 departments
- 5 orders (PPO15-127 … PPO15-131) across 5 PMs
- 8 SOWs with sites, milestones, claims, CAPEX entries, and notifications

### Prisma Studio (DB browser)

```bash
cd src/database
npx prisma studio --schema=prisma/schema.prisma
```

---

## Running the Application

### Development

```bash
npm run dev:backend     # watch mode — Fastify on http://localhost:3600
npm run dev:frontend    # Next.js on http://localhost:3601
npm run dev:mobile      # Expo Metro on :3610 (scan QR with Expo Go)
```

Backend starts in-process BullMQ workers automatically. Backend requires Postgres and Redis to be running.

### Verify health

```bash
curl http://localhost:3600/healthz   # {"status":"ok","time":"..."}
curl http://localhost:3600/readyz    # {"status":"ready","db":"ok","redis":"ok"}
```

### Test a login

```bash
curl -sX POST http://localhost:3600/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@deliveriq.local","password":"ChangeMe!2026"}' | jq .
```

---

## Demo Accounts

All seeded users are available after `npm run prisma:seed`.

| Email | Password | Role | Access |
|---|---|---|---|
| `admin@deliveriq.local` | `ChangeMe!2026` | AD (Admin) | Full access, audit log, user management |
| `bod@deliveriq.local` | `Passw0rd!` | BOD | Portfolio KPI dashboard, all orders (read) |
| `dh.ent@deliveriq.local` | `Passw0rd!` | DH | Enterprise dept orders |
| `dh.pres@deliveriq.local` | `Passw0rd!` | DH | PreSales dept orders |
| `pm1@deliveriq.local` | `Passw0rd!` | PM | Owns PPO15-127, PPO15-128, PPO15-131 |
| `pm2@deliveriq.local` | `Passw0rd!` | PM | Owns PPO15-129, PPO15-130 |
| `field1@deliveriq.local` | `Passw0rd!` | FE | Assigned sites: JKT / SBY / MDN / MKS-FE |
| `field2@deliveriq.local` | `Passw0rd!` | FE | Assigned sites: BDG / MKS-NE |
| `finance@deliveriq.local` | `Passw0rd!` | FN | Revenue claims, read-only orders |

> Account lockout: 5 failed attempts triggers a 15-minute lockout per email.

---

## Testing

### Unit + Integration (no infra needed)

```bash
cd tests
npm test                   # vitest — all unit + integration
npm run test:unit          # unit only (src/engine, helpers)
npm run test:integration   # Fastify integration via Supertest (mocks Prisma/Redis)
```

### End-to-end (Playwright — requires running web on :3601)

```bash
cd tests
npx playwright install chromium    # first time only
npm run test:e2e
```

E2e specs cover: login flow, order list, site milestone stepper, Excel import wizard.

### Type checking (all workspaces)

```bash
npm run typecheck
```

---

## Production Docker Build

Build and run using the compose overlay:

```bash
# Build images locally
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Run (requires BACKEND_IMAGE and FRONTEND_IMAGE env vars pointing to built/pushed images)
export BACKEND_IMAGE=ghcr.io/<org>/backend:sha-<short>
export FRONTEND_IMAGE=ghcr.io/<org>/frontend:sha-<short>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Production overlay (`docker-compose.prod.yml`) adds:
- `read_only` filesystem with `/tmp` tmpfs
- `cap_drop: ALL`, `no-new-privileges`
- Resource limits (backend: 1.5 CPU / 1 GB RAM × 2 replicas; web: 1 CPU / 768 MB × 2 replicas)
- nginx reverse proxy on port 80/443 with TLS and per-IP rate limiting
- Adminer disabled
- Backend and web ports unexposed — nginx is the only ingress

Apply database migrations before image flip:
```bash
npx prisma migrate deploy --schema=src/database/prisma/schema.prisma
```

See [docs/deployment.md](docs/deployment.md) and [infra/RUNBOOK.md](infra/RUNBOOK.md) for full CI/CD pipeline, rollback, and backup procedures.

---

## Scripts Reference

All scripts run from the **repo root** unless noted.

| Script | Command | Description |
|---|---|---|
| Install all | `npm install` | Install all workspace dependencies |
| Type check | `npm run typecheck` | `tsc --noEmit` across all 5 workspaces |
| Prisma generate | `npm run prisma:generate` | Regenerate `@prisma/client` after schema changes |
| Prisma migrate | `npm run prisma:migrate` | Apply schema migrations (dev, creates shadow DB) |
| Prisma seed | `npm run prisma:seed` | Seed admin + demo portfolio (idempotent) |
| Dev backend | `npm run dev:backend` | Fastify + workers in watch mode (port 3600) |
| Dev frontend | `npm run dev:frontend` | Next.js dev server (port 3601) |
| Dev mobile | `npm run dev:mobile` | Expo Metro bundler (port 3610) |
| Build backend | `npm run build:backend` | TypeScript compile to `src/backend/dist/` |
| Build frontend | `npm run build:frontend` | Next.js production build |
| Unit tests | `cd tests && npm test` | Vitest (no infra required) |
| Integration tests | `cd tests && npm run test:integration` | Supertest against mock Fastify |
| E2e tests | `cd tests && npm run test:e2e` | Playwright (requires `:3601` running) |
| Prisma Studio | `cd src/database && npx prisma studio` | Visual DB browser |

---

## Repository Layout

```
.
├── .env.example              Environment template — copy to .env
├── docker-compose.yml        Dev compose (postgres, redis, minio, adminer, backend, web)
├── docker-compose.prod.yml   Production overlay (read-only, resource limits, nginx)
├── package.json              Root workspace + shared npm scripts
├── tsconfig.base.json        Shared TypeScript base config
├── scripts/
│   ├── bootstrap-demo.ps1    Windows one-shot startup
│   └── bootstrap-demo.sh     Unix one-shot startup
├── docs/                     All documentation (see Documentation section below)
├── infra/
│   ├── RUNBOOK.md            Ops runbook (deploy, rollback, restore, rotate secrets)
│   ├── SECRETS.md            Secrets management guide (SSM / Vault / local .env)
│   ├── ci/
│   │   ├── gitleaks.toml     Secret scan rules
│   │   └── trivy.yaml        CVE scan config
│   ├── docker/
│   │   ├── nginx.conf        nginx TLS + rate-limit config (prod)
│   │   ├── postgres-init.sql DB role setup run on first container start
│   │   ├── postgres-backup.sh Daily pg_dump → S3/MinIO cron script
│   │   └── minio-init.sh     Create default bucket on first MinIO start
│   └── monitoring/
│       ├── prometheus.yml    Prometheus scrape config
│       ├── alerts.yml        Alerting rules
│       ├── loki-config.yml   Loki log aggregation config
│       ├── promtail-config.yml Log shipper
│       ├── health-check.sh   Post-deploy smoke script
│       └── grafana-provisioning/ Datasources + dashboard JSON
├── public/                   Static frontend assets
└── src/
    ├── shared/               TypeScript types, enums, constants (zero runtime deps)
    ├── database/
    │   ├── prisma/
    │   │   ├── schema.prisma Full Prisma schema (Order→SO→SOW→Site→Milestone chain)
    │   │   └── migrations/   Applied migration files
    │   ├── seeds/seed.ts     Demo data seeder
    │   └── import/excel-mapping.ts  Excel column-to-model mapping
    ├── backend/
    │   ├── Dockerfile        Multi-stage production image (non-root, healthchecked)
    │   └── src/
    │       ├── server.ts     Fastify bootstrap
    │       ├── config/env.ts Zod-validated env
    │       ├── auth/         JWT verify/sign, bcrypt, requireAuth/Role
    │       ├── middleware/   In-process token-bucket rate limiter
    │       ├── db/           Prisma + Redis singletons
    │       ├── engine/       Pure milestone compute (Progress %, GAP, status)
    │       ├── services/     Redis cache service
    │       ├── audit/        Append-only audit writer
    │       ├── queues/       BullMQ producers
    │       ├── workers/      milestone + import in-process consumers
    │       └── modules/      Route handlers: auth, users, orders, sites,
    │                         milestones, imports, reports, sync, notifications
    ├── frontend/
    │   ├── Dockerfile        Multi-stage Next.js production image
    │   ├── app/              Next.js 14 App Router pages
    │   │   ├── (auth)/login  Login page
    │   │   └── (app)/        Protected: dashboard, orders, sites, reports,
    │   │                     project-management, notifications, imports, audit
    │   └── components/       Shared UI: DataTable, KpiTile, MilestoneStepper,
    │                         StatusPill, Sidebar, Topbar, IndonesiaDistributionMap
    ├── mobile/               Expo (React Native) offline field app
    └── tests/
        ├── unit/             Vitest unit tests (engine, helpers)
        ├── integration/      Supertest integration tests (auth, orders, milestones, …)
        └── e2e/              Playwright e2e (login, orders, site milestones, import)
```

---

## RBAC Roles

| Code | Persona | Default landing | Key access |
|---|---|---|---|
| `AD` | System Admin | User management | Full access, audit log, Excel import |
| `BOD` | Board / Executives | Portfolio KPI | All orders (read), BOD/exec reports |
| `DH` | Department Head | Dept dashboard | Own-department orders and reports |
| `PM` | Project Manager | Project list | Own orders (as owner), site/milestone writes |
| `FE` | Field Engineer | Mobile Today | Assigned sites only, milestone + field updates |
| `FN` | Finance | Claims | All orders (read), revenue claims |

Full endpoint matrix: [docs/rbac.md](docs/rbac.md).

---

## Documentation

| Topic | File |
|---|---|
| Architecture (C4, modules, request lifecycle) | [docs/architecture.md](docs/architecture.md) |
| API reference (with curl examples) | [docs/api.md](docs/api.md) |
| Data model + Prisma schema highlights | [docs/data-model.md](docs/data-model.md) |
| Milestone engine (Progress %, GAP, status) | [docs/milestone-engine.md](docs/milestone-engine.md) |
| Excel import (sheet + column mapping) | [docs/excel-import.md](docs/excel-import.md) |
| Mobile app (offline + sync) | [docs/mobile.md](docs/mobile.md) |
| RBAC matrix | [docs/rbac.md](docs/rbac.md) |
| Developer setup (extended) | [docs/setup-dev.md](docs/setup-dev.md) |
| Deployment & CI/CD | [docs/deployment.md](docs/deployment.md) |
| Observability (Prometheus, Grafana, Loki) | [docs/observability.md](docs/observability.md) |
| Security (OWASP, headers, audit) | [docs/security.md](docs/security.md) |
| User guide — BOD | [docs/user-guide-bod.md](docs/user-guide-bod.md) |
| User guide — PM | [docs/user-guide-pm.md](docs/user-guide-pm.md) |
| User guide — Field / Mitra | [docs/user-guide-field.md](docs/user-guide-field.md) |
| Changelog | [docs/changelog.md](docs/changelog.md) |
| Contributing | [docs/contributing.md](docs/contributing.md) |
| Operational runbook | [infra/RUNBOOK.md](infra/RUNBOOK.md) |
| Secrets handling | [infra/SECRETS.md](infra/SECRETS.md) |

---

## Status & Known Limitations

**v0.1.0 MVP** — all critical-path flows run end-to-end.

- Some endpoints return `501 Not Implemented` and are marked **(Phase 2)** in [docs/api.md](docs/api.md): `sos`, `sows`, `vendors`, `field-updates`, `claims`.
- Workers run **in-process** with the API (not a separate container); scale by running multiple API replicas.
- In-process rate limiter is **not multi-replica safe** — Redis-backed limiter is a pre-prod blocker.
- CSP currently allows `'unsafe-inline'` for scripts — nonce hardening is on the roadmap.
- Tokens are stored in `localStorage` — httpOnly cookie BFF migration is a pre-prod blocker.
- **RPO 24h / RTO 4h** (daily pg_dump). PITR via `wal-g` is planned.

Full pre-prod checklist: [docs/security.md#8-pre-prod-checklist](docs/security.md#8-pre-prod-checklist).
Known follow-ups: [docs/deployment.md#11-known-follow-ups](docs/deployment.md#11-known-follow-ups).

---

## License

Proprietary. All rights reserved.
#   E n t e r p r i s e 
 
 