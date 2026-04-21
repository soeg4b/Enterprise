# PDC Enterprise

> Replace the multi-team Excel tracker with a role-shaped, offline-capable control tower for enterprise telecom delivery — from PO to RFS to revenue claim.

<!-- Badges (placeholders — wire to your CI/registry):
[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](.github/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-pending-lightgrey)](#)
[![License](https://img.shields.io/badge/license-Proprietary-blue)](#)
[![Version](https://img.shields.io/badge/version-0.1.0-blue)](docs/changelog.md)
-->

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

## Architecture

```
+-------------+       +-------------+       +-------------+
| Web Next.js |       | Mobile Expo |       | Adminer dev |
+------+------+       +------+------+       +------+------+
       \                    /                       |
        \  HTTPS (Bearer)  /                        |
         v                v                         v
       +--------------------------------------------------+
       |   Backend API (Fastify, Node 20, TypeScript)     |
       |   /v1/**  +  /healthz  /readyz                   |
       |   Auth/RBAC -> Modules -> Prisma -> Postgres 16  |
       |                       \-> BullMQ -> Workers      |
       |                       \-> Cache  -> Redis 7      |
       +--------------------------------------------------+
                |              |               |
                v              v               v
           Postgres 16     Redis 7        MinIO / S3
```

Full diagram: [docs/architecture.md](docs/architecture.md).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend Web | Next.js 14 (App Router, RSC), Tailwind CSS, TypeScript |
| Frontend Mobile | Expo SDK 50, React Native 0.73, expo-sqlite, expo-secure-store |
| Backend | Fastify 4, TypeScript, Zod, Pino |
| ORM / DB | Prisma 5, PostgreSQL 16 |
| Cache + Queue | Redis 7, BullMQ 5 |
| Storage | S3 / MinIO |
| Auth | JWT (access + refresh, dual namespaces) + bcrypt |
| Tests | Vitest, Supertest, Playwright |
| Infra | Docker, docker-compose, nginx, GitHub Actions, Trivy, gitleaks |

## Quick start

Prereqs: Node.js >= 20.10, npm >= 10, Docker Desktop.

**One-shot bring-up (recommended):**

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap-demo.ps1
```

```bash
# macOS / Linux / WSL
bash scripts/bootstrap-demo.sh
```

The script copies `.env.example` → `.env`, starts infra containers, generates the
Prisma client, runs migrations, seeds the demo dataset (5 customers, 5 orders,
8 SOWs / sites with mixed ON_TRACK / AT_RISK / DELAY statuses, claims, CAPEX,
notifications), and on Windows also launches the backend + web dev servers.

**Manual steps (if you prefer):**

```bash
cp .env.example .env                       # rotate JWT_SECRET, JWT_REFRESH_SECRET, SEED_ADMIN_PASSWORD
docker compose up -d postgres redis minio adminer
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed                        # admin + sample portfolio
npm run dev:backend                        # http://localhost:3600   (health: /healthz)
npm run dev:frontend                       # http://localhost:3601
# optional: npm run dev:mobile             # Expo (Metro on 3610)
```

Or full stack via Docker:

```bash
docker compose up --build
```

### First login

- Web URL: `http://localhost:3601/login`
- API:     `http://localhost:3600`  (health: `/healthz`)
- Adminer: `http://localhost:3606`  (System: PostgreSQL, Server: postgres, User/Pwd/DB: `deliveriq`)
- MinIO:   `http://localhost:3605`  (User/Pwd: `deliveriq` / `deliveriqsecret`)
- Email:   `admin@deliveriq.local`
- Password: `ChangeMe!2026` (from `SEED_ADMIN_PASSWORD` — rotate immediately)

Demo seeded users (password `Passw0rd!`): `bod@`, `dh.ent@`, `dh.pres@`, `pm1@`, `pm2@`, `field1@`, `field2@`, `finance@deliveriq.local`.

Detailed setup, troubleshooting, and Expo notes: [docs/setup-dev.md](docs/setup-dev.md).

## Repository layout

```
.
├── .artifacts/         Multi-agent handoff documents (01..11)
├── .github/workflows/  CI + staging deploy pipelines
├── docs/               Documentation (this index)
├── infra/              docker, monitoring, CI configs, RUNBOOK, SECRETS
├── public/             Static assets
├── src/
│   ├── shared/         TS types, enums, constants, pure compute
│   ├── database/       Prisma schema + seed + Excel import mapping
│   ├── backend/        Fastify API + BullMQ workers
│   ├── frontend/       Next.js 14 web app
│   └── mobile/         Expo (React Native) field app
├── tests/              Unit (Vitest), integration (Supertest), e2e (Playwright)
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Apply migrations to dev DB |
| `npm run prisma:seed` | Seed admin + sample portfolio |
| `npm run dev:backend` | Start API + in-process workers (watch) |
| `npm run dev:frontend` | Start Next.js dev server |
| `npm run dev:mobile` | Start Expo dev server |
| `npm run build:backend` | Production build (backend) |
| `npm run build:frontend` | Production build (Next.js) |
| `cd tests && npm test` | Vitest (unit + integration, no infra needed) |
| `cd tests && npm run test:e2e` | Playwright (requires web on :3601) |

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
| Developer setup | [docs/setup-dev.md](docs/setup-dev.md) |
| Deployment & CI/CD | [docs/deployment.md](docs/deployment.md) |
| Observability | [docs/observability.md](docs/observability.md) |
| Security | [docs/security.md](docs/security.md) |
| User guide — BOD | [docs/user-guide-bod.md](docs/user-guide-bod.md) |
| User guide — PM | [docs/user-guide-pm.md](docs/user-guide-pm.md) |
| User guide — Field / Mitra | [docs/user-guide-field.md](docs/user-guide-field.md) |
| Changelog | [docs/changelog.md](docs/changelog.md) |
| Contributing | [docs/contributing.md](docs/contributing.md) |
| Operational runbook | [infra/RUNBOOK.md](infra/RUNBOOK.md) |
| Secrets handling | [infra/SECRETS.md](infra/SECRETS.md) |

## Status

v0.1.0 MVP — critical-path flows runnable end-to-end. Some endpoints intentionally return 501 and are marked **(Phase 2)** in [docs/api.md](docs/api.md). Pre-prod blockers are tracked in [docs/security.md](docs/security.md#8-pre-prod-checklist) and [docs/deployment.md](docs/deployment.md#11-known-follow-ups).

## License

Proprietary. All rights reserved.
