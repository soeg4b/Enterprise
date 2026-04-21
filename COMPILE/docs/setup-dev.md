# Developer Setup

Get PDC Enterprise running locally on Windows / macOS / Linux.

## 1. Prerequisites

- Node.js >= 20.10
- npm >= 10
- Docker Desktop (for Postgres, Redis, MinIO)
- (Optional) Expo Go on a device for the mobile app

## 2. Clone and configure

```bash
git clone <repo-url>
cd 20260420_Enterprise_Project_Delivery_Dashboard

cp .env.example .env
# Edit .env: change JWT_SECRET, JWT_REFRESH_SECRET, SEED_ADMIN_PASSWORD.
```

Required env (full list in [.env.example](../.env.example)):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis (BullMQ + cache) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | >= 32 bytes, distinct |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | `15m`, `7d` defaults |
| `BCRYPT_COST` | 12 default |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_FULLNAME` | Bootstrap admin (rotate per env) |
| `CORS_ORIGINS` | comma-separated allowlist |
| `S3_*` | MinIO / S3 (compose ships MinIO) |
| `NEXT_PUBLIC_API_URL`, `EXPO_PUBLIC_API_URL` | Frontend / mobile API base |
| `MRC_HORIZON_MONTHS` | BOD revenue-at-risk MRC horizon (default 12) |

## 3. Bring up infra

```bash
docker compose up -d postgres redis minio adminer
```

Adminer is available at `http://localhost:3606` (dev profile).

## 4. Install workspaces

```bash
npm install
```

This installs all workspaces (`shared`, `database`, `backend`, `frontend`, `mobile`, `tests`).

## 5. Database

```bash
npm run prisma:generate
npm run prisma:migrate     # creates schema in dev
npm run prisma:seed        # idempotent: admin + sample portfolio
```

Default seeded users (password `Passw0rd!`):
- `bod@deliveriq.local`
- `dh.ent@deliveriq.local`
- `pm1@deliveriq.local`, `pm2@deliveriq.local`
- `field1@deliveriq.local`, `field2@deliveriq.local`
- `finance@deliveriq.local`

Bootstrap admin (from `.env`):
- email `admin@deliveriq.local`
- password `ChangeMe!2026` (rotate immediately).

## 6. Run dev (3 terminals)

```bash
npm run dev:backend     # http://localhost:3600   (health: /healthz)
npm run dev:frontend    # http://localhost:3601
npm run dev:mobile      # Expo dev tools (Metro on 3610)
```

Or full stack via Docker:

```bash
docker compose up --build
```

## 7. Verify

```bash
curl http://localhost:3600/healthz
curl http://localhost:3600/readyz

# Login
curl -sX POST http://localhost:3600/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@deliveriq.local","password":"ChangeMe!2026"}'
```

Open the web app at `http://localhost:3601` and log in.

### Port map (3600+ range)

| Service        | Host port | Container port |
|----------------|-----------|----------------|
| Backend API    | 3600      | 3600           |
| Frontend Web   | 3601      | 3601           |
| Postgres       | 3602      | 5432           |
| Redis          | 3603      | 6379           |
| MinIO API      | 3604      | 9000           |
| MinIO Console  | 3605      | 9001           |
| Adminer        | 3606      | 8080           |
| Loki           | 3607      | 3100           |
| Prometheus     | 3608      | 9090           |
| Grafana        | 3609      | 3000           |
| Expo (Metro)   | 3610-3612 | n/a            |

## 8. Tests

```bash
cd tests
npm install              # workspace already installed if you ran npm install at root
npm test                 # vitest unit + integration (no infra required, mocks Prisma/Redis/queues)
npm run test:unit
npm run test:integration
npx playwright install chromium
npm run test:e2e         # requires web on :3601
```

## 9. Common scripts

| Command | Description |
|---|---|
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Apply migrations to dev DB |
| `npm run prisma:seed` | Seed admin + sample portfolio |
| `npm run dev:backend` | Start API + workers in watch mode |
| `npm run dev:frontend` | Start Next.js dev server |
| `npm run dev:mobile` | Start Expo dev server |
| `npm run build:backend` / `build:frontend` | Production builds |

## 10. Troubleshooting

- **`prisma generate` fails**: ensure `DATABASE_URL` resolves; rerun `npm run prisma:generate`.
- **Backend can't reach DB**: in Docker, use `postgres` as host; on host, `localhost`.
- **Mobile cannot reach API**: set `EXPO_PUBLIC_API_URL` to your LAN IP, not `localhost`.
- **Port 4000/3000 in use**: change `PORT` in `.env` or stop the conflicting process.
- **Login locked**: 5 failed attempts -> 15 min lockout. Reset via DB or wait.
