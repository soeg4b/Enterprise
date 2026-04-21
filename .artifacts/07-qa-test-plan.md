# 07 — QA Test Plan: DeliverIQ (Enterprise Project Delivery Dashboard)

**Author:** QA (Stage 7)
**Date:** 2026-04-20
**Inputs consumed:** `.artifacts/02-pm-roadmap.md`, `.artifacts/03-sa-system-design.md`, `.artifacts/06-coder-plan.md`, source under `src/backend/src/**`, `src/frontend/app/**`, `src/mobile/**`.
**Status:** Ready to execute (Tester begins on the priority queue in §11).

---

## 1. Test Strategy

### 1.1 Test Pyramid

| Level | Tooling | Target % of test count | Where it runs | What it covers |
|---|---|---|---|---|
| **Unit** | **Vitest** + ts-node ESM | ~60% | Each workspace (`deliveriq-backend`, `deliveriq-shared`, `deliveriq-frontend`, `deliveriq-mobile`) | Pure functions: milestone engine, RBAC scope helpers, Zod schemas, serialise(), state-machine `ALLOWED` map, conflict resolver, Excel mapping |
| **Integration / API** | **Supertest** (or `fastify.inject`) + **ephemeral Postgres** (`testcontainers/postgresql`) + ioredis-mock | ~25% | Backend workspace, CI matrix | All `/v1/**` routes incl. RBAC, validation, audit writes, queue enqueue, Prisma soft-delete middleware, sync push/pull |
| **Contract** | **Zod schema parity** check between `deliveriq-shared` and per-route Zod parsers; OpenAPI snapshot diff | ~3% | CI job | Detect breaking response shape changes |
| **Migration** | `prisma migrate deploy` against a fresh container + post-migration assertion script | ~1% | CI job | Forward-migration safety; idempotent seed |
| **E2E Web** | **Playwright** (Chromium + WebKit) | ~7% | Local + nightly CI | Login, BOD dashboard, PM project drill, Excel upload + polling, milestone update, audit viewer |
| **E2E Mobile** | **Detox** (preferred) — fallback **Jest + `@testing-library/react-native`** for screen-level | ~3% | Nightly CI on macOS runner (or Expo EAS Build + maestro on PR) | Login → Today → SiteDetail → MilestoneUpdate offline → Sync |
| **Non-functional** | **k6** (perf/load), **axe-core** (a11y), **OWASP ZAP baseline** (security smoke) | ~1% | Nightly + pre-release | See §6 |

### 1.2 Quality Gates

A build is **blocked from `main`** if any of the following fail:

| Gate | Threshold |
|---|---|
| Lint (`eslint`, `prettier --check`) | 0 errors |
| Typecheck (`npm run typecheck`) | 0 errors |
| Unit tests | 100% pass |
| Integration tests | 100% pass |
| Coverage (overall, lines) | ≥ **70%** |
| Coverage on `src/backend/src/engine/**` | ≥ **95%** |
| Coverage on `src/backend/src/auth/**` + RBAC paths | ≥ **90%** |
| Critical-flow E2E (login, milestone update, sync) | 100% pass |
| ZAP baseline | 0 High; ≤ 5 Medium with sign-off |
| axe (key screens) | 0 Critical; 0 Serious |

---

## 2. Code Quality Review

### 2.1 Structure & Organization — assessment

- Modular monolith layout matches SA design; clean separation of `auth/`, `engine/`, `modules/**`, `workers/**`, `services/cache.ts`, `audit/`. Easy to test in isolation.
- Pure-function engine in [src/backend/src/engine/milestone.ts](src/backend/src/engine/milestone.ts) is well-shaped for unit tests (no DB, no Date.now coupling — `today` injectable).
- Zod schemas are colocated with route handlers, which is fine but **duplicated** vs `deliveriq-shared`; long-term move all body/response schemas to `shared/` to enable client typing parity (contract tests cover the gap meanwhile).

### 2.2 Identified Code Issues (must-fix or follow-up)

