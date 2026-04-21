# 10 — DevOps Pipeline & Infrastructure

**Project**: DeliverIQ — Enterprise Project Delivery Dashboard
**Stage**: [10] DevOps
**Inputs consumed**: [`src/**`](../src), [`package.json`](../package.json), [`.artifacts/06-coder-plan.md`](06-coder-plan.md), [`.artifacts/09-security-review.md`](09-security-review.md), existing [`docker-compose.yml`](../docker-compose.yml), [`.env.example`](../.env.example), backend & frontend Dockerfiles.
**Decision**: **CONDITIONAL GO** to Documentation. Pre-prod blockers from Security §9 are tracked in §9 below; none of them block staging deploy or doc work.

---

## 1. Deployment Pipeline Design

### 1.1 CI stages (PR + push to `main`)

`. github/workflows/ci.yml` — concurrency: `ci-${{ github.ref }}`, cancel-in-progress.

| Stage | Job | Fails build on |
|---|---|---|
| Install | `install` | npm cache miss + lockfile drift |
| Static | `lint` | ESLint errors (best-effort if no `lint` script) |
| Static | `typecheck` | `tsc --noEmit` errors across all workspaces |
| Static | `prisma` | `prisma format --check` / `prisma validate` failure |
| Test | `unit-tests` (matrix `[unit]`) | Any unit test failure |
| Test | `integration-tests` | Backend integration tests against ephemeral Postgres + Redis services |
| Build | `build-backend` | Docker build error; image cached as artifact for Trivy |
| Build | `build-frontend` | Next.js build error |
| Build | `build-mobile` | `expo prebuild --no-install` (warning-only by design) |
| Security | `npm-audit` | High/critical advisories on prod deps |
| Security | `gitleaks` | Any secret hit (config: [`infra/ci/gitleaks.toml`](../infra/ci/gitleaks.toml)) |
| Security | `trivy-scan` | High/critical CVEs in backend image (config: [`infra/ci/trivy.yaml`](../infra/ci/trivy.yaml)) |
| SBOM | `sbom` | Never (artifact-only, retained 30d) |
| Gate | `ci-success` | Required status check on `main` |

### 1.2 CD stages (staging)

`. github/workflows/deploy-staging.yml` — triggers on `workflow_run` of CI (success on `main`) or manual `workflow_dispatch`.

| Job | Action |
|---|---|
| `guard` | Verifies CI conclusion = success (or manual dispatch) |
| `build-and-push` | Builds backend + frontend, pushes to GHCR with `sha-<short>` and `staging` tags |
| `migrate` | `prisma migrate deploy` against `STAGING_DATABASE_URL` (GitHub `staging` environment) |
| `deploy` | SSH into staging host, `docker compose pull && up -d` using prod overlay |
| `smoke-test` | 10× retry curl to `STAGING_HEALTH_URL` (`/healthz`) |

Approval gate: GitHub `staging` environment can require reviewer approval; production environment **must**.

### 1.3 Quality & approval gates

| Gate | Where | Owner |
|---|---|---|
| All CI jobs green | Branch protection on `main` | DevOps |
| 1× code review | Branch protection | Engineering |
| `staging` environment review (optional) | GitHub Environments | DevOps |
| `production` environment review (mandatory) | GitHub Environments | Tech lead + Security |
| 24h soak in staging + 0 P1 alerts | Runbook §1b | On-call |

### 1.4 Artifact / versioning strategy

- Images tagged `sha-<7-char>` (immutable) **and** moving tag (`staging` / `prod`).
- Production deploys promote the **same digest** that passed staging — no rebuild.
- SBOM (CycloneDX JSON) attached as workflow artifact, retention 30 days.
- Git tags `release/<YYYYMMDD>-<n>` cut after successful prod deploy.

---

## 2. Infrastructure Configuration

### 2.1 Environment topology

