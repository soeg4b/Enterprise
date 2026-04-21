# Changelog

All notable changes to this project will be documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/) and SemVer.

## [0.1.0] — 2026-04-20 — MVP

Initial MVP cut: critical-path delivery flows runnable end-to-end. **Conditional GO** for staging deploy from Security and DevOps; pre-prod blockers tracked in [security.md](security.md#8-pre-prod-checklist) and [deployment.md](deployment.md#11-known-follow-ups).

### Added
- Monorepo (`npm workspaces`): `shared`, `database`, `backend`, `frontend`, `mobile`, `tests`.
- Backend (Fastify 4 + Prisma 5 + BullMQ 5):
  - Auth: `/v1/auth/{login,refresh,logout}`, `/v1/me`. Dual-namespace JWT (access + refresh), bcrypt, lockout, refresh-token rotation.
  - RBAC for 6 roles (`AD`, `BOD`, `DH`, `PM`, `FE`, `FN`) with row-level scoping.
  - Programs: `GET/POST /v1/orders`, `GET /v1/orders/:id`.
  - Sites: `GET/POST /v1/sites`, `GET /v1/sites/:id`.
  - Milestones: `PATCH /v1/milestones/:id` with state machine + backdate guard + audit + recompute trigger.
  - Excel import: `POST /v1/imports/excel` (multipart, 25 MB cap, SHA-256 dedup) -> staging only.
  - Reports: `GET /v1/reports/bod` (Redis-cached 60 s), `GET /v1/reports/department/:id`.
  - Sync: `POST /v1/sync/{pull,push}` with idempotent `clientId`, server-wins on `Milestone.status` by `updatedAt`, append-only remarks.
  - Notifications: `GET /v1/notifications`, `POST /v1/notifications/:id/read`.
  - Audit: `GET /v1/audit` (AD).
  - Health: `GET /healthz`, `GET /readyz`.
- Pure milestone engine (`computeProgressPercent`, `computeGapDayToRfs`, `computeOverallStatus`, `computeOverdueDays`, `buildWarningReason`).
- Workers: `milestone.worker` (BullMQ recompute, idempotent per SOW), `import.worker` (ExcelJS streaming).
- Web (Next.js 14 App Router + Tailwind): login, sidebar shell, BOD dashboard, department detail, programs list / SO-SOW tree, site detail with milestone stepper, Excel import UI, audit log, notifications.
- Mobile (Expo + RN + expo-sqlite + expo-secure-store): login, today, site detail, milestone update, sync status, profile.
- Database: Prisma schema (Tenant, User, Department, Customer, Program, Vendor, Order, SO, SOW, Site, Segment, VendorAssignment, Milestone, MilestoneEvent, FieldUpdate, Photo, RevenueClaim, CapexBudget, CapexEntry, Notification, AuditLog, ImportJob, ImportRow, SyncOutbox, SyncCursor, RefreshToken). Idempotent seed.
- Infra: docker-compose (postgres / redis / minio / adminer / backend / web), prod overlay (read-only fs, cap_drop, nginx), backend + frontend Dockerfiles (multi-stage, non-root, tini).
- CI/CD: GitHub Actions (`ci.yml`, `deploy-staging.yml`), gitleaks, trivy, SBOM (CycloneDX), Dependabot config.
- Observability: Prometheus + Grafana + Loki + Promtail, provisioned dashboard, alert rules (pending `/metrics`).
- Tests: 33 backend integration tests (Vitest + Supertest), 36 unit tests, 5 Playwright e2e scaffolds.
- Documentation: this `docs/` set + project `README.md`.

### Security fixes during review
- BUG-AUTH-01: separate `@fastify/jwt` namespace + secret for refresh tokens.
- BUG-CODE-01: site-ownership IDOR fix in `POST /v1/sync/push` (`FieldUpdate` branch).
- CQ-04 / CQ-05: state-machine and IDOR mirror in sync push for `Milestone`.
- CQ-10: engine `diffDays` switched to UTC-midnight to remove DST off-by-one.
- Logger redaction expanded; CSP + COOP + Permissions-Policy added to Next.js.

### Known limitations / Phase 2
- `POST /v1/imports/:id/commit` (promote staged rows to entities with diff preview).
- SO / SOW / Vendor / FieldUpdate / Claim CRUD endpoints (currently 501 stubs).
- Web auth: tokens in `localStorage` (XSS-vulnerable). Move to httpOnly cookie BFF.
- Rate limiter: in-process token bucket (not multi-replica safe). Move to Redis-backed.
- Workers in-process with API; split for prod.
- Photo capture + S3/MinIO presigned PUT URLs.
- Backend `/metrics` (prom-client).
- DH approval token for backdate >30 d.
- Notification email/digest scheduler.
- OpenTelemetry tracing.
- Mobile cert pinning + `@react-navigation/native`.