| ID | Severity | File / Location | Issue | Recommendation |
|---|---|---|---|---|
| CQ-01 | **High** | [src/backend/src/auth/auth.ts](src/backend/src/auth/auth.ts) `signRefreshToken` / `verifyRefreshToken` | Single `@fastify/jwt` instance reused for both access + refresh by overriding `key` per call. Coder explicitly flagged this. Risk: misconfiguration could let an access token be accepted as refresh (or vice-versa) if `type` check is bypassed. | Register a second namespaced `@fastify/jwt` plugin (`namespace: 'refresh'`). Add an integration test attempting cross-token use (must 401). |
| CQ-02 | **High** | Frontend (per coder plan §1) | Tokens stored in `localStorage` → XSS-exfiltratable. | Track as Security finding; QA will add an XSS-injection E2E (`<script>` in remark field) to confirm CSP/escaping prevents leak. |
| CQ-03 | **High** | [src/backend/src/middleware/rate-limit.ts](src/backend/src/middleware/rate-limit.ts) | In-process token bucket → ineffective with >1 API replica. | Switch to `@fastify/rate-limit` with Redis store. Test must assert lockout shared across two API instances. |
| CQ-04 | **Medium** | [src/backend/src/modules/sync/sync.routes.ts](src/backend/src/modules/sync/sync.routes.ts) lines ~100–125 | `Milestone` UPSERT path skips the `ALLOWED` state-machine check that the REST PATCH enforces in [milestones.routes.ts](src/backend/src/modules/milestones/milestones.routes.ts). A mobile client could POST `{status:'DONE'}` from `NOT_STARTED` directly. | Extract `validateTransition()` and call from both routes. Test must cover. |
| CQ-05 | **Medium** | [src/backend/src/modules/sync/sync.routes.ts](src/backend/src/modules/sync/sync.routes.ts) | No FE-scope check that `entityId` belongs to a site assigned to `req.user`. RBAC is by role only → any FE user could push updates for another FE's site (IDOR). | Add ownership check identical to PATCH route. **Blocking** for release. |
| CQ-06 | **Medium** | [src/backend/src/modules/milestones/milestones.routes.ts](src/backend/src/modules/milestones/milestones.routes.ts) | `DONE` is terminal (`ALLOWED.DONE = empty`). PM has no reopen path even though SA design implies admin override. | Add PM/AD reopen with audit + DH-approval token. Track as defect, severity Medium. |
| CQ-07 | **Medium** | [src/backend/src/modules/sync/sync.routes.ts](src/backend/src/modules/sync/sync.routes.ts) push loop | Each item runs sequentially with multiple awaits; no per-batch transaction. Partial failures already audited but recompute jobs may queue for half-applied state. | Document explicitly; add load test asserting 50-item batch P95 < 2 s. |
| CQ-08 | **Medium** | Stubs in [src/backend/src/modules/stubs.ts](src/backend/src/modules/stubs.ts) | SO/SOW/Vendor/Claim CRUD return 501. Coder marks them safe but they appear in the OpenAPI surface. | QA must verify 501 path returns no auth bypass; UI hides the buttons; no orphan writes. |
| CQ-09 | **Medium** | [src/backend/src/modules/imports/imports.routes.ts](src/backend/src/modules/imports/imports.routes.ts) (per plan) | Excel import currently **stages only** (no commit step). End-to-end Excel→entities cannot be validated yet. | Block UAT entry until commit endpoint lands; QA will run staging-only tests in interim and tag `IMPORT-COMMIT-MISSING` open defect. |
| CQ-10 | **Low** | [src/backend/src/engine/milestone.ts](src/backend/src/engine/milestone.ts) `diffDays` uses `Math.ceil` | Boundary edge: a plan date "today at 23:00 WIB" with `today=now` may flip a day. Engine comparisons are date-only conceptually. | Normalise both sides to UTC midnight before diff. Table-driven tests will catch off-by-one. |
| CQ-11 | **Low** | Soft-delete middleware (per plan §4) | `find*` is rewritten to filter `deletedAt: null` — must ensure raw `$queryRaw` paths in reports don't bypass. | Add integration test: soft-delete a SOW and confirm it disappears from `/v1/reports/bod`. |
| CQ-12 | **Low** | Frontend `lib/auth.tsx` | No silent refresh interceptor visible. After 15 min users get 401 mid-action. | Add interceptor; UX defect not blocking. |

### 2.3 Security concerns spotted in code (deeper review delegated to Stage 9)

- **IDOR** on `/v1/sync/push` (CQ-05) — must fix.
- **Token confusion** risk on JWT (CQ-01).
- **XSS via remark / blockedReason** — both fields free-text up to 2000/500 chars. Need React's default escaping to be the only output sink (no `dangerouslySetInnerHTML`); QA will sweep frontend.
- **Path traversal / file bomb** on Excel upload — coder caps at 25 MB and uses `os.tmpdir()`. QA will fuzz with zip-bomb/xml-bomb XLSX (`exceljs` should reject).
- **Audit log immutability** — no DB-level append-only constraint. QA will assert no UPDATE/DELETE statements appear in code paths against `AuditLog` (grep test).

### 2.4 Performance concerns spotted in code

- `/v1/sync/pull` has no pagination — a long-tenured FE user could pull thousands of milestones. Add `limit` + cursor.
- BOD report cache TTL = 60 s; cold-cache query path needs measurement under 1k SOWs (k6 §6).
- `/v1/sync/push` sequential `await` per item — 50 items × ~30 ms ≈ 1.5 s; acceptable but instrument.
- No DB index audit performed by code — verify Prisma migrations include `@@index` on `Milestone(sowId)`, `Milestone(siteId, updatedAt)`, `Site(assignedFieldUserId, updatedAt)`. Add migration test.

---

## 3. Validation Results Framework

### 3.1 Requirement → Test Traceability (high-level; full matrix in §10)

Every PM user story `US-x.y` is mapped to ≥ 1 test case `TC-<module>-NNN`. No story ships without ≥ 1 positive AND ≥ 1 negative TC.

### 3.2 Scenario Catalog

For each module: **Positive** (happy path), **Negative** (rejected input / unauthorised), **Boundary** (off-by-one, max sizes, empty sets, duplicate keys), **Failure** (DB down, queue down, partial batch).

### 3.3 Pass / Fail Criteria

A test case **passes** iff:
1. Returned HTTP status matches expected.
2. Response body matches Zod schema and asserted fields.
3. Side effects assertable in DB (audit row written, queue job enqueued, cache invalidated) match expectation.
4. No unexpected log lines at level `error`.

### 3.4 Defect Severity & Priority Model

| Severity | Definition | Example |
|---|---|---|
| **S1 — Critical** | Data loss, auth bypass, prod-down, security breach, or blocks > 50 % of users from core flow | IDOR on sync push (CQ-05) |
| **S2 — Major** | Core feature broken for a role; workaround painful | DONE milestone cannot be reopened (CQ-06) |
| **S3 — Moderate** | Non-core feature broken; clear workaround | Audit viewer pagination off-by-one |
| **S4 — Minor / Cosmetic** | UI polish, copy, non-blocking edge | i18n missing string in mobile profile |

| Priority | Triage SLA | Fix SLA |
|---|---|---|
| **P0 (S1)** | ≤ 1 h | ≤ 24 h, blocks release |
| **P1 (S2)** | ≤ 4 h | ≤ 3 days, blocks release if persona impacted is in pilot |
| **P2 (S3)** | ≤ 1 day | Next sprint |
| **P3 (S4)** | ≤ 1 week | Backlog |

---

## 4. Test Cases

> Naming: `TC-<MOD>-<NNN>`. Modules: `AUTH`, `RBAC`, `ORD` (orders/SO/SOW), `SITE`, `MS` (milestones), `ENG` (engine), `IMP` (import), `SYN` (sync), `BOD` (reports), `CLM` (claims), `NOT` (notifications), `AUD` (audit), `NF` (non-functional).

### 4.1 Unit — Vitest

#### Auth & RBAC ([src/backend/src/auth/auth.ts](src/backend/src/auth/auth.ts))