```
┌──────────────────────────────────────── DEV (local) ────────────────────────────────────────┐
│  docker compose up                                                                          │
│   postgres:5432 ─┐                                                                          │
│   redis:6379    ─┤── backend:4000 ── web:3000 ── adminer (profile=dev)                      │
│   minio:9000    ─┘                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────── STAGING ────────────────────────────────────────────┐
│ Single VM, Docker Compose (compose.yml + compose.prod.yml). 2× backend, 2× web, 1× nginx.   │
│ Managed Postgres (single node), managed Redis, MinIO for blob, Loki+Promtail+Prometheus     │
│ co-located. Ingress: nginx → backend / web. TLS via Let's Encrypt.                          │
│ Secrets: AWS SSM /deliveriq/staging/*.                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────── PRODUCTION ─────────────────────────────────────────┐
│ ALB / CloudFront ── WAF ── nginx (TLS) ── backend×2..N ── postgres (RDS, Multi-AZ)          │
│                                          └── web×2 (Next.js)                                │
│                                          └── workers (split, when promoted)                 │
│                                          ── redis (ElastiCache TLS)                         │
│                                          ── S3 (SSE-KMS) for imports/photos/exports/backups │
│ Observability: Prometheus + Grafana + Loki (or AWS-managed equivalents).                    │
│ Secrets: AWS SSM SecureString / Secrets Manager (auto-rotation for DB & S3).                │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Docker service architecture

Base [`docker-compose.yml`](../docker-compose.yml):
- `postgres:16-alpine` (volume `pgdata`, init via [`postgres-init.sql`](../infra/docker/postgres-init.sql))
- `redis:7-alpine` (`appendonly yes`, `allkeys-lru`)
- `minio` + `minio-init` (one-shot bucket creation via [`minio-init.sh`](../infra/docker/minio-init.sh))
- `adminer` (profile `dev` only)
- `backend` (depends on healthy pg/redis/minio)
- `web` (depends on healthy backend)

All services have container-level healthchecks and json-file logging with rotation.

Production overlay [`docker-compose.prod.yml`](../docker-compose.prod.yml):
- Removes `adminer`.
- `backend`, `web`: `read_only: true` + tmpfs for `/tmp` (and `.next/cache`); `cap_drop: ALL`; `no-new-privileges`; resource limits; replicas; ports unpublished (nginx-only ingress).
- Adds `nginx` reverse proxy (TLS, HSTS, gzip, rate limits, security headers passthrough — see [`nginx.conf`](../infra/docker/nginx.conf) + [`proxy_params.conf`](../infra/docker/proxy_params.conf)).
- Images **must** be set via `BACKEND_IMAGE` and `FRONTEND_IMAGE` env (no inline build).

### 2.3 Configuration & secrets

- Local: `.env` (from `.env.example`).
- Staging/prod: `.env.runtime` rendered at boot from AWS SSM (or Vault sidecar). Template: [`.env.production.example`](../.env.production.example). Pattern documented in [`infra/SECRETS.md`](../infra/SECRETS.md).
- No secret material is committed (gitleaks gates this).

### 2.4 Scalability & resilience

- `backend` and `web` are stateless → horizontally scalable (`docker compose up --scale backend=N`).
- BullMQ workers currently in-process with backend (Coder roadmap to split).
- Redis configured with `allkeys-lru` for cache eviction safety (queue keys are namespaced and not LRU-evicted in practice; consider separate Redis DB for cache vs queues in prod).
- nginx upstream: `least_conn`, `max_fails=3 fail_timeout=10s`, keepalive pool.
- Postgres: managed (Multi-AZ in prod recommended).

---

## 3. Files Created / Modified

| Path | Purpose | Customisation |
|---|---|---|
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Full CI pipeline (lint, typecheck, tests, builds, security, SBOM) | Adjust matrix; add deploy-on-tag |
| [`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml) | Build & push GHCR images, migrate, SSH-deploy, smoke | Set staging env secrets; clone for prod |
| [`.github/dependabot.yml`](../.github/dependabot.yml) | Weekly npm + GH-Actions + Docker updates | Tune cadence/groups |
| [`infra/ci/gitleaks.toml`](../infra/ci/gitleaks.toml) | Secret-scan rules + allowlist for placeholders | Add internal patterns |
| [`infra/ci/trivy.yaml`](../infra/ci/trivy.yaml) | Container/IaC scan baseline (HIGH+CRIT) | Tighten/loosen severity |
| [`infra/ci/.trivyignore`](../infra/ci/.trivyignore) | Accepted-CVE register | Add CVE+expiry |
| [`docker-compose.yml`](../docker-compose.yml) | Extended: healthchecks on all, minio-init, log rotation, adminer profile=dev, postgres init script | Edit ports / volumes |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | Prod overlay (read-only fs, cap_drop, replicas, nginx, no adminer) | Set replica counts, resource limits |
| [`src/backend/Dockerfile`](../src/backend/Dockerfile) | Multi-stage; **non-root** `app:1001`; tini init; HEALTHCHECK; `npm prune --omit=dev` | Adjust runtime deps |
| [`src/frontend/Dockerfile`](../src/frontend/Dockerfile) | Multi-stage; **non-root** `app:1001`; tini; HEALTHCHECK | Adjust standalone output if enabled |
| [`src/backend/.dockerignore`](../src/backend/.dockerignore) | Slim build context | Add patterns as needed |
| [`src/frontend/.dockerignore`](../src/frontend/.dockerignore) | Slim build context | Add patterns as needed |
| [`infra/docker/nginx.conf`](../infra/docker/nginx.conf) | Reverse proxy, TLS, HSTS, gzip, rate limits, security headers | Tune zones, add upstreams |
| [`infra/docker/proxy_params.conf`](../infra/docker/proxy_params.conf) | Shared proxy headers | Edit timeouts |
| [`infra/docker/minio-init.sh`](../infra/docker/minio-init.sh) | One-shot bucket + prefix creation | Change `S3_BUCKET` |
| [`infra/docker/postgres-init.sql`](../infra/docker/postgres-init.sql) | Non-superuser app role + audit-log immutability trigger | Rotate `deliveriq_app` password |
| [`infra/docker/postgres-backup.sh`](../infra/docker/postgres-backup.sh) | Daily dump → S3/MinIO, 30-day retention | Cron entry; bucket; retention |
| [`infra/monitoring/prometheus.yml`](../infra/monitoring/prometheus.yml) | Scrape config (backend `/metrics` stubbed pending app endpoint) | Uncomment when metrics ship |
| [`infra/monitoring/alerts.yml`](../infra/monitoring/alerts.yml) | Alert rules (backend down, 5xx, latency, queues, db pool, host) | Tune thresholds |
| [`infra/monitoring/loki-config.yml`](../infra/monitoring/loki-config.yml) | Single-binary Loki for compose | Bump retention for prod |
| [`infra/monitoring/promtail-config.yml`](../infra/monitoring/promtail-config.yml) | Docker log discovery → Loki | Add label rules |
| [`infra/monitoring/grafana-provisioning/datasources/datasources.yml`](../infra/monitoring/grafana-provisioning/datasources/datasources.yml) | Prometheus + Loki | — |
| [`infra/monitoring/grafana-provisioning/dashboards/dashboards.yml`](../infra/monitoring/grafana-provisioning/dashboards/dashboards.yml) | Provider config | — |
| [`infra/monitoring/grafana-provisioning/dashboards/files/backend-overview.json`](../infra/monitoring/grafana-provisioning/dashboards/files/backend-overview.json) | Request rate, P95, 5xx %, queue depth | Add panels per service |
| [`infra/monitoring/health-check.sh`](../infra/monitoring/health-check.sh) | External uptime probe (calls `/healthz` + `/readyz`) | Set `BASE_URL` |
| [`infra/RUNBOOK.md`](../infra/RUNBOOK.md) | Deploy / rollback / restore / scale / rotate / alert response | Fill on-call rotation |
| [`infra/SECRETS.md`](../infra/SECRETS.md) | `.env` → SSM/Vault migration | Choose backend; document rotation policy |
| [`.env.production.example`](../.env.production.example) | Prod env template (all secrets `__FROM_VAULT__`) | Copy to SSM, never commit populated copy |
| [`.gitignore`](../.gitignore) | Added prod env, TLS material, scan artifacts | — |

