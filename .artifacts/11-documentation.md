# 11 — Documentation

**Project**: DeliverIQ — Enterprise Project Delivery Dashboard
**Stage**: [11] Documentation
**Date**: 2026-04-20
**Inputs consumed**: `.artifacts/01-creator-vision.md` -> `.artifacts/10-devops-pipeline.md`, source under `src/**`, infra under `infra/**`, root configs.
**Outputs produced**: This artifact, project [README.md](../README.md), and the [docs/](../docs) folder (15 files).

---

## 1. Documentation Strategy

### 1.1 Audience segments

| Audience | Primary docs |
|---|---|
| Executives / sponsors | [README.md](../README.md), [docs/user-guide-bod.md](../docs/user-guide-bod.md), [docs/changelog.md](../docs/changelog.md) |
| Project Managers | [docs/user-guide-pm.md](../docs/user-guide-pm.md), [docs/api.md](../docs/api.md), [docs/milestone-engine.md](../docs/milestone-engine.md) |
| Field engineers / Mitra | [docs/user-guide-field.md](../docs/user-guide-field.md), [docs/mobile.md](../docs/mobile.md) |
| Developers | [docs/setup-dev.md](../docs/setup-dev.md), [docs/architecture.md](../docs/architecture.md), [docs/data-model.md](../docs/data-model.md), [docs/api.md](../docs/api.md), [docs/contributing.md](../docs/contributing.md) |
| DevOps / SRE | [docs/deployment.md](../docs/deployment.md), [docs/observability.md](../docs/observability.md), [infra/RUNBOOK.md](../infra/RUNBOOK.md), [infra/SECRETS.md](../infra/SECRETS.md) |
| Security | [docs/security.md](../docs/security.md), [docs/rbac.md](../docs/rbac.md) |
| Data / Migration | [docs/excel-import.md](../docs/excel-import.md), [docs/data-model.md](../docs/data-model.md) |
| Support (next stage) | All of the above + [docs/changelog.md](../docs/changelog.md) |

### 1.2 Objectives

- Make the codebase runnable in under 15 minutes for a new developer.
- Document every implemented endpoint with a working curl example.
- Make the milestone engine auditable (formal definitions + worked examples).
- Make pre-prod blockers explicit (Security + DevOps follow-ups).
- Mark every **Phase 2** capability so Support and PMs do not promise unimplemented features.

### 1.3 Files created (manifest)

| Path | Audience | Status |
|---|---|---|
| [README.md](../README.md) | All | Done (overwritten) |
| [docs/architecture.md](../docs/architecture.md) | Dev, Sec, Ops | Done |
| [docs/api.md](../docs/api.md) | Dev, PM, Support | Done |
| [docs/data-model.md](../docs/data-model.md) | Dev, Data | Done |
| [docs/milestone-engine.md](../docs/milestone-engine.md) | Dev, PM, BOD | Done |
| [docs/excel-import.md](../docs/excel-import.md) | AD, Data, Support | Done |
| [docs/mobile.md](../docs/mobile.md) | Dev, FE, Support | Done |
| [docs/rbac.md](../docs/rbac.md) | Sec, Dev, AD | Done |
| [docs/setup-dev.md](../docs/setup-dev.md) | Dev | Done |
| [docs/deployment.md](../docs/deployment.md) | DevOps | Done |
| [docs/observability.md](../docs/observability.md) | DevOps, Support | Done |
| [docs/security.md](../docs/security.md) | Sec, DevOps | Done |
| [docs/user-guide-bod.md](../docs/user-guide-bod.md) | BOD | Done |
| [docs/user-guide-pm.md](../docs/user-guide-pm.md) | PM | Done |
| [docs/user-guide-field.md](../docs/user-guide-field.md) | FE / Mitra | Done |
| [docs/changelog.md](../docs/changelog.md) | All | Done (v0.1.0 MVP) |
| [docs/contributing.md](../docs/contributing.md) | Dev | Done |

### 1.4 Information architecture