| TC | Target fn | Scenario | Expected |
|---|---|---|---|
| TC-AUTH-U-001 | `hashPassword` / `verifyPassword` | Round-trip | true |
| TC-AUTH-U-002 | `verifyPassword` | Wrong password | false |
| TC-AUTH-U-003 | `requireAuth` | Missing header | throws `Errors.unauthorized` |
| TC-AUTH-U-004 | `requireAuth` | Bearer with wrong type=`refresh` | 401 |
| TC-AUTH-U-005 | `requireAuth` | Valid token but user `status≠ACTIVE` | 401 |
| TC-AUTH-U-006 | `requireRole('AD')` | role=`PM` | 403 with `code=FORBIDDEN` |
| TC-AUTH-U-007 | `signRefreshToken` then `verifyRefreshToken` | Round-trip | payload preserved |
| TC-AUTH-U-008 | `verifyRefreshToken` on access token | Cross-token attack | throws |

#### Milestone Engine ([src/backend/src/engine/milestone.ts](src/backend/src/engine/milestone.ts)) — **table-driven, ≥95% coverage required**

| TC | Function | Inputs | Expected |
|---|---|---|---|
| TC-ENG-U-001 | `computeProgressPercent` | All `NOT_STARTED` | 0 |
| TC-ENG-U-002 | `computeProgressPercent` | All `DONE`, weights sum 100 | 100 |
| TC-ENG-U-003 | `computeProgressPercent` | 1 `IN_PROGRESS` of 2 equal weight | 25 |
| TC-ENG-U-004 | `computeProgressPercent` | Custom per-milestone `weight` overrides constant | uses override |
| TC-ENG-U-005 | `computeGapDayToRfs` | `actualRfsDate` 2 d before plan | -2 |
| TC-ENG-U-006 | `computeGapDayToRfs` | Plan in future, no actual | 0 |
| TC-ENG-U-007 | `computeGapDayToRfs` | Plan in past 5 d, no actual | 5 |
| TC-ENG-U-008 | `computeOverallStatus` | `actualRfsDate` set | `ON_TRACK` |
| TC-ENG-U-009 | `computeOverallStatus` | gap=0 d | `ON_TRACK` |
| TC-ENG-U-010 | `computeOverallStatus` | gap=1 d (`AT_RISK_GAP_MIN`) | `AT_RISK` |
| TC-ENG-U-011 | `computeOverallStatus` | gap=7 d (`AT_RISK_GAP_MAX`) | `AT_RISK` |
| TC-ENG-U-012 | `computeOverallStatus` | gap=8 d (`> DELAY_GAP_DAYS`) | `DELAY` |
| TC-ENG-U-013 | `computeOverallStatus` | One open milestone overdue 4 d (>`AT_RISK_OVERDUE_DAYS=3`) | `AT_RISK` (or `DELAY` if > `DELAY_OVERDUE_DAYS`) |
| TC-ENG-U-014 | `computeOverallStatus` | Open milestone overdue beyond `DELAY_OVERDUE_DAYS` | `DELAY` |
| TC-ENG-U-015 | `computeOverallStatus` | RFS plan in 10 d AND `INSTALLATION=NOT_STARTED` | `DELAY` |
| TC-ENG-U-016 | `computeOverallStatus` | Some milestones with `planDate=null` | Treated as not-overdue (no NaN) |
| TC-ENG-U-017 | `computeOverallStatus` | Empty milestones list | `ON_TRACK`, gap-only logic |
| TC-ENG-U-018 | `buildWarningReason` | DELAY w/ gap | string contains `"past plan RFS"` |
| TC-ENG-U-019 | `buildWarningReason` | AT_RISK from overdue | mentions worst milestone type |
| TC-ENG-U-020 | `computeOverdueDays` | DONE milestone | 0 |
| TC-ENG-U-021 | `computeOverdueDays` | NOT_STARTED with null planDate | 0 |
| TC-ENG-U-022 | All fns | DST / timezone fixture: Apr 1 vs Apr 2 WIB across UTC midnight | Stable result (catch CQ-10) |

#### Milestone Routes ([src/backend/src/modules/milestones/milestones.routes.ts](src/backend/src/modules/milestones/milestones.routes.ts))

| TC | Scenario | Expected |
|---|---|---|
| TC-MS-U-001 | `ALLOWED` map: `NOT_STARTED → IN_PROGRESS` | allowed |
| TC-MS-U-002 | `ALLOWED` map: `NOT_STARTED → DONE` | rejected (not in set) |
| TC-MS-U-003 | `ALLOWED` map: `DONE → IN_PROGRESS` | rejected (terminal) — flag CQ-06 |
| TC-MS-U-004 | `PatchSchema.parse` with `remark` length 2001 | ZodError |

#### Shared Schemas (`deliveriq-shared`)

| TC | Target | Scenario | Expected |
|---|---|---|---|
| TC-SHR-U-001 | `MILESTONE_WEIGHTS` | All 8 milestone types present, weights sum = 100 | true |
| TC-SHR-U-002 | `STATUS_THRESHOLDS` | All thresholds defined and numeric | true |

#### Excel Mapping ([src/database/import/excel-mapping.ts](src/database/import/excel-mapping.ts))

| TC | Scenario | Expected |
|---|---|---|
| TC-IMP-U-001 | Map a fixture row → Order | Required fields populated, types coerced |
| TC-IMP-U-002 | Map row with missing `so_number` | Validation error captured, row marked invalid |
| TC-IMP-U-003 | Map row with lat outside Indonesia (-15..6 lat, 95..141 lon) | Invalid |
| TC-IMP-U-004 | Map duplicate `orderNumber` | Second occurrence flagged duplicate (idempotent) |

#### Frontend (Vitest + React Testing Library, jsdom)

| TC | Scenario | Expected |
|---|---|---|
| TC-FE-U-001 | `MilestoneStepper` with 3 done / 5 open | Renders 8 steps, current index correct |
| TC-FE-U-002 | `KpiTile` formats IDR currency | `Rp 1.500.000.000` |
| TC-FE-U-003 | `OfflineBanner` reacts to `navigator.onLine=false` | Banner visible |
| TC-FE-U-004 | `lib/api` retries 401 once after refresh | Single refresh call observed |