---

## 4. Release & Deployment Plan

### 4.1 Strategy
- **Staging**: rolling restart (`docker compose up -d` re-creates updated services in place). Acceptable for 2-replica deploy because nginx fail-over removes draining instance.
- **Production**: blue/green at the compose level once we move off single-host (deploy a `green` stack, flip nginx upstream, retire `blue`). For single-host MVP, rolling restart with `--no-deps` per service is acceptable.
- **Canary**: out of MVP scope; placeholder weighted nginx upstream documented in runbook for when needed.

### 4.2 Migration & rollback
- `prisma migrate deploy` runs **before** image flip in staging deploy job.
- All migrations must be additive-then-cleanup (expand-contract) to allow rollback to N-1 without DB downgrade.
- Image rollback: re-deploy previous `sha-<short>` (runbook §2). DB downgrade: never; emit corrective forward migration.

### 4.3 Change window & sequencing
- Staging: any time, automated.
- Prod: business-hours unless emergency; freeze 2h before / after major business cutover (BOD board demos, end-of-month close).
- Sequence: DB migration → backend → web → nginx config (only if changed).

### 4.4 Operational runbook
[`infra/RUNBOOK.md`](../infra/RUNBOOK.md) covers: deploy, rollback, restore from backup, scale workers, rotate JWT secrets, alert response, common ops commands, on-call contacts (TBD).

