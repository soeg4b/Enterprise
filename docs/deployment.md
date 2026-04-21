# Deployment

Detailed pipeline and infra: [.artifacts/10-devops-pipeline.md](../.artifacts/10-devops-pipeline.md). Operational runbook: [infra/RUNBOOK.md](../infra/RUNBOOK.md). Secrets: [infra/SECRETS.md](../infra/SECRETS.md).

## 1. Environments

| Env | Topology | Notes |
|---|---|---|
| Dev | `docker compose up` | Single host. Adminer + MinIO included via `dev` profile. |
| Staging | Single VM, `docker-compose.yml + docker-compose.prod.yml` | 2x backend, 2x web, 1x nginx. Managed Postgres + Redis. Loki + Prometheus + Grafana co-located. TLS via Let's Encrypt. |
| Production | ALB / CloudFront -> WAF -> nginx -> backend (N) + web (N) | RDS Postgres Multi-AZ, ElastiCache Redis TLS, S3 SSE-KMS, AWS SSM for secrets, OIDC for GHCR push. |

## 2. CI/CD

Workflows in [.github/workflows/](../.github/workflows):

- `ci.yml`: install -> lint -> typecheck -> prisma format/validate -> unit -> integration (ephemeral PG + Redis) -> build (backend, web, mobile prebuild) -> npm-audit -> gitleaks -> trivy -> SBOM (CycloneDX). `ci-success` is the required status check on `main`.
- `deploy-staging.yml`: triggered on CI success on `main` (or `workflow_dispatch`). Build + push to GHCR (`sha-<short>` + `staging` tags), `prisma migrate deploy`, SSH `docker compose pull && up -d`, smoke test against `STAGING_HEALTH_URL`.

Production deploy promotes the **same digest** that passed staging (no rebuild). GitHub `production` environment requires manual reviewer approval.

## 3. Build artifacts

- Images tagged `sha-<7>` (immutable) + moving tag (`staging` / `prod`).
- SBOM (CycloneDX JSON) attached, retention 30 days.
- Git tag `release/<YYYYMMDD>-<n>` cut after a successful prod deploy.

## 4. Migration & rollback

- Run `prisma migrate deploy` **before** image flip.
- All migrations must be additive-then-cleanup (expand-contract) to allow image rollback to N-1 without DB downgrade.
- Image rollback: re-deploy previous `sha-<short>` (see Runbook §2).
- DB downgrade: never. Emit a corrective forward migration.

## 5. Configuration & secrets

- Local: `.env` from `.env.example`.
- Staging / prod: `.env.runtime` rendered at boot from AWS SSM (or Vault). Template: [.env.production.example](../.env.production.example).
- gitleaks gates the repo; nothing sensitive should ever be committed.

| Required prod secret | Source |
|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | SSM SecureString, 32-byte random |
| `DATABASE_URL` | RDS connection string from SSM |
| `REDIS_URL` | ElastiCache TLS endpoint |
| `S3_*` | IAM role preferred; secret keys via SSM |
| `SEED_ADMIN_PASSWORD` | One-time, rotate immediately on first deploy |

## 6. Hardening (prod overlay)

[`docker-compose.prod.yml`](../docker-compose.prod.yml):

- `read_only: true` + tmpfs scratch (`/tmp`, `.next/cache`).
- `cap_drop: ALL`, `no-new-privileges`.
- Resource limits and replicas.
- `adminer` removed.
- nginx-only ingress; backend/web ports unpublished.
- nginx provides TLS 1.2/1.3, HSTS, gzip, per-IP rate limits (`api_general` 30 r/s, `api_login` 5 r/min) on top of app limiter.
- Postgres app role `deliveriq_app` is non-superuser; audit-log table has trigger denying UPDATE/DELETE.

## 7. Release sequence

1. Merge to `main` -> CI green.
2. Auto-deploy to staging -> smoke -> 24 h soak.
3. Manual approval -> production deploy: `prisma migrate deploy` -> backend rolling restart -> web rolling restart -> nginx config (only if changed).
4. Post-deploy: tag release, monitor Grafana for 30 min.

## 8. Rollback

- Image: redeploy previous `sha-<short>` tag. nginx fail-over removes draining instance.
- Config-only: revert `.env.runtime` from SSM history, `docker compose up -d`.
- Database: forward-only. Use a corrective migration if the new schema is incompatible.

## 9. Backups & DR

- Daily `pg_dump` to S3/MinIO via [infra/docker/postgres-backup.sh](../infra/docker/postgres-backup.sh), 30-day retention.
- Monthly restore drill (Runbook §7).
- RPO 24 h, RTO 4 h (MVP targets).

## 10. SLOs

| Metric | Target |
|---|---|
| Availability (API) | 99.0 % monthly |
| P95 `/v1/*` | < 800 ms |
| P95 `/v1/reports/bod` (cached) | < 300 ms |
| 5xx error rate | < 1 % |

## 11. Known follow-ups

- Backend `/metrics` (prom-client) — required to activate the alert rules in [infra/monitoring/alerts.yml](../infra/monitoring/alerts.yml).
- Redis-backed rate limiter (currently in-process; not multi-replica safe).
- Worker process split (currently in-process with API).
- See [.artifacts/10-devops-pipeline.md](../.artifacts/10-devops-pipeline.md) §7 for the full open list.