#### Mobile (Jest + RN Testing Library)

| TC | Scenario | Expected |
|---|---|---|
| TC-MOB-U-001 | `lib/sync` outbox enqueue | Row in SQLite with status=`PENDING` |
| TC-MOB-U-002 | `lib/sync` push success | Row deleted; UI cleared |
| TC-MOB-U-003 | `lib/sync` push REJECTED_STALE response | Row persisted with serverState; user notified |
| TC-MOB-U-004 | `lib/db` migrate from v0 → v1 schema | No data loss |

### 4.2 Integration — Supertest + ephemeral Postgres

#### Auth
| TC | Endpoint | Scenario | Expected |
|---|---|---|---|
| TC-AUTH-I-001 | `POST /v1/auth/login` | Valid creds | 200 + `accessToken` + refresh cookie set |
| TC-AUTH-I-002 | `POST /v1/auth/login` | Bad password | 401, audit row `LOGIN_FAILED` |
| TC-AUTH-I-003 | `POST /v1/auth/login` ×6 | Lockout after 5 fails | 6th = 429 (rate limited or lockout); audit `LOGIN_LOCKED` |
| TC-AUTH-I-004 | `POST /v1/auth/refresh` | Valid refresh cookie | new access + new refresh; old refresh revoked |
| TC-AUTH-I-005 | `POST /v1/auth/refresh` | Reuse rotated refresh | 401 + revoke whole family (rotation hardening) |
| TC-AUTH-I-006 | `POST /v1/auth/logout` | With access | 204; refresh revoked |
| TC-AUTH-I-007 | `GET /v1/me` | Without token | 401 |
| TC-AUTH-I-008 | `GET /v1/me` | Soft-deleted user's token | 401 |

#### RBAC scoping
| TC | Endpoint | Role | Expected |
|---|---|---|---|
| TC-RBAC-I-001 | `GET /v1/orders` as PM | List | only orders where `ownerUserId=me` |
| TC-RBAC-I-002 | `GET /v1/orders/:id` as PM | Other PM's order | 403 + audit `RBAC_DENIED` |
| TC-RBAC-I-003 | `GET /v1/orders` as DH | Other dept's order | filtered out |
| TC-RBAC-I-004 | `POST /v1/orders` as BOD | Create | 403 |
| TC-RBAC-I-005 | `GET /v1/sites?mine=1` as FE | List | only sites where `assignedFieldUserId=me` |
| TC-RBAC-I-006 | `PATCH /v1/milestones/:id` as FE | milestone of unassigned site | 403 (already in code; assert) |
| TC-RBAC-I-007 | `GET /v1/audit` as PM | List | 403 |
| TC-RBAC-I-008 | `GET /v1/users` as FE | List | 403 |
| TC-RBAC-I-009 | All write endpoints loop | role=BOD | 403 every one |
| TC-RBAC-I-010 | `POST /v1/sync/push` for FE on **other FE's** milestone | (CQ-05 regression) | 403 — currently expected to FAIL → defect logged |

#### Order / SO / SOW (cascading rules)
| TC | Endpoint | Scenario | Expected |
|---|---|---|---|
| TC-ORD-I-001 | `POST /v1/orders` valid | 201 + audit + scoped to creator |
| TC-ORD-I-002 | `POST /v1/orders` missing `customer` | 400 VALIDATION_FAILED |
| TC-ORD-I-003 | `POST /v1/orders` `contractValue<=0` | 400 |
| TC-ORD-I-004 | `GET /v1/orders/:id` | Returns SO→SOW tree (when CRUD lands) |
| TC-ORD-I-005 | (when SO/SOW endpoints exit stub) Create SO with end>Order.end | 422 BUSINESS_RULE |
| TC-ORD-I-006 | Stub endpoints `POST /v1/sos` | 501 Not Implemented; **no DB write** |
| TC-ORD-I-007 | Soft-delete an Order then `GET /v1/orders/:id` | 404 |

#### Sites & Milestone update → recompute trigger
| TC | Scenario | Expected |
|---|---|---|
| TC-SITE-I-001 | `POST /v1/sites` with valid lat/long | 201 + auto-spawned milestones (when SOW create wires it) |
| TC-SITE-I-002 | `POST /v1/sites` lat outside Indonesia (-90) | 400 |
| TC-SITE-I-003 | `PATCH /v1/milestones/:id` happy path `IN_PROGRESS` | 200, MilestoneEvent written, BullMQ job `recompute:{sowId}` enqueued (assert via mocked queue) |
| TC-SITE-I-004 | PATCH `status=DONE` w/o `actualDate` | 422 BUSINESS_RULE |
| TC-SITE-I-005 | PATCH backdate 31 d | 422 |
| TC-SITE-I-006 | PATCH backdate 30 d | 200 |
| TC-SITE-I-007 | PATCH `NOT_STARTED → DONE` | 422 (ALLOWED rejects) |
| TC-SITE-I-008 | After 8 PATCHes to `DONE`, fetch `/v1/reports/bod` | progressPct=100, status=ON_TRACK |
| TC-SITE-I-009 | Concurrency: 5 parallel PATCHes to same milestone | Final state consistent; 1 BullMQ job (deduped by jobId) |

#### Excel Import
| TC | Scenario | Expected |
|---|---|---|
| TC-IMP-I-001 | `POST /v1/imports/excel` happy path 5-row fixture | 202; ImportJob row; worker stages 5 ImportRows |
| TC-IMP-I-002 | Re-upload same file (same sha256) | 409 CONFLICT (idempotency) |
| TC-IMP-I-003 | Upload 26 MB | 413 |
| TC-IMP-I-004 | Upload .xlsx with malformed row (bad date) | Job completes; `GET /v1/imports/:id` shows row error count > 0 |
| TC-IMP-I-005 | Upload .xlsx with duplicate `orderNumber` | Idempotent: only 1 staged |
| TC-IMP-I-006 | Upload non-XLSX (PDF) | 400 |
| TC-IMP-I-007 | Upload zip-bomb XLSX | Worker rejects in <30 s, no OOM |
| TC-IMP-I-008 | Upload as BOD role | 403 |
| TC-IMP-I-009 | (When commit endpoint lands) Partial-failure rollback | All-or-nothing per ImportJob |