---

## 5. Monitoring & Reliability

### 5.1 Service health indicators
- Liveness: `/healthz` (200 = process up).
- Readiness: `/readyz` (DB + Redis ping).
- Image healthchecks built into all containers.
- nginx exposes `/healthz` for LB.

### 5.2 SLO/SLA targets (MVP)

| Metric | Target |
|---|---|
| Availability (API) | 99.0 % monthly (≈7h downtime budget) |
| P95 latency `/v1/*` | < 800 ms |
| P95 latency `/v1/reports/bod` (cached) | < 300 ms |
| 5xx error rate | < 1 % |
| RPO | 24 h (daily backup) |
| RTO | 4 h |

### 5.3 Alerting & escalation
Alert rules in [`alerts.yml`](../infra/monitoring/alerts.yml). Severity → on-call channel:
- `critical` → PagerDuty page (BackendDown, PostgresDown, MilestoneWorkerStalled).
- `high` → Slack `#deliveriq-oncall` (5xx spike, latency, queue backlog, DB pool, login flood).
- `warning` → Slack `#deliveriq-ops`.

### 5.4 Logging & observability
- Backend: pino JSON to stdout, redacted (per Security F3), `X-Request-Id` correlated.
- Promtail tails docker logs → Loki. Label per service.
- Grafana dashboard provisioned: request rate, P95, 5xx %, queue depth.
- **Gap**: backend `/metrics` endpoint not yet implemented (prom-client). Prometheus job is stubbed (commented). Filed as DevOps→Coder follow-up; alert rules are pre-written and will activate once endpoint ships.

### 5.5 Incident readiness
- Runbook §6 maps each alert → first 3 actions.
- Postmortem template TBD (to be added by Documentation).
- Backup restore drill: monthly (runbook §7).

---

## 6. Security & Compliance Alignment

### 6.1 Pipeline security checks
| Check | Tool | Gate |
|---|---|---|
| Dependency CVE | `npm audit --omit=dev --audit-level=high` | CI fail |
| Secret scan | Gitleaks | CI fail |
| Container CVE | Trivy (HIGH+CRITICAL, ignore-unfixed) | CI fail |
| SBOM | CycloneDX | Artifact only |
| IaC misconfig | Trivy `misconfig` scanner | CI fail |
| Dep updates | Dependabot weekly | PRs |
| Lockfile committed | `npm ci --ignore-scripts` requires it | CI fail |

