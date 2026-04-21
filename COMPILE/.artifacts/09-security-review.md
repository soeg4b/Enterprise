# 09 — Security Review: DeliverIQ (Enterprise Project Delivery Dashboard)

**Author:** Security (Stage 9)
**Date:** 2026-04-20
**Inputs consumed:** [.artifacts/03-sa-system-design.md](03-sa-system-design.md), [.artifacts/06-coder-plan.md](06-coder-plan.md), [.artifacts/07-qa-test-plan.md](07-qa-test-plan.md), [.artifacts/08-tester-results.md](08-tester-results.md), source under [src/backend/src/**](../src/backend/src), [src/frontend/**](../src/frontend), [src/mobile/**](../src/mobile).
**Outputs produced:** This document + 4 patched source files (see §6).
**Decision:** **CONDITIONAL GO** — release-blocking critical fixes have been applied; pre-prod must still address one P1 (rate-limiter scope), CSP nonce hardening, and DevOps secrets/WAF/TLS items in §7.

---

## 1. Security Review Scope

### 1.1 Assessed components and files

| Component | Files reviewed |
|---|---|
| Server bootstrap & middleware | [src/backend/src/server.ts](../src/backend/src/server.ts), [src/backend/src/middleware/rate-limit.ts](../src/backend/src/middleware/rate-limit.ts), [src/backend/src/lib/errors.ts](../src/backend/src/lib/errors.ts), [src/backend/src/lib/logger.ts](../src/backend/src/lib/logger.ts), [src/backend/src/config/env.ts](../src/backend/src/config/env.ts), [src/backend/src/bootstrap/admin.ts](../src/backend/src/bootstrap/admin.ts) |
| Auth & RBAC | [src/backend/src/auth/auth.ts](../src/backend/src/auth/auth.ts), [src/backend/src/modules/auth/auth.routes.ts](../src/backend/src/modules/auth/auth.routes.ts) |
| Domain routes | [src/backend/src/modules/users/users.routes.ts](../src/backend/src/modules/users/users.routes.ts), [src/backend/src/modules/orders/orders.routes.ts](../src/backend/src/modules/orders/orders.routes.ts), [src/backend/src/modules/sites/sites.routes.ts](../src/backend/src/modules/sites/sites.routes.ts), [src/backend/src/modules/milestones/milestones.routes.ts](../src/backend/src/modules/milestones/milestones.routes.ts), [src/backend/src/modules/sync/sync.routes.ts](../src/backend/src/modules/sync/sync.routes.ts), [src/backend/src/modules/imports/imports.routes.ts](../src/backend/src/modules/imports/imports.routes.ts), [src/backend/src/modules/reports/reports.routes.ts](../src/backend/src/modules/reports/reports.routes.ts), [src/backend/src/modules/notifications/notifications.routes.ts](../src/backend/src/modules/notifications/notifications.routes.ts), [src/backend/src/modules/stubs.ts](../src/backend/src/modules/stubs.ts) |
| Workers | [src/backend/src/workers/import.worker.ts](../src/backend/src/workers/import.worker.ts) |
| Web client | [src/frontend/lib/api.ts](../src/frontend/lib/api.ts), [src/frontend/lib/auth.tsx](../src/frontend/lib/auth.tsx), [src/frontend/next.config.mjs](../src/frontend/next.config.mjs) |
| Mobile client | [src/mobile/lib/api.ts](../src/mobile/lib/api.ts), [src/mobile/lib/db.ts](../src/mobile/lib/db.ts), [src/mobile/lib/sync.ts](../src/mobile/lib/sync.ts) |
| Configuration | [.env.example](../.env.example), [package.json](../package.json), [src/backend/package.json](../src/backend/package.json) |

### 1.2 Threat surfaces considered
- Public web SPA (Next.js) → API
- Mobile native (Expo) → API (sync push/pull, photo/field updates)
- Excel import (multipart upload, parser worker)
- Admin/BOD aggregate cache (privileged read)
- Audit log surface (read-only for AD)
- Bootstrap admin seeding path
- BullMQ job inputs (import, milestone recompute)

### 1.3 Assumptions & limitations
- Static review only; no live DAST (ZAP) yet — scheduled per QA plan §6.
- `npm audit` not executable at review time (no live registry); CVE posture is heuristic from declared major versions.
- Mobile review is source-only (no device pen-test).
- `Photo` entity declared in the sync push enum but never branched — PHOTO uploads are not yet a real attack surface; they ride on `FieldUpdate` for now.
- Database schema reviewed via the sister artifact only (Tester reported a generator block — BUG-INFRA-01).

### 1.4 Evidence sources
- Tester's 8-bug register (3 fixed, 5 open) consumed verbatim into §3.
- Tester's 33 passing integration tests provide the negative-control baseline (RBAC sweep, IDOR proof, state-machine guard).

---

## 2. Threat Model Summary (STRIDE)

Per major data flow — high-water marks only.

### 2.1 Web → API (Bearer JWT over HTTPS)
| STRIDE | Threat | Control | Status |
|---|---|---|---|
| **S** | Token theft via XSS (tokens in `localStorage`) | CSP + React escaping; `dangerouslySetInnerHTML` not used | **Partial** — CSP added (§6), but `localStorage` storage remains (CQ-02) |
| **T** | Tampered request body | Zod validation on every route | Mitigated |
| **R** | Lack of attribution | `audit()` rows on writes; `actorUserId` on every mutation | Mitigated |
| **I** | Field disclosure (esp. `passwordHash`, `tokenHash`) | `users.routes` uses `select`; `audit` returns BigInt-safe; logger redacts | Mitigated (after §6 logger fix) |
| **D** | Login flooding | Per-IP and per-email token-bucket | Partial — in-process only (BUG-RL-01, P1 in multi-replica) |
| **E** | Privilege escalation | `requireRole(...)` on every mutating route; FE site-scope guard | Mitigated (after §3 IDOR fix) |

### 2.2 Mobile → Sync (Bearer JWT, batched UPSERTs)
| STRIDE | Threat | Control | Status |
|---|---|---|---|
| S | Stolen device token replay | Token in `expo-secure-store` (Keychain/Keystore) | Mitigated |
| T | Cross-FE write (IDOR) | Site-ownership guard in both `Milestone` and `FieldUpdate` branches | Mitigated (after §6 fix) |
| R | Skipped state machine (silent DONE) | `ALLOWED_TRANSITIONS` mirror in sync handler | Mitigated |
| I | PHOTO geo-leak (EXIF) | None server-side | **Open** — recommend stripping at S3 ingest (§4.2) |
| D | Mass push DoS | `z.array(...).max(50)` + body 5 MB cap | Mitigated |
| E | Role escalation via payload | Role read from JWT, not request body | Mitigated |

### 2.3 Excel Import
| STRIDE | Threat | Control | Status |
|---|---|---|---|
| S | Forged uploader | AD-only via `requireRole('AD')` + JWT | Mitigated |
| T | Malicious workbook (zip-bomb, formula) | Size cap 25 MB; ExcelJS reads as data; no formula execution | Partial — recommend **explicit** cell-prefix sanitisation (§6 / §4.3) |
| R | Audit gap on parse | `audit('IMPORT_COMMIT', ...)` after parse | Mitigated |
| I | File path leak (we keep `s3Key` = local tmp path) | Internal field only | Partial — replace with S3 key in production (already noted in code) |
| D | Worker hang on huge sheet | Concurrency 1 + size cap; no row-count cap | **Open** — add `MAX_ROWS=200_000` guard (§7) |
| E | Workbook macro execution | ExcelJS does not execute macros | Mitigated |

### 2.4 File / Photo Upload
- Only multipart route: `POST /v1/imports/excel`, AD-only, `.xlsx?` filter, 25 MB cap, SHA-256 dedup. Acceptable.
- `Photo` entity in sync schema is **rejected** at runtime (`Unsupported entity/op`) — confirmed in [sync.routes.ts](../src/backend/src/modules/sync/sync.routes.ts). When the photo path lands, design must include: per-user pre-signed S3 PUT URLs with object-key prefixed by `userId`, server-side EXIF strip, and `Content-Type` allowlist.

### 2.5 BOD Aggregate Cache (Redis)
| STRIDE | Threat | Control | Status |
|---|---|---|---|
| I | Privileged data leak via cache key collision | `cache.key('default','reports','bod')` is a fixed singleton; role check on every read | Mitigated |
| T | Cache poisoning | Builder is privileged code only; values are not user-controlled | Mitigated |
| D | Stampede on cold MISS | TTL 60s; single-flight not implemented | Partial — acceptable for current load |

### 2.6 Audit Log
- `auditLog.update / delete` is never called in `src/backend/**` (verified; matches Tester's QA recommendation). Append-only invariant currently enforced by code convention only — recommend a CI grep gate (Tester also recommended this) and a Postgres trigger for defence-in-depth.

---

## 3. OWASP Top 10 (2021) Mapping

| # | Category | Status | Evidence | Recommendation |
|---|---|---|---|---|
| **A01** | Broken Access Control | **Mitigated*** (after fixes) | `requireRole` on every mutating route; FE site-scope in [milestones.routes.ts:39-46](../src/backend/src/modules/milestones/milestones.routes.ts), [sites.routes.ts:74-77](../src/backend/src/modules/sites/sites.routes.ts), [sync.routes.ts](../src/backend/src/modules/sync/sync.routes.ts) Milestone + FieldUpdate branches | Add CI test for the FieldUpdate IDOR (§8) |
| **A02** | Cryptographic Failures | **Partially Mitigated** | bcrypt cost ≥10 enforced by env schema; JWT secrets ≥16 chars enforced; **separate refresh signer added** ([auth.ts](../src/backend/src/auth/auth.ts)). `.env.example` ships placeholders | Generate true 32-byte secrets at deploy via Vault/SSM (§7); raise `BCRYPT_COST` to 12+ in prod (already default) |
| **A03** | Injection (SQL/XSS/Cmd) | **Mitigated** | Prisma parameterises all queries; only one raw `$queryRaw` (`SELECT 1` healthcheck — no user input) at [server.ts:97](../src/backend/src/server.ts); zero `dangerouslySetInnerHTML`; `child_process` not imported anywhere | Excel formula injection: prepend `'` to any cell value starting with `= + - @` on **export** paths (no exports yet) |
| **A04** | Insecure Design | **Mitigated** | Threat model in SA artifact §10; STRIDE this doc §2; explicit RBAC matrix; idempotent sync via `clientId`; state machine on milestones | DONE-reopen workflow (BUG-MS-01) needs an approval-token design (P3) |
| **A05** | Security Misconfiguration | **Partially Mitigated** | Helmet-equivalent headers in [server.ts:43-53](../src/backend/src/server.ts); CORS allowlist; `trustProxy:true`; CSP **added** to Next.js [next.config.mjs](../src/frontend/next.config.mjs) | CSP currently uses `'unsafe-inline'` for scripts — replace with nonces in a follow-up; lock down `trustProxy` to known proxy CIDR |
| **A06** | Vulnerable Components | **Partially Mitigated** | All declared deps are at recent majors (Fastify 4, Prisma 5, jsonwebtoken via @fastify/jwt 8, bcrypt 5, exceljs 4) | Pin via `package-lock.json` commit, enable Dependabot, `npm audit --omit=dev` in CI (§5) |
| **A07** | Identification & Auth Failures | **Mitigated*** | Bcrypt password hashing; account lockout after 5 fails (15 min); refresh-token rotation with revoke-on-use; JWT type discriminator + **separate signer** | Add password-strength policy on user create (currently only login min(8)); add MFA roadmap |
| **A08** | Software & Data Integrity | **Partially Mitigated** | SHA-256 of import file + dedup; idempotent BullMQ job IDs; audit append-only by convention | Lockfile must be committed; sign Docker images; `npm ci --ignore-scripts` in CI |
| **A09** | Logging & Monitoring | **Mitigated*** | `pino` with redaction (**expanded** in §6); request-id propagation; audit log on every write incl. login outcome | Ship logs to centralised SIEM; alert on 5+ failed logins / lockouts; alert on `REJECTED_FORBIDDEN` spike |
| **A10** | SSRF | **Mitigated** | No outbound `fetch`/`axios` from server with user-controlled URL; webhooks not implemented | If webhooks are added, validate destination against allowlist + block RFC1918 |

\* = Status reflects the security patches applied in §6 of this stage.

---

## 4. API and Authentication Security

### 4.1 API attack surface findings

| Endpoint | Auth | RBAC | Notes |
|---|---|---|---|
| `GET /healthz` | none | none | Acceptable (no internal data) |
| `GET /readyz` | none | none | Returns DB/Redis ping booleans only — acceptable |
| `POST /v1/auth/login` | none | none | Per-IP + per-email rate limit + lockout |
| `POST /v1/auth/refresh` | none | none | Verified against stored `RefreshToken` row + rotates |
| `POST /v1/auth/logout` | bearer | any | Revokes all refresh tokens for user |
| `GET /v1/me` | bearer | any | Read-only self |
| `GET /v1/users(/:id)` | bearer | AD, BOD | OK |
| `GET /v1/orders` | bearer | AD/BOD/DH/PM/FN | PM scope = `ownerUserId=self`; DH scope = department |
| `POST /v1/orders` | bearer | AD, PM | Zod + business rule (`endDate≥startDate`) |
| `GET /v1/sites(/:id)` | bearer | AD/BOD/DH/PM/FE | FE scope = assigned only |
| `POST /v1/sites` | bearer | AD, PM | OK |
| `PATCH /v1/milestones/:id` | bearer | AD/PM/FE | FE site-scope; state machine; backdate>30d guard |
| `POST /v1/imports/excel` | bearer | AD | 25 MB + `.xlsx?` filter + SHA-256 dedup |
| `GET /v1/imports(/:id)` | bearer | AD | OK |
| `GET /v1/reports/bod` | bearer | AD/BOD/DH | Cached 60s |
| `GET /v1/reports/department/:id` | bearer | AD/BOD/DH | OK |
| `POST /v1/sync/pull` | bearer | FE/PM/AD | OK |
| `POST /v1/sync/push` | bearer | FE/PM/AD | IDOR fixed (Milestone + **FieldUpdate now** in §6); state-machine fixed |
| `GET /v1/notifications` | bearer | any | Self-scoped via `req.user.id` |
| `POST /v1/notifications/:id/read` | bearer | any | Self-scoped (`updateMany where userId=self`) |
| `GET /v1/audit` | bearer | AD | OK |
| `/v1/sos*`, `/v1/sows*`, `/v1/vendors*`, `/v1/field-updates`, `/v1/claims*` | bearer | any (auth-only) | Currently **501** stubs — when implemented, **must add `requireRole`** |

**No endpoint observed missing `requireAuth`** except `/healthz` and `/readyz` (intentional). 

### 4.2 Authentication & token weaknesses
- ✅ **JWT token-confusion (BUG-AUTH-01)**: **FIXED** in §6. A second `@fastify/jwt` plugin registered with `namespace:'refresh'` and the dedicated `JWT_REFRESH_SECRET`. An access JWT can no longer be replayed as a refresh token even if the in-payload `type` discriminator is removed.
- ✅ Refresh-token rotation: implemented (revoke-old + create-new in transaction).
- ⚠️ **Refresh-token storage**: only `jti` is persisted as `tokenHash` — that is enough for revocation lookup, but the column name is misleading. Cosmetic; no exploit.
- ⚠️ **Web token storage**: `localStorage` (CQ-02). XSS would exfiltrate tokens. Compensating control: CSP added in §6 + React auto-escaping; no `dangerouslySetInnerHTML` found anywhere. Long-term: move to httpOnly cookies via Next route handlers (BFF pattern) — already in roadmap.
- ⚠️ **Mobile cert pinning**: not implemented. Recommend `react-native-ssl-pinning` or Expo `fetch+pinned` for prod build.
- ✅ **Bootstrap admin** ([bootstrap/admin.ts](../src/backend/src/bootstrap/admin.ts)): logs a warning telling operator to change the password. The default `SEED_ADMIN_PASSWORD=ChangeMe!2026` MUST be overridden per environment (Vault/SSM).

### 4.3 Input validation & error handling
- Every route schema-validates with Zod; failures are 400 + RFC 7807 envelope.
- Error handler scrubs stack traces from response body (only `requestId` returned). Verified at [server.ts:69-93](../src/backend/src/server.ts).
- `req.log.error({ err })` may log full stack — acceptable, redacted by pino on auth/cookie/secret paths.

---

## 5. Dependency Security

### 5.1 Backend declared deps (root + `src/backend/package.json`)

| Package | Declared | Note |
|---|---|---|
| `@fastify/cors` | ^9.0.1 | Current major; OK |
| `@fastify/jwt` | ^8.0.0 | Current major; OK (now used with `namespace`) |
| `@fastify/multipart` | ^8.2.0 | Current major; OK |
| `@prisma/client`, `prisma` | ^5.13.0 | Current major; **but** schema cannot generate (BUG-INFRA-01) — DevOps blocker |
| `bcrypt` | ^5.1.1 | OK |
| `bullmq` | ^5.7.0 | OK |
| `exceljs` | ^4.4.0 | Last published 4.4.0; **monitor CVEs** (4.x has had prototype-pollution CVEs historically) |
| `fastify` | ^4.27.0 | Current 4.x; OK |
| `ioredis` | ^5.4.1 | OK |
| `pino` | ^9.1.0 | Current; OK |
| `zod` | ^3.23.6 | OK |

### 5.2 Frontend / Mobile
- Next.js / React, Expo SDK, expo-secure-store, expo-sqlite — all reasonable; verify majors against the active Expo SDK at deploy time.

### 5.3 Lockfile & supply-chain
- `package-lock.json` exists at repo root → **commit it** (verify in DevOps stage). 
- **Open**: no `npm audit` gate, no Dependabot config, no SBOM generation, no signed-commit policy.
- Recommend: GitHub Dependabot (weekly), `npm audit --omit=dev --audit-level=high` in CI, `cyclonedx-npm` for SBOM, `npm ci --ignore-scripts` for build.

---

## 6. Security Fixes Applied This Stage

| # | File | Change | Verifies against |
|---|---|---|---|
| F1 | [src/backend/src/auth/auth.ts](../src/backend/src/auth/auth.ts) | Registered second `@fastify/jwt` with `namespace:'refresh'` + dedicated `JWT_REFRESH_SECRET`; `signRefreshToken`/`verifyRefreshToken` rewritten to use `app.jwt.refresh.*` | BUG-AUTH-01 / CQ-01 / OWASP A02, A07 |
| F2 | [src/backend/src/modules/sync/sync.routes.ts](../src/backend/src/modules/sync/sync.routes.ts) | Added `siteId` presence check + FE site-ownership guard in `FieldUpdate` UPSERT branch (mirrors the Milestone branch) | BUG-CODE-01 / OWASP A01 |
| F3 | [src/backend/src/lib/logger.ts](../src/backend/src/lib/logger.ts) | Expanded pino redact paths: `accessToken`, `refreshToken`, `tokenHash`, `body.password`, `body.refreshToken`, `S3_SECRET_KEY`, `SEED_ADMIN_PASSWORD`, `set-cookie`, `x-api-key` | OWASP A09 |
| F4 | [src/frontend/next.config.mjs](../src/frontend/next.config.mjs) | Added baseline **Content-Security-Policy**, COOP, Permissions-Policy, env-gated HSTS, `poweredByHeader:false`. Dev vs prod policies split | OWASP A05 / CQ-02 mitigation |

### 6.1 Before / after

**F1 (JWT separation)**
- *Before*: `signRefreshToken` called `app.jwt.sign(..., { key: env.JWT_REFRESH_SECRET })` on the access plugin. A future contributor removing the `type` check would enable token confusion across access/refresh.
- *After*: refresh signing/verification goes through a wholly separate plugin instance with its own secret. Cross-confusion is structurally impossible.

**F2 (FieldUpdate IDOR)**
- *Before*: any authenticated FE could push a `FieldUpdate` (incl. PHOTO/CHECKIN evidence) on **any** site by setting `payload.siteId`.
- *After*: For role=FE, the handler verifies `site.assignedFieldUserId === req.user.id` before insert and returns 403 / `REJECTED_FORBIDDEN` otherwise.

**F3 (log redaction)**
- *Before*: a `body.refreshToken` in a refresh-call request log line would have leaked the raw token if `LOG_LEVEL=debug` was ever set in prod.
- *After*: tokens, hashes, and S3 secrets are censored as `[REDACTED]`.

**F4 (CSP / headers)**
- *Before*: Next.js sent only `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. No CSP. XSS in any `remark`/`blockedReason` field would have full token exfil capability via `localStorage`.
- *After*: CSP defaults to `'self'` for everything plus the `NEXT_PUBLIC_API_URL` host for `connect-src`; `frame-ancestors 'none'`; HSTS preload in prod; COOP `same-origin`; production CSP forbids `'unsafe-eval'`. (Scripts still allow `'unsafe-inline'` until nonce-mode is wired — tracked.)

### 6.2 Verification steps
- F1: existing integration tests `tests/integration/auth.test.ts` should still pass (login + refresh + logout). Add a follow-up negative test: signing an access token and POSTing it to `/v1/auth/refresh` must 401.
- F2: add an integration test mirroring `TC-SYN-I-007` for entity=`FieldUpdate` (Tester's BUG-CODE-01).
- F3: run with `LOG_LEVEL=debug` against `/v1/auth/refresh`, assert no raw token substring in stdout.
- F4: `curl -I http://localhost:3000` shows `Content-Security-Policy` header in dev; build prod and confirm HSTS header present.

---

## 7. Remediation Plan

### 7.1 Findings register (consolidated)

| ID | Title | Severity | OWASP | Status | Owner |
|---|---|---|---|---|---|
| BUG-SEC-01 | Sync IDOR (Milestone) | P0 | A01 | ✅ Fixed (Tester) | Coder |
| BUG-SEC-02 | Sync state-machine bypass | P1 | A04 | ✅ Fixed (Tester) | Coder |
| BUG-CODE-01 | Sync IDOR (FieldUpdate) | P1 | A01 | ✅ **Fixed this stage (F2)** | Security |
| BUG-AUTH-01 | JWT token-confusion | P1 | A02/A07 | ✅ **Fixed this stage (F1)** | Security |
| SEC-NEW-01 | Pino redact incomplete | P2 | A09 | ✅ **Fixed this stage (F3)** | Security |
| SEC-NEW-02 | No CSP / weak Next headers | P1 | A05 | ✅ **Fixed this stage (F4)** | Security |
| BUG-RL-01 | In-process rate limiter | P1¹ | A07 | 🟡 Open | Coder + DevOps |
| SEC-NEW-03 | CSP allows `'unsafe-inline'` for scripts | P2 | A05 | 🟡 Open | Coder (FE) |
| SEC-NEW-04 | Web tokens in `localStorage` | P2 | A02/A07 | 🟡 Open (compensated by CSP + React escaping) | Coder (FE) |
| SEC-NEW-05 | No mobile TLS pinning | P2 | A02 | 🟡 Open | Coder (Mobile) |
| SEC-NEW-06 | No EXIF strip on PHOTO uploads | P3 | A04 | 🟡 Open (PHOTO not yet implemented) | Coder + DevOps |
| SEC-NEW-07 | Excel parser has no row-count cap (zip-bomb-by-rows) | P2 | A04 | 🟡 Open | Coder |
| SEC-NEW-08 | Excel formula-injection on **export** paths | P3 | A03 | 🟡 N/A yet (no exports) | Coder |
| SEC-NEW-09 | Stub routes lack `requireRole` (currently 501) | P3 | A01 | 🟡 Open — must enforce when implemented | Coder |
| SEC-NEW-10 | No `npm audit` / Dependabot / SBOM | P2 | A06/A08 | 🟡 Open | DevOps |
| SEC-NEW-11 | `.env.example` ships weak default `SEED_ADMIN_PASSWORD` | P2 | A05/A07 | 🟡 Open — operator must override; recommend Vault/SSM | DevOps |
| SEC-NEW-12 | No password complexity policy on user create | P3 | A07 | 🟡 Open (login already min(8)) | Coder |
| SEC-NEW-13 | `trustProxy:true` without proxy CIDR allowlist | P3 | A05 | 🟡 Open | DevOps |
| SEC-NEW-14 | Audit-log immutability is convention only | P3 | A09 | 🟡 Open — add CI grep + DB trigger | DevOps + Data |
| SEC-NEW-15 | No request-size cap distinct from 5 MB body for sync | P3 | A04 | 🟡 Acceptable (5 MB + max 50 items) | — |
| BUG-INFRA-01 | Prisma preview-feature blocks generate | P2 | A06 | 🟡 Open | DevOps + Data |
| BUG-MS-01 | DONE terminal, no reopen | P3 | A04 | 🟡 Open | SA + Coder |

¹ Severity raised from P2 (Tester) to P1 because at ≥2 API replicas the lockout/ratelimit silently degrades — direct exploit path for credential brute force.

### 7.2 Risk-prioritized remediation table

| Priority | Item | Effort | Owner | Deadline |
|---|---|---|---|---|
| **Pre-prod blocker** | Redis-backed rate limiter (`@fastify/rate-limit` + ioredis store) | M | Coder | Before first multi-replica deploy |
| **Pre-prod blocker** | Vault/SSM-managed JWT_SECRET, JWT_REFRESH_SECRET, DB creds, S3 keys (no `.env` in image) | S | DevOps | Pre-prod |
| **Pre-prod blocker** | Run `prisma generate` cleanly (BUG-INFRA-01) | S | Data | Pre-prod |
| Pre-prod | CSP nonce mode (drop `'unsafe-inline'` for scripts) | M | Coder (FE) | Pre-prod |
| Pre-prod | TLS termination at LB + WAF (rate, geo, payload rules) | M | DevOps | Pre-prod |
| Pre-prod | Container image scan (Trivy/Grype) + Dependabot enabled | S | DevOps | Pre-prod |
| Pre-prod | Mobile cert pinning + EXIF stripping plan when PHOTO ships | M | Coder (Mobile) | Before PHOTO feature |
| Pre-prod | Excel parser row-count cap (`MAX_ROWS=200000`) + per-cell length cap | S | Coder | Pre-prod |
| Pre-prod | CI grep test: no `auditLog.update|delete` in `src/backend/**` | S | QA | Pre-prod |
| Short-term | Password-strength policy at user-create | S | Coder | +1 sprint |
| Short-term | `trustProxy` allowlist (Fastify `trustProxy: ['10.0.0.0/8']`) | S | DevOps | +1 sprint |
| Short-term | DONE-reopen approval-token design (BUG-MS-01) | M | SA + Coder | +1 sprint |
| Short-term | SBOM (cyclonedx) + image signing (cosign) | M | DevOps | +1 sprint |
| Long-term | Migrate web tokens to httpOnly cookies via Next BFF | L | Coder (FE) | +2 sprints |
| Long-term | MFA (TOTP) for AD / BOD roles | L | Coder | Q3 |
| Long-term | Postgres trigger on `audit_log` to deny UPDATE/DELETE | M | Data | Q3 |

### 7.3 Verification / retest checklist
- [ ] Negative test: refresh endpoint with an access token → 401 (covers F1)
- [ ] Negative test: FE pushes `FieldUpdate` for unassigned site → 403 (covers F2)
- [ ] Run with `LOG_LEVEL=debug` against `/v1/auth/login` and `/v1/auth/refresh`; grep stdout for the literal token; must be `0 matches` (covers F3)
- [ ] `curl -I` against built Next.js: `Content-Security-Policy`, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy` present (covers F4)
- [ ] Two API replicas behind nginx, run 100-attempt brute force from one IP — expect 429 across both replicas (verifies BUG-RL-01 fix)
- [ ] ZAP baseline scan: 0 High findings
- [ ] `npm audit --omit=dev --audit-level=high` exits 0 in CI

---

## 8. Collaboration Handoff

### 8.1 Actions for **Coder** (unfixed items)

1. **BUG-RL-01 — replace in-process rate-limiter** with `@fastify/rate-limit` + Redis store. Keep the existing per-IP and per-email policies. **Pre-prod blocker.**
2. **CSP nonce mode** (SEC-NEW-03): remove `'unsafe-inline'` from `script-src` once Next App Router nonce middleware is wired.
3. **Excel parser caps** (SEC-NEW-07): add `MAX_ROWS` env (default 200_000) and per-cell length cap (e.g. 32 KB) inside [import.worker.ts](../src/backend/src/workers/import.worker.ts).
4. **Stub routes RBAC** (SEC-NEW-09): when implementing `/v1/sos`, `/v1/sows`, `/v1/vendors`, `/v1/field-updates`, `/v1/claims`, attach `requireRole` per the SA matrix.
5. **Password strength policy** (SEC-NEW-12): on user create / change-password, require min 12 chars, mixed classes; reject top-1k common passwords (zxcvbn).
6. **Mobile cert pinning** (SEC-NEW-05): adopt `react-native-ssl-pinning` (or Expo equivalent) for production builds.
7. **PHOTO pipeline** (SEC-NEW-06): when implementing, return per-user-prefixed pre-signed S3 PUT URLs, validate MIME, EXIF-strip server-side via `sharp`.
8. Web roadmap: replace `localStorage` token storage with httpOnly cookies via Next route handlers acting as a BFF (SEC-NEW-04).

### 8.2 Validation focus for **QA**

- Add the two negative tests in §7.3 to the integration suite (FieldUpdate IDOR, access-token-as-refresh).
- Add a CI grep gate: `! grep -RE "auditLog\.(update|delete)" src/backend` (SEC-NEW-14).
- Add CSP regression test (Playwright): `expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'")`.
- Schedule nightly `npm audit` + ZAP baseline against the preview env.

### 8.3 Residual risks at release

| Risk | Compensating control | Acceptable for MVP? |
|---|---|---|
| Web token in `localStorage` | CSP + React escaping + no `dangerouslySetInnerHTML` | Yes (with CSP merged) |
| In-process rate limit | Single-replica deploy + WAF rate rule | Yes (only at single replica) |
| No mobile cert pinning | TLS + short access-token TTL (15 min) | Yes for internal pilot, **no** for app-store release |
| Default seed admin creds | Operator password rotation on first boot + audit log | Yes (operator MUST rotate) |
| Audit log not DB-immutable | Code-only invariant + AD-only read | Yes (with CI grep gate) |

### 8.4 Follow-up security review items
- Re-review after Coder ships rate-limiter, CSP nonce, password policy, and the PHOTO pipeline.
- Full DAST (ZAP full scan) against staging.
- Threat-model refresh once webhooks / external integrations land (SSRF surface).

---

## 9. Release Gate Decision

**CONDITIONAL GO** for DevOps to proceed with pipeline & infra wiring.

**Pre-prod required (must land before production cutover):**
1. Redis-backed rate limiter (BUG-RL-01).
2. Secrets sourced from Vault/SSM, not `.env` in image (SEC-NEW-11).
3. Prisma `generate` works in CI (BUG-INFRA-01).
4. CSP nonce mode (drop script `'unsafe-inline'`) — SEC-NEW-03.
5. Excel parser row-count + per-cell length caps — SEC-NEW-07.
6. CI: `npm audit` gate, image scan, lockfile committed, Dependabot enabled (SEC-NEW-10).

**Acceptable for staging / internal pilot now.** Critical and P1 items either fixed in §6 or compensated.

---

## 10. Handoff

### Inputs consumed
- [.artifacts/03-sa-system-design.md](03-sa-system-design.md)
- [.artifacts/06-coder-plan.md](06-coder-plan.md)
- [.artifacts/07-qa-test-plan.md](07-qa-test-plan.md)
- [.artifacts/08-tester-results.md](08-tester-results.md)
- Source: [src/backend/src/**](../src/backend/src), [src/frontend/**](../src/frontend), [src/mobile/**](../src/mobile), [.env.example](../.env.example), [package.json](../package.json)

### Outputs produced
- [.artifacts/09-security-review.md](09-security-review.md) — this document
- Patched source files (4):
  - [src/backend/src/auth/auth.ts](../src/backend/src/auth/auth.ts) — F1 JWT separation (BUG-AUTH-01)
  - [src/backend/src/modules/sync/sync.routes.ts](../src/backend/src/modules/sync/sync.routes.ts) — F2 FieldUpdate IDOR (BUG-CODE-01)
  - [src/backend/src/lib/logger.ts](../src/backend/src/lib/logger.ts) — F3 expanded pino redaction
  - [src/frontend/next.config.mjs](../src/frontend/next.config.mjs) — F4 CSP + COOP + HSTS + Permissions-Policy

### For **Coder** — fix list (must land pre-prod)
1. Redis-backed rate limiter (BUG-RL-01, P1)
2. CSP nonce mode (SEC-NEW-03, P2)
3. Excel parser row + cell caps (SEC-NEW-07, P2)
4. Password strength policy at user create (SEC-NEW-12, P3)
5. Stub routes — attach `requireRole` per SA matrix when implemented (SEC-NEW-09)
6. Mobile cert pinning (SEC-NEW-05) and PHOTO EXIF strip (SEC-NEW-06) when feature ships
7. Add the two regression tests in §7.3 (FieldUpdate IDOR, access-as-refresh)

### For **DevOps**
1. Secrets in Vault/SSM (no `.env` baked into image); rotate `SEED_ADMIN_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `S3_SECRET_KEY`, `DATABASE_URL` per env (SEC-NEW-11)
2. TLS at the load balancer; do **not** rely on app-side HSTS without TLS
3. WAF in front of API (rate, geo allow, body-size, OWASP CRS)
4. Container image scan (Trivy/Grype) in CI; `npm audit` gate; SBOM (cyclonedx)
5. Dependabot/Renovate config
6. Commit `package-lock.json`; build with `npm ci --ignore-scripts`
7. `trustProxy` allowlist (CIDR of the LB) — set `TRUST_PROXY` env or extend Fastify config (SEC-NEW-13)
8. Resolve BUG-INFRA-01 so `prisma generate` runs cleanly in CI
9. Centralised log shipping (loki/elastic) with alerting on `LOGIN ok=false` spikes and `REJECTED_FORBIDDEN` from sync
10. Postgres trigger denying UPDATE/DELETE on `audit_log` (SEC-NEW-14)

### Open questions
- DONE-reopen approval-token flow design (BUG-MS-01) — needs SA decision before Coder can implement.
- WAF product choice (CloudFront + AWS WAF vs Cloudflare vs nginx-modsecurity) — DevOps to confirm with infra team.
- Mobile distribution model (MDM vs public store) — drives cert-pinning urgency.

### Go / No-Go for DevOps
**CONDITIONAL GO.** Proceed with pipeline + infra. Do not promote to production until the six "Pre-prod required" items in §9 are merged and verified.