#### Mobile Sync
| TC | Scenario | Expected |
|---|---|---|
| TC-SYN-I-001 | `POST /v1/sync/pull` first call (no `since`) | Returns assigned sites + milestones; `nextToken` is ISO timestamp; SyncCursor row created |
| TC-SYN-I-002 | `POST /v1/sync/pull` with `since=nextToken` after no changes | Empty arrays |
| TC-SYN-I-003 | `POST /v1/sync/pull` after server-side update | Delta contains only new/changed |
| TC-SYN-I-004 | `POST /v1/sync/push` 1 milestone update | ACCEPTED; outbox row=ACCEPTED; recompute enqueued; audit written |
| TC-SYN-I-005 | `POST /v1/sync/push` same `clientId` again | ACCEPTED (idempotent, no double-write) |
| TC-SYN-I-006 | Push with stale `clientUpdatedAt` after server changed | REJECTED_STALE + `serverState` returned |
| TC-SYN-I-007 | Push `entity=Milestone` for milestone not on assigned site | 403 (regression for CQ-05) |
| TC-SYN-I-008 | Push `entity=Milestone op=UPSERT` with illegal transition `NOT_STARTED → DONE` | REJECTED_INVALID (regression for CQ-04) |
| TC-SYN-I-009 | Push batch 51 items | 400 (max 50) |
| TC-SYN-I-010 | Push remark text | server-side appended with `[ts][author]` prefix |
| TC-SYN-I-011 | Push `FieldUpdate` w/ lat 95.0/lon 200 | 400 (range) |
| TC-SYN-I-012 | Pull while DB unreachable | 503; no SyncCursor mutation |

#### BOD Aggregate (cache)
| TC | Scenario | Expected |
|---|---|---|
| TC-BOD-I-001 | `GET /v1/reports/bod` cold | 200; cache key set in Redis with TTL=60 |
| TC-BOD-I-002 | Second call within 60 s | Cache hit; identical bytes; query count to Postgres = 0 (assert via spy) |
| TC-BOD-I-003 | Trigger PATCH milestone → wait for worker | Cache invalidated via SCAN; next GET = miss |
| TC-BOD-I-004 | `GET /v1/reports/department/:id` as DH of other dept | 403 |
| TC-BOD-I-005 | Funnel counts reconcile with raw SQL fixture | ±0 |

#### Revenue Claim Queue (when stub replaced — currently expected 501)
| TC | Scenario | Expected |
|---|---|---|
| TC-CLM-I-001 | `GET /v1/claims` stub | 501 |
| TC-CLM-I-002 | After implementation: `GET /v1/claims?status=PENDING` | Lists SOWs where RFS achieved & no claim |
| TC-CLM-I-003 | `PATCH /v1/claims/:id` PENDING→PAID | 422 (must go via SUBMITTED) |
| TC-CLM-I-004 | `PATCH /v1/claims/:id` as PM | 403 (FN only) |
| TC-CLM-I-005 | RFS milestone DONE → claim auto-created | 1 row per OTC + MRC |

#### Notifications
| TC | Scenario | Expected |
|---|---|---|
| TC-NOT-I-001 | After `WarningRaised` event, recipient PM | 1 Notification row, unread |
| TC-NOT-I-002 | `GET /v1/notifications` | Returns user's notifications only |
| TC-NOT-I-003 | `POST /v1/notifications/:id/read` then GET | unread=false |
| TC-NOT-I-004 | Other user's notification id | 404 (not 403, to avoid enumeration) |

#### Audit Log immutability
| TC | Scenario | Expected |
|---|---|---|
| TC-AUD-I-001 | After PATCH milestone | AuditLog row exists with before/after JSON |
| TC-AUD-I-002 | grep test in CI | No `prisma.auditLog.update` or `.delete` anywhere in `src/backend` |
| TC-AUD-I-003 | `GET /v1/audit` as AD | Paginated; BigInt id serialised as string |
| TC-AUD-I-004 | `GET /v1/audit` as PM | 403 |
| TC-AUD-I-005 | DB-level: attempt UPDATE on `audit_log` row via raw SQL fixture | (Future) trigger / role rejects — tracked as Phase-2 hardening if fails |

### 4.3 E2E — Playwright (web)

| TC | Journey | Expected |
|---|---|---|
| TC-E2E-W-001 | Login → BOD dashboard loads in <3 s on seed data | KPI tiles visible, status pill counts > 0 |
| TC-E2E-W-002 | PM logs in → opens project → updates milestone to DONE | Stepper updates; Topbar notification appears |
| TC-E2E-W-003 | Admin uploads sample XLSX → polls Imports page | Status transitions UPLOADED → PARSED |
| TC-E2E-W-004 | Audit page filters by user | Rows filtered |
| TC-E2E-W-005 | Logout clears tokens; protected route → redirect to /login | Pass |
| TC-E2E-W-006 | Locale switch ID/EN | All shell strings change; no missing keys |
| TC-E2E-W-007 | XSS in remark `<img src=x onerror=alert(1)>` | Rendered as text; no script execution (Playwright `dialog` listener triggers fail) |
| TC-E2E-W-008 | RBAC UI hide: BOD sees no "Edit" buttons on PM pages | Pass |

### 4.4 E2E — Detox / Jest+RN (mobile)

| TC | Journey | Expected |
|---|---|---|
| TC-E2E-M-001 | Login → Today screen lists assigned sites | Pass |
| TC-E2E-M-002 | Toggle airplane mode → update milestone → outbox row visible on SyncStatus | Pass |
| TC-E2E-M-003 | Re-enable network → push → outbox empties | Pass |
| TC-E2E-M-004 | Force conflict (server-modified milestone) → push → REJECTED_STALE shown with merge prompt | Pass |
| TC-E2E-M-005 | Idempotency: kill app mid-push → relaunch → resync → no duplicate audit rows | Pass |
| TC-E2E-M-006 | Locale defaults to id-ID | Pass |
| TC-E2E-M-007 | Logout clears SecureStore | Pass |