### 6.2 Infrastructure hardening
- Containers run as **non-root** (`app:1001`); `tini` as PID 1; `HEALTHCHECK` baked in.
- Prod overlay: `read_only: true`, `cap_drop: ALL`, `no-new-privileges`, tmpfs scratch.
- Postgres app uses non-superuser `deliveriq_app` role (least privilege).
- nginx terminates TLS 1.2/1.3 only; HSTS; per-IP rate limits (`api_general` 30 r/s, `api_login` 5 r/min) on top of app limiter.
- Audit-log table has Postgres trigger denying UPDATE/DELETE (closes Security SEC-NEW-14).
- Backend port unpublished in prod (nginx-only).

### 6.3 Access & permissions
- GHCR push: GitHub Actions OIDC + repo `packages: write`.
- Staging deploy SSH key stored in GitHub Environment `staging` (review-protected).
- AWS SSM access: IAM role attached to deploy host; per-env path scoping `/deliveriq/<env>/*`.

### 6.4 Compliance / audit evidence
- CI run logs retained 90 days (default).
- SBOM artifacts retained 30 days; promote chosen ones to long-term S3 on release.
- Audit log table append-only (DB trigger + AD-only read endpoint).
- Secret rotation history → `docs/SECURITY_LOG.md` (Operations).

---

## 7. Collaboration Handoff

### 7.1 Inputs needed from Coder (open)
1. **Backend `/metrics` endpoint** with `prom-client` exposing `http_requests_total`, `http_request_duration_seconds_bucket`, `bullmq_queue_*`, `auth_login_failures_total`. Until then, Prometheus job is commented and the DevOps alert rules cannot fire.
2. **Redis-backed rate limiter** (Security BUG-RL-01) — pre-prod blocker for multi-replica deploy.
3. **Excel parser caps** (`IMPORT_MAX_ROWS`, `IMPORT_MAX_CELL_BYTES`) — env vars now in `.env.production.example`.
4. **Worker split** (separate process / container) so we can scale workers independently.

### 7.2 Security validation checkpoints
- After Coder lands `/metrics`: re-enable Prometheus scrape + run alert rule unit tests (`promtool test rules`).
- After Coder lands Redis rate-limiter: validate from two backend replicas behind nginx (Security §7.3 retest item).
- After secrets migrated to SSM: re-run gitleaks against the deploy host's `/opt/deliveriq` to ensure no `.env` leaked.

### 7.3 Risks, blockers, dependencies
| Risk | Impact | Mitigation |
|---|---|---|
| Lockfile not committed | `npm ci` fails in CI | DevOps to verify `package-lock.json` present (Security flagged); if absent, run once locally and commit |
| `expo prebuild` fails on CI runner | mobile build job warns, not fails | Acceptable for MVP; gate becomes hard once mobile release pipeline exists |
| Backend `/metrics` missing | Alert rules dormant | Coder to implement; rules already shipped |
| TLS material absent on staging host | nginx fails to start | Use Let's Encrypt + certbot; place in `infra/docker/tls/` (mounted ro) |
| BUG-INFRA-01 (`prisma generate` block) | CI `typecheck`, `prisma`, image build all fail | Data + Coder must resolve before merging this branch to `main` |

### 7.4 Follow-up operational actions
- [ ] Provision SSM parameter tree `/deliveriq/{staging,prod}/*` and IAM role.
- [ ] Issue staging TLS cert; mount in nginx.
- [ ] Configure GitHub Environments `staging` (auto) and `production` (manual approval) with secrets per RUNBOOK §1.
- [ ] Enable branch protection on `main` requiring `ci-success` and 1 review.
- [ ] Enable Dependabot security updates in repo settings.
- [ ] Schedule monthly backup-restore drill.
- [ ] Add `prom-client` + `/metrics` endpoint (Coder ticket).