```
README.md                     <- entry, links into docs/
docs/
  architecture.md             <- C4 + modules + request lifecycle
  api.md                      <- endpoint reference w/ curl
  data-model.md               <- entities, enums, indexes
  milestone-engine.md         <- formulas + worked examples
  excel-import.md             <- pipeline + column mapping
  mobile.md                   <- offline + sync
  rbac.md                     <- role + endpoint matrix
  setup-dev.md                <- local dev guide
  deployment.md               <- envs, CI/CD, rollback
  observability.md            <- logs, metrics, alerts
  security.md                 <- AuthN/Z, OWASP, pre-prod checklist
  user-guide-bod.md
  user-guide-pm.md
  user-guide-field.md
  changelog.md
  contributing.md
infra/
  RUNBOOK.md                  <- (DevOps) operational procedures
  SECRETS.md                  <- (DevOps) secrets handling
```

Cross-links use **relative paths** between docs. The README is the only place with the full doc index.

---

## 2. README.md Summary

- Tagline + (placeholder) badges block.
- Feature list aligned with v0.1.0 MVP (BOD/DH/PM/FE/FN/AD personas, offline mobile, milestone engine, Excel import, audit log).
- Architecture text diagram + link to the full C4.
- Tech stack table.
- Quick-start (docker-compose + npm install + prisma + dev) with first-login credentials.
- Repository layout tree.
- Scripts table.
- Documentation index (15 docs + 2 infra docs).
- Status note + Phase 2 reference.

---

## 3. API Documentation Summary

[docs/api.md](../docs/api.md) covers every implemented endpoint with curl examples:

- **Auth**: `POST /v1/auth/{login,refresh,logout}`, `GET /v1/me`.
- **Users**: `GET /v1/users(/:id)`.
- **Orders**: `GET/POST /v1/orders`, `GET /v1/orders/:id` with PM/DH scoping.
- **Sites**: `GET/POST /v1/sites`, `GET /v1/sites/:id` with FE assignment scoping.
- **Milestones**: `PATCH /v1/milestones/:id` with full state-machine table + backdate rule.
- **Imports**: `POST /v1/imports/excel`, `GET /v1/imports(/:id)`.
- **Reports**: `GET /v1/reports/bod` (cached 60 s), `GET /v1/reports/department/:id`.
- **Sync**: `POST /v1/sync/{pull,push}` with conflict policy and per-item result codes.
- **Notifications**: `GET /v1/notifications`, `POST /v1/notifications/:id/read`.
- **Audit**: `GET /v1/audit` (AD).
- **Health**: `GET /healthz`, `GET /readyz`.

Phase 2 stubs (`/v1/{sos,sows,vendors,field-updates,claims}*`) are listed and explicitly marked "501 Not Implemented".

Auth model (Bearer JWT), error envelope (RFC 7807), and rate limit notes are documented at the top of the file.

---

## 4. Architecture Documentation Summary

[docs/architecture.md](../docs/architecture.md) provides:

- C4 Level 2 (containers) text diagram: web, mobile, backend, workers, Postgres, Redis, MinIO/S3.
- C4 Level 3 (modules) for the Fastify monolith.
- Request lifecycle: nginx -> Fastify -> requireAuth/Role -> Zod -> Prisma -> audit -> BullMQ.
- Domain model summary with link to [docs/data-model.md](../docs/data-model.md).
- Mobile sync architecture summary with link to [docs/mobile.md](../docs/mobile.md) and [docs/api.md](../docs/api.md#sync).
- Cross-cutting concerns (logging, tracing, cache, audit).
- Deployment topology: dev / staging / production.

[docs/data-model.md](../docs/data-model.md) lists all 27 entities, the milestone template (10 types, weights summing to 100), enums, cascade rules, and key indexes.

[docs/milestone-engine.md](../docs/milestone-engine.md) documents the formal Progress %, GAP days, and Overall Status formulas with **six worked examples** covering early days, pre-RFS, DELAY by GAP, DELAY by RFS-imminent, AT_RISK, and ON_TRACK paths.

---

## 5. User Guides Summary

Three persona-shaped guides:

- [user-guide-bod.md](../docs/user-guide-bod.md): portfolio dashboard tiles, drill-down path, status colour legend, FAQs.
- [user-guide-pm.md](../docs/user-guide-pm.md): daily flow, create program, update milestone (with state machine + 30-day backdate rule), site creation, sync conflict notes, common error codes.
- [user-guide-field.md](../docs/user-guide-field.md): mobile setup, offline flow, allowed status changes, sync status screen, conflict resolution, common errors.

Setup (developer-side) and troubleshooting are in [docs/setup-dev.md](../docs/setup-dev.md). Operational issues are referenced from [infra/RUNBOOK.md](../infra/RUNBOOK.md).

---

## 6. Quality and Consistency Checklist

- [x] All implemented endpoints documented; Phase 2 stubs marked.
- [x] All curl examples use `Authorization: Bearer $TOKEN` consistently.
- [x] Status colour legend (green / amber / red) consistent across BOD guide, milestone engine, data model.
- [x] Role codes (`AD`, `BOD`, `DH`, `PM`, `FE`, `FN`) consistent across RBAC, API, user guides.
- [x] Milestone weights consistent across data-model and milestone-engine docs (sourced from `src/shared/src/constants.ts`).
- [x] Pre-prod checklist appears in `security.md` and is referenced from README, deployment, and changelog.
- [x] Relative links used between docs (no absolute or markdown-with-backticks file links).
- [x] No emoji.
- [x] No fabricated env vars; all reference `.env.example`.
- [x] Phase 2 items consistent with [.artifacts/06-coder-plan.md](06-coder-plan.md) §6 follow-ups and [.artifacts/10-devops-pipeline.md](10-devops-pipeline.md) §7.

### Update triggers

| Trigger | Doc to update |
|---|---|
| New endpoint or signature change | [api.md](../docs/api.md) |
| Schema change | [data-model.md](../docs/data-model.md), `.env.example` if needed |
| Engine rule change | [milestone-engine.md](../docs/milestone-engine.md) (with new worked example) |
| Excel column added | [excel-import.md](../docs/excel-import.md) |
| New role / scope | [rbac.md](../docs/rbac.md) |
| Infra / deploy change | [deployment.md](../docs/deployment.md), [observability.md](../docs/observability.md), runbook |
| Security control change | [security.md](../docs/security.md), pre-prod checklist |
| Release | [changelog.md](../docs/changelog.md) |

---

## 7. Collaboration Handoff (review notes)

### For PM
- Verify the persona language in user guides matches the pilot BU's terminology (especially STIP / SOW / KOM / RFS labels).
- Confirm "first login" credential rotation policy with IT before pilot kick-off.

### For Coder
- When the import commit endpoint (`POST /v1/imports/:id/commit`) ships, append it to [api.md](../docs/api.md#imports-excel) and remove the (Phase 2) note.
- When SO/SOW/Vendor/FieldUpdate/Claim CRUD lands, replace the stubs section in [api.md](../docs/api.md#phase-2-stubs-return-501-not_implemented).
- When `/metrics` ships, drop the "(planned)" note in [observability.md](../docs/observability.md#3-metrics-planned).

### For QA
- The state-machine, backdate, and IDOR scenarios documented under [docs/api.md](../docs/api.md#milestones) and [docs/rbac.md](../docs/rbac.md#4-server-enforcement-points) should match the integration test expectations in [tests/integration/milestones.test.ts](../tests/integration/milestones.test.ts) and [tests/integration/sync.test.ts](../tests/integration/sync.test.ts).

### Open questions / pending clarifications
1. Photo upload UX (mobile) — exact MIME allowlist + max size to document once Phase 2 implementation lands.
2. Notification email/digest cadence (07:00 WIB per SA design) — needs SMTP provider commitment before the user guides can promise email.
3. Production URL + first-login flow for the pilot BU — placeholders left in user guides.
4. Final license text (placeholder "Proprietary").
5. Status badge URLs (placeholders in README) — wire to GitHub Actions badge once `ci.yml` runs against `main`.

---

## 8. Handoff

- **Inputs consumed**:
  - All artifacts: [.artifacts/01-creator-vision.md](01-creator-vision.md), [02-pm-roadmap.md](02-pm-roadmap.md), [03-sa-system-design.md](03-sa-system-design.md), [04-uiux-design.md](04-uiux-design.md), [05-data-schema.md](05-data-schema.md), [06-coder-plan.md](06-coder-plan.md), [07-qa-test-plan.md](07-qa-test-plan.md), [08-tester-results.md](08-tester-results.md), [09-security-review.md](09-security-review.md), [10-devops-pipeline.md](10-devops-pipeline.md).
  - Source: [src/backend/src/**](../src/backend/src), [src/shared/src/**](../src/shared/src), [src/database/import/excel-mapping.ts](../src/database/import/excel-mapping.ts), [src/database/prisma/schema.prisma](../src/database/prisma/schema.prisma), [.env.example](../.env.example), [package.json](../package.json), [docker-compose.yml](../docker-compose.yml), [infra/RUNBOOK.md](../infra/RUNBOOK.md), [infra/SECRETS.md](../infra/SECRETS.md).

- **Outputs produced**:
  - [.artifacts/11-documentation.md](11-documentation.md) (this file).
  - [README.md](../README.md) (overwritten).
  - [docs/architecture.md](../docs/architecture.md), [docs/api.md](../docs/api.md), [docs/data-model.md](../docs/data-model.md), [docs/milestone-engine.md](../docs/milestone-engine.md), [docs/excel-import.md](../docs/excel-import.md), [docs/mobile.md](../docs/mobile.md), [docs/rbac.md](../docs/rbac.md), [docs/setup-dev.md](../docs/setup-dev.md), [docs/deployment.md](../docs/deployment.md), [docs/observability.md](../docs/observability.md), [docs/security.md](../docs/security.md), [docs/user-guide-bod.md](../docs/user-guide-bod.md), [docs/user-guide-pm.md](../docs/user-guide-pm.md), [docs/user-guide-field.md](../docs/user-guide-field.md), [docs/changelog.md](../docs/changelog.md), [docs/contributing.md](../docs/contributing.md).

- **Open questions**:
  1. License text (placeholder).
  2. Production URL + pilot first-login flow (placeholders).
  3. Email / WhatsApp notification provider (Phase 2).
  4. Photo upload spec (Phase 2).
  5. Documentation localisation: id-ID translations of user guides not yet produced (i18n shell exists in code).

- **Quick links for Support (next agent)**:
  - First contact: [docs/user-guide-bod.md](../docs/user-guide-bod.md), [docs/user-guide-pm.md](../docs/user-guide-pm.md), [docs/user-guide-field.md](../docs/user-guide-field.md).
  - Operational: [infra/RUNBOOK.md](../infra/RUNBOOK.md), [docs/observability.md](../docs/observability.md), [docs/deployment.md](../docs/deployment.md).
  - Known issues / Phase 2: [docs/changelog.md#known-limitations--phase-2](../docs/changelog.md#known-limitations--phase-2), [docs/security.md#8-pre-prod-checklist](../docs/security.md#8-pre-prod-checklist), [.artifacts/06-coder-plan.md §6](06-coder-plan.md), [.artifacts/10-devops-pipeline.md §7](10-devops-pipeline.md).
  - API surface: [docs/api.md](../docs/api.md).
  - Engine reference: [docs/milestone-engine.md](../docs/milestone-engine.md).
  - Excel migration help: [docs/excel-import.md](../docs/excel-import.md).

- **Go / No-Go**: **GO** for Support. Documentation is consistent with the implemented surface; Phase 2 gaps are clearly marked; pre-prod blockers are surfaced in three places (security, deployment, changelog) so Support can triage them without re-reading every artifact.