### 4.5 Test Data Requirements

**Seed factory** (`tests/fixtures/factory.ts`):
- `makeUser({ role })` → unique email, hashed `Passw0rd!`.
- `makeOrder({ ownerUserId, departmentId })` with realistic IDR amounts.
- `makeSowWithMilestones({ planRfsDate, milestoneStates })` — given an array like `['DONE','DONE','IN_PROGRESS','NOT_STARTED',...]`, seeds in order.
- `makeSite({ assignedFieldUserId, sowId })`.

**Excel fixture** (`tests/fixtures/draft-dashboard-sample.xlsx`) — **5–10 rows** mirroring real sheet structure of `Draft Dashboard.xlsx`:
- 1 happy row (all fields valid).
- 1 row missing PIC.
- 1 row with bad date format.
- 1 row with lat/long out of Indonesia range.
- 1 duplicate orderNumber row.
- 1 row with unknown vendor.
- 1 row with all milestones already DONE (RFS achieved).
- 1–3 normal rows for volume.

Stored under `tests/fixtures/` and loaded by IMP-* TCs.

---

## 5. Release Quality Assessment

### 5.1 Critical Risks & Regression Hotspots

| ID | Risk | Hotspot | Mitigation |
|---|---|---|---|
| R1 | IDOR on mobile sync (CQ-05) lets one FE write another FE's milestones | `sync.routes.ts` push handler | Block release; add ownership check + TC-SYN-I-007 must pass |
| R2 | Token confusion (CQ-01) | `auth.ts` | Block release for Security gate; TC-AUTH-U-008 |
| R3 | Engine boundary off-by-one (CQ-10) misclassifies AT_RISK ↔ DELAY around DST / midnight | `engine/milestone.ts` | Table-driven TC-ENG-U-* with WIB fixture |
| R4 | State machine bypass via mobile sync (CQ-04) | `sync.routes.ts` | TC-SYN-I-008; share `validateTransition()` |
| R5 | Excel commit not implemented (CQ-09) | UAT scenario blocked | Tag as **UAT entry blocker**; staging-only tests in interim |
| R6 | DONE terminal lock (CQ-06) | Operational pain when wrong actualDate entered | Document workaround; deliver reopen by W11 |
| R7 | `localStorage` token (CQ-02) | XSS exfil | Add CSP header + TC-E2E-W-007 to prove no exec; long-term BFF |
| R8 | In-process rate-limit (CQ-03) | Multi-replica deploys ineffective | DevOps Stage 10 must size to single API replica until Redis-backed limiter lands |

### 5.2 Readiness Status — Go / No-Go (QA recommendation)

**Conditional GO** for Tester to execute the test suite. **No-Go** for production cutover until R1, R2, R4, R5 closed.

### 5.3 Blocking vs Non-Blocking Issues

| Blocker for Tester start | Blocker for Staging | Blocker for UAT | Blocker for Production |
|---|---|---|---|
| None — current build is testable | R5 (Excel commit), R1, R4 | R1, R2, R4, R5, R6 | R1, R2, R3, R4, R5, R6, R7, R8 |

### 5.4 Mitigation & Retest Plan

1. Defects raised in priority order (P0 first).
2. Fix verified by re-running the failing TC + smoke pack (≤ 30 TCs covering critical journeys).
3. Full regression nightly during fix sprint.
4. Sign-off requires 2 consecutive green nightly runs.

---

## 6. Non-Functional Tests

### 6.1 Performance (k6)

| TC | Endpoint | Profile | Target P95 |
|---|---|---|---|
| TC-NF-P-001 | `GET /v1/reports/bod` | 50 VU × 2 min | < 500 ms (cache warm), < 1500 ms cold |
| TC-NF-P-002 | `PATCH /v1/milestones/:id` | 20 VU × 2 min | < 400 ms |
| TC-NF-P-003 | `POST /v1/sync/push` 50-item batch | 10 VU × 2 min | < 2 s |
| TC-NF-P-004 | `POST /v1/sync/pull` | 30 VU × 2 min | < 800 ms |
| TC-NF-P-005 | `GET /v1/orders` paginated | 30 VU × 2 min | < 600 ms |

### 6.2 Load (k6)

| TC | Scenario | Target |
|---|---|---|
| TC-NF-L-001 | Excel import 1 000-row workbook | Worker completes in < 60 s; memory peak < 512 MB; no event-loop block > 100 ms |
| TC-NF-L-002 | 100 concurrent FE users pulling deltas | API p95 < 1 s; Postgres CPU < 70 % |
| TC-NF-L-003 | Soak: 10 min sustained mixed traffic | Zero 5xx, no memory leak (< 5 % growth) |

### 6.3 Accessibility (axe-core via Playwright)

| TC | Screen | Threshold |
|---|---|---|
| TC-NF-A-001 | Login | 0 critical, 0 serious |
| TC-NF-A-002 | BOD dashboard | 0 critical |
| TC-NF-A-003 | PM project page | 0 critical |
| TC-NF-A-004 | Excel import page | 0 critical |
| TC-NF-A-005 | Audit log | 0 critical |
| TC-NF-A-006 | Mobile (Detox a11y matchers) — Login + MilestoneUpdate | All inputs labelled |

### 6.4 Security smoke

| TC | Tool | Scenario | Expected |
|---|---|---|---|
| TC-NF-S-001 | curl | Hit every `/v1/**` route w/o auth | 401 (or 200 only for `/healthz`, `/readyz`) |
| TC-NF-S-002 | curl | Hit each role-restricted route as wrong role | 403 |
| TC-NF-S-003 | OWASP **ZAP baseline** scan against staging | 0 High |
| TC-NF-S-004 | Burp/manual | IDOR sweep on `/v1/orders/:id`, `/v1/sites/:id`, `/v1/milestones/:id`, `/v1/sync/push` | All return 403 for foreign IDs |
| TC-NF-S-005 | jwt_tool | Tamper alg=none, swap roles | 401 |
| TC-NF-S-006 | curl | Send 200 reqs/min from one IP to `/v1/auth/login` | 429 after threshold |
| TC-NF-S-007 | curl | Upload `..\..\..\etc\passwd.xlsx` filename | Filename sanitized; no traversal |