---

## 8. Cost notes (rough, ap-southeast-1, USD/month)

| Component | Staging | Production (initial) |
|---|---|---|
| Compute (1× t3.medium → 2× t3.large) | ~30 | ~120 |
| RDS Postgres (db.t3.small Multi-AZ for prod) | ~30 | ~110 |
| ElastiCache Redis (cache.t3.micro) | ~15 | ~30 |
| S3 (200 GB + req) | ~10 | ~30 |
| ALB / data transfer | ~25 | ~60 |
| CloudWatch / observability | ~10 | ~40 |
| GHCR / GH Actions (private) | included | included |
| Backups (S3 + transfer) | ~5 | ~15 |
| **Subtotal** | **~125** | **~405** |

Excludes WAF (~$25 + $1/M req) and any third-party SaaS (PagerDuty, Sentry).

---

## 9. Open items closing security findings

| Security ID | Title | Owner | DevOps action this stage | Status |
|---|---|---|---|---|
| BUG-RL-01 | Redis-backed rate limiter | Coder + DevOps | Compose ships Redis with `appendonly yes`; nginx adds defense-in-depth `api_login` 5r/m + `api_general` 30r/s | 🟡 awaits Coder app-side fix |
| SEC-NEW-10 | npm audit / Dependabot / SBOM | DevOps | ✅ All three live in CI ([`ci.yml`](../.github/workflows/ci.yml), [`.github/dependabot.yml`](../.github/dependabot.yml)) | ✅ |
| SEC-NEW-11 | `.env.example` weak default | DevOps | ✅ [`.env.production.example`](../.env.production.example) ships `__FROM_VAULT__`; SSM/Vault path documented in [`SECRETS.md`](../infra/SECRETS.md) | ✅ |
| SEC-NEW-13 | `trustProxy` allowlist | DevOps | ✅ `TRUST_PROXY=10.0.0.0/8` in `.env.production.example`; nginx sets `set_real_ip_from 10.0.0.0/8` | ✅ (config-side; Coder must consume env) |
| SEC-NEW-14 | Audit-log immutability | DevOps + Data | ✅ Postgres trigger in [`postgres-init.sql`](../infra/docker/postgres-init.sql); CI grep gate is QA's | ✅ |
| BUG-INFRA-01 | Prisma generate fails | DevOps + Data | CI `prisma` job will surface immediately; cannot fully fix without schema patch | 🟡 waiting Data |
| Container scan | Trivy | DevOps | ✅ [`ci.yml`](../.github/workflows/ci.yml) `trivy-scan` on backend image | ✅ |
| Secret scan | Gitleaks | DevOps | ✅ [`gitleaks.toml`](../infra/ci/gitleaks.toml) + CI job | ✅ |
| TLS termination | DevOps | ✅ nginx `ssl_protocols TLSv1.2 TLSv1.3` + HSTS | ✅ (cert provisioning is operator task) |
| WAF | DevOps | Documented dependency in §7.4; not implemented in compose-only stack | 🟡 prod-only |
| Image signing (cosign) | DevOps | Roadmap item (Security §7.2 short-term) | 🟡 short-term |

---

## 10. Handoff

### Inputs consumed
- [`src/**`](../src), [`package.json`](../package.json)
- [`.artifacts/06-coder-plan.md`](06-coder-plan.md)
- [`.artifacts/09-security-review.md`](09-security-review.md)
- Existing [`docker-compose.yml`](../docker-compose.yml), [`.env.example`](../.env.example), backend & frontend Dockerfiles