---

## 7. Defect Severity & SLA

(Detailed model in §3.4. Reproduced summary.)

| Sev | SLA Triage | SLA Fix | Release Block? |
|---|---|---|---|
| S1 | 1 h | 24 h | Yes |
| S2 | 4 h | 3 days | Yes for pilot persona |
| S3 | 1 day | Next sprint | No |
| S4 | 1 week | Backlog | No |

Defects logged to `docs/qa/defects.md` (or issue tracker) with: ID, severity, steps to reproduce, expected vs actual, screenshot/log, suspected file & line.

---

## 8. Entry & Exit Criteria for UAT

### 8.1 UAT Entry Criteria
1. All Stage-7 quality gates green (lint, typecheck, unit, integration, coverage thresholds).
2. All P0 defects closed and verified.
3. Excel `commit` endpoint implemented & TC-IMP-I-009 passes (R5 closed).
4. Sync IDOR fixed (R1).
5. State-machine parity between PATCH and sync push (R4).
6. Token confusion fix (R2) verified by Stage-9 Security.
7. Pilot dataset migrated to staging via importer.
8. Smoke pack of 30 TCs green on staging.
9. Mobile build distributed via Expo to ≥ 3 field devices, login successful.
10. UAT script signed off by PM + DH champion.

### 8.2 UAT Exit Criteria
1. ≥ 95 % of UAT scripts pass without intervention.
2. 0 open S1; ≤ 2 open S2 with documented workaround and Phase-2 commitment.
3. ≥ 70 % PM WAU during 1-week parallel run.
4. Data-quality < 10 % missing required fields after import.
5. P95 perf targets met on staging with pilot volume.
6. Security sign-off (Stage 9).
7. DevOps runbook + rollback plan signed off (Stage 10).
8. Documentation (Stage 11) covers Quickstart + persona how-tos.

---

## 9. Tooling List

| Purpose | Tool | Notes |
|---|---|---|
| Unit (TS/Node) | **Vitest** 1.x | ESM-friendly; coverage via `c8` |
| API integration | **Supertest** + `fastify.inject` | `inject` preferred (no port) |
| Ephemeral DB | **`@testcontainers/postgresql`** | Spin per test file or per CI worker |
| Redis mock | `ioredis-mock` for unit; real Redis container for integration | |
| Web E2E | **Playwright** (Chromium + WebKit) | Trace on failure; video for nightly |
| Mobile E2E | **Detox** preferred; fallback **Jest + `@testing-library/react-native`** + Maestro | Detox needs macOS runner |
| API mocks (web tests) | **MSW** (`msw/node` + `msw/browser`) | |
| Performance / load | **k6** | Cloud or local; thresholds in script |
| Accessibility | **axe-core** via `@axe-core/playwright` | |
| Security smoke | **OWASP ZAP baseline** in CI; **jwt_tool**, **Burp** for manual | |
| Coverage | **c8** (V8) → lcov uploaded to Codecov | |
| Contract | **Zod ↔ OpenAPI** snapshot via `zod-to-openapi` | |
| Lint / format | `eslint`, `prettier` | Already in stack |
| Test reporting | JUnit XML → CI; HTML report under `tests/reports/` | |

---

## 10. Traceability Matrix (User Story → Test Case)

| US | Title | Test Cases |
|---|---|---|
| US-1.1 | Admin creates user w/ role | TC-AUTH-I-001/007/008, TC-RBAC-I-008, TC-AUD-I-001 |
| US-1.2 | Login + JWT 15m/refresh | TC-AUTH-U-001..008, TC-AUTH-I-001..006 |
| US-1.3 | Password reset | (when implemented) TC-AUTH-I-101..104 |
| US-1.4 | PM scope | TC-RBAC-I-001/002, TC-AUTH-I-007 |
| US-1.5 | FN field-level RBAC | TC-CLM-I-002..004, TC-RBAC-I-009 |
| US-1.6 | BOD read-only | TC-RBAC-I-004/009, TC-E2E-W-008 |
| US-2.1 | Create Order | TC-ORD-I-001..003 |
| US-2.2 | Create SO | TC-ORD-I-005, TC-ORD-I-006 (stub now) |
| US-2.3 | Create SOW + auto-milestones | TC-SITE-I-001, TC-ORD-I-006 |
| US-2.4 | Excel import | TC-IMP-U-001..004, TC-IMP-I-001..009, TC-NF-L-001 |
| US-2.5 | Excel export | (when impl) TC-EXP-I-001..003 |
| US-3.1 | Site register | TC-SITE-I-001/002 |
| US-3.2 | Segment NE/FE | (when impl) TC-SITE-I-101..103 |
| US-3.3 | FE sees only own sites | TC-RBAC-I-005, TC-SYN-I-001/007 |
| US-4.1 | Auto milestone spawn | TC-SITE-I-001, seed factory `makeSowWithMilestones` |
| US-4.2 | Update milestone | TC-MS-U-001..004, TC-SITE-I-003..007 |
| US-4.3 | Progress % | TC-ENG-U-001..004, TC-SITE-I-008 |
| US-4.4 | GAP-day | TC-ENG-U-005..007 |
| US-4.5 | Warning flag On/At/Delay | TC-ENG-U-008..017, TC-NF-S-* |
| US-4.6 | Domain events | TC-SITE-I-003 (queue assert), TC-NOT-I-001 |
| US-5.1 | Vendor master | (stub) TC-ORD-I-006 |
| US-5.2 | Vendor assign | (when impl) TC-VEN-I-001..003 |
| US-5.3 | FE proxy assignment | TC-RBAC-I-005, TC-SYN-I-001 |
| US-6.1 | BOD dashboard | TC-BOD-I-001..005, TC-E2E-W-001, TC-NF-P-001 |
| US-6.2 | DH funnel | TC-BOD-I-004/005 |
| US-6.3 | PM workspace | TC-E2E-W-002, TC-FE-U-001 |
| US-6.4 | Pagination/filters | TC-NF-P-005 |
| US-7.1 | Mobile login + cache | TC-E2E-M-001, TC-SYN-I-001 |
| US-7.2 | Offline milestone update | TC-E2E-M-002, TC-MOB-U-001..003 |
| US-7.3 | Photo + geotag | (when wired) TC-E2E-M-101..103 |
| US-7.4 | Background sync + conflict | TC-E2E-M-003/004, TC-SYN-I-004..010 |
| US-7.5 | Check-in geotag | TC-SYN-I-011 |
| US-7.6 | i18n ID/EN | TC-E2E-W-006, TC-E2E-M-006 |
| US-8.1 | Claim queue | TC-CLM-I-001/002 |
| US-8.2 | Claim status update | TC-CLM-I-003/004 |
| US-8.3 | CAPEX view | (when impl) TC-CPX-I-001..003 |
| US-9.1 | In-app notification | TC-NOT-I-001..004 |
| US-9.2 | Email digest | (when impl) TC-NOT-I-101 |
| US-10.1 | Audit log | TC-AUD-I-001..005, TC-NF-S-005 |
| US-11.1 | CI/CD | DevOps stage; QA owns checks defined here |
| US-11.2 | Docker compose | TC-NF-S-001 (smoke) |
| US-11.3 | /healthz/readyz | TC-NF-S-001 |