### Outputs produced
- This document: [`.artifacts/10-devops-pipeline.md`](10-devops-pipeline.md)
- CI/CD: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml), [`.github/dependabot.yml`](../.github/dependabot.yml)
- CI configs: [`infra/ci/gitleaks.toml`](../infra/ci/gitleaks.toml), [`infra/ci/trivy.yaml`](../infra/ci/trivy.yaml), [`infra/ci/.trivyignore`](../infra/ci/.trivyignore)
- Containers: rewritten [`src/backend/Dockerfile`](../src/backend/Dockerfile) and [`src/frontend/Dockerfile`](../src/frontend/Dockerfile) (non-root, healthchecked); new [`src/backend/.dockerignore`](../src/backend/.dockerignore) and [`src/frontend/.dockerignore`](../src/frontend/.dockerignore); extended [`docker-compose.yml`](../docker-compose.yml) and new [`docker-compose.prod.yml`](../docker-compose.prod.yml)
- Infra: [`infra/docker/nginx.conf`](../infra/docker/nginx.conf), [`infra/docker/proxy_params.conf`](../infra/docker/proxy_params.conf), [`infra/docker/minio-init.sh`](../infra/docker/minio-init.sh), [`infra/docker/postgres-init.sql`](../infra/docker/postgres-init.sql), [`infra/docker/postgres-backup.sh`](../infra/docker/postgres-backup.sh)
- Monitoring: [`infra/monitoring/prometheus.yml`](../infra/monitoring/prometheus.yml), [`infra/monitoring/alerts.yml`](../infra/monitoring/alerts.yml), [`infra/monitoring/loki-config.yml`](../infra/monitoring/loki-config.yml), [`infra/monitoring/promtail-config.yml`](../infra/monitoring/promtail-config.yml), [`infra/monitoring/grafana-provisioning/datasources/datasources.yml`](../infra/monitoring/grafana-provisioning/datasources/datasources.yml), [`infra/monitoring/grafana-provisioning/dashboards/dashboards.yml`](../infra/monitoring/grafana-provisioning/dashboards/dashboards.yml), [`infra/monitoring/grafana-provisioning/dashboards/files/backend-overview.json`](../infra/monitoring/grafana-provisioning/dashboards/files/backend-overview.json), [`infra/monitoring/health-check.sh`](../infra/monitoring/health-check.sh)
- Operational: [`infra/RUNBOOK.md`](../infra/RUNBOOK.md), [`infra/SECRETS.md`](../infra/SECRETS.md), [`.env.production.example`](../.env.production.example), updated [`.gitignore`](../.gitignore)

### Open questions for Documentation & Support
1. Confirm public hostnames (`api.deliveriq.example.com`, `app.deliveriq.example.com`) so we can finalise CORS, CSP `connect-src`, and nginx `server_name`.
2. Confirm cloud target (AWS region + service mix). Cost table assumes `ap-southeast-1`.
3. PagerDuty / Slack webhook owners for Alertmanager wiring (currently empty stub in [`prometheus.yml`](../infra/monitoring/prometheus.yml)).
4. Approval policy for production deploys (1 reviewer vs 2; tech lead + security?).
5. Mobile distribution model (internal MDM vs public stores) — affects mobile CI gating beyond the current dry-run.

### For Documentation
- Use [`infra/RUNBOOK.md`](../infra/RUNBOOK.md) and [`infra/SECRETS.md`](../infra/SECRETS.md) as source for the ops chapter.
- Use §1, §2, §3 of this artifact for the "Deployment & Operations" section of the README/docs.
- Health check & alert reference (§5) feeds the SRE / on-call documentation.

### For Support (next stage)
- Alert → first-action mapping is in [`infra/RUNBOOK.md`](../infra/RUNBOOK.md) §6 — extend to a customer-facing status page playbook.
- Backup restore drill cadence (monthly) is the recommended SLO evidence ritual.

### Go / No-Go
**CONDITIONAL GO** for Documentation. Pipeline, infra, monitoring, runbook are in place and self-consistent. Pre-prod blockers (BUG-INFRA-01, BUG-RL-01, app-side `/metrics`) are tracked here and in Security §9 and do **not** block the documentation stage; they must close before the first **production** deploy.