---

## 11. Collaboration Handoff

### 11.1 Test Scenarios for Tester to Execute (priority order)

**Wave 1 — Smoke pack (must pass before anything else)** ~ 30 TCs:
1. All TC-AUTH-* unit + integration.
2. All TC-RBAC-I-* (esp. **TC-RBAC-I-010** to confirm CQ-05 defect).
3. TC-ENG-U-001..017 (engine table).
4. TC-MS-U-001..004.
5. TC-SITE-I-003..007 (milestone PATCH happy + sad).
6. TC-SYN-I-001/004/005/006/007/008 (sync conflict + IDOR + state machine bypass).
7. TC-BOD-I-001..003 (cache hit/miss/invalidate).
8. TC-IMP-I-001/002/004/006 (import staging).
9. TC-AUD-I-001..004.
10. TC-NF-S-001 (route auth sweep).

**Wave 2 — Functional breadth** (rest of integration suite + E2E web).

**Wave 3 — Non-functional** (k6 perf/load, axe, ZAP).

**Wave 4 — Mobile Detox / Jest** (after backend hardened).

### 11.2 Environment Setup for Tester

```bash
# 1. Clone & install
cd "/run/20260420_Enterprise_Project_Delivery_Dashboard"
cp .env.example .env   # set TEST_DB_URL, TEST_REDIS_URL
npm install

# 2. Start ephemeral infra (or rely on testcontainers)
docker compose up -d postgres redis minio

# 3. Generate Prisma client + migrate test DB
npm -w deliveriq-database run prisma:generate
DATABASE_URL=$TEST_DB_URL npx prisma migrate deploy

# 4. Run tests
npm run typecheck
npm -w deliveriq-backend test          # vitest unit + integration
npm -w deliveriq-frontend test         # vitest jsdom
npm -w deliveriq-mobile test           # jest RN
npm run e2e:web                        # playwright
npm run e2e:mobile                     # detox (macOS)
npm run perf                           # k6
npm run a11y                           # axe via playwright
npm run security:zap                   # zap baseline against staging
```

CI: GitHub Actions matrix `{ node:20, os: ubuntu-latest }` for unit/integration; macOS job for Detox; staging job for ZAP/axe nightly.

### 11.3 Security Validation Touchpoints (handoff to Stage 9)

Stage 9 must independently verify:
- CQ-01 (token confusion) — pen-test cross-token use.
- CQ-02 (localStorage XSS) — confirm CSP, no `dangerouslySetInnerHTML`.
- CQ-05 (sync IDOR) — independent fuzz across all FE-scoped resources.
- CQ-07 (audit immutability) — DB role / trigger hardening.
- ZAP findings triage.

### 11.4 Open Questions / Decision Items

1. **Excel commit** endpoint timing — must land before UAT entry. Owner: Coder.
2. **DONE reopen** path — DH-approval token flow required for ops. Owner: SA + Coder.
3. **Multi-replica** target for pilot — if yes, Redis-backed rate-limit is mandatory before staging.
4. **Detox** requires macOS CI runner — confirm budget with DevOps; otherwise fall back to Jest+RN screen tests + Maestro on PR.
5. **Audit log retention** — 1 year per US-10.1; confirm Postgres partition strategy.
6. **Photo upload** — currently scaffolded only; QA cannot validate US-7.3 until mobile wires presigned URL flow.

### 11.5 Post-Release Monitoring Checks (handoff to Stage 12 Support)

- Synthetic check on `/healthz` + `/readyz` every 1 min.
- Synthetic login + `/v1/me` every 5 min.
- Alert on: 5xx rate > 1 %, p95 latency > 1.5 s, BullMQ backlog > 100, DB CPU > 75 %, audit-log row insertion rate = 0 for > 10 min during business hours.
- Weekly review: defect inflow vs closure, P0/P1 trend.

---

## 12. Handoff

- **Inputs consumed**:
  - [.artifacts/02-pm-roadmap.md](.artifacts/02-pm-roadmap.md)
  - [.artifacts/03-sa-system-design.md](.artifacts/03-sa-system-design.md)
  - [.artifacts/06-coder-plan.md](.artifacts/06-coder-plan.md)
  - Source: [src/backend/src/](src/backend/src/), [src/frontend/app/](src/frontend/app/), [src/mobile/](src/mobile/)
- **Outputs produced**:
  - [.artifacts/07-qa-test-plan.md](.artifacts/07-qa-test-plan.md) (this document)
  - Defect log seeded with **CQ-01 … CQ-12** for Tester / Coder / Security follow-up.
- **Open questions**: Excel commit timing, DONE reopen, multi-replica target, Detox runner, audit retention, photo flow (see §11.4).
- **Go / No-Go for Tester**: **GO** to begin executing Wave 1 (smoke pack) immediately. Mark **NO-GO for production cutover** until R1, R2, R4, R5 (see §5.1) are closed and exit criteria in §8.2 are met.
