# 02 — Product Manager Roadmap: DeliverIQ (Enterprise Project Delivery Dashboard)

**Author:** Product Manager (Stage 2)
**Date:** 2026-04-20
**Planning horizon:** 12 weeks MVP + 8 weeks Phase 2 + Phase 3 (Months 7–12)
**Pilot scope (recommended):** 1 Business Unit (Enterprise BU), ~80 active SOs / ~400 sites, 6 mitra crews, ~60 internal users.
**Tech stack (locked):** Next.js 14 (web) · React Native + Expo (mobile, offline-first) · Node.js + Fastify (TS) · PostgreSQL + Prisma · JWT auth · WatermelonDB or SQLite for mobile sync.

---

## 0. MVP Scope Decision (IN / OUT)

### IN — MVP (Week 12 cutover in pilot BU)
| # | Capability | Why IN |
|---|---|---|
| 1 | Auth + RBAC for 6 roles (BOD, Dept Head, PM, Field/Mitra, Finance, Admin) | Foundation; six-team access is the primary Excel pain point |
| 2 | Core entities: Order → SO → SOW → Site (NE/FE) → Milestone → Vendor activity | Domain model is the product's differentiator |
| 3 | Excel importer for "Draft Dashboard.xlsx" (one-cycle parallel run) | Mandatory per Creator constraint |
| 4 | Milestone tracking: STIP 2/4, STIP 10, Design, Procurement, KOM, Material, Installation, RFS | Replaces Excel TEL tab |
| 5 | Auto Progress %, GAP-day-to-RFS, On-Track/Delay flag, Project Warning | Removes manual computation; trust driver |
| 6 | BOD executive dashboard + Dept/Project drilldowns | KPI ownership across personas |
| 7 | Mobile field app (RN/Expo) with offline updates, photo + geotag, background sync | "Offline-first is non-negotiable" |
| 8 | Vendor/Mitra master + assignment to SOW (internal-managed; **no external login in MVP**) | Reduces security scope |
| 9 | Revenue claim **visibility** (OTC/MRC) tied to RFS + CAPEX realization view (read-only) | Finance persona needs it for trust; full ERP integration deferred |
| 10 | Notifications (in-app + email) for milestone overdue and delay alerts | Behavior change driver |
| 11 | Audit log (who/what/when on every write) | Governance + R6 mitigation |
| 12 | Excel export (per project, per dept, portfolio) | Safety net during cutover |
| 13 | Bahasa Indonesia + English UI (i18n shell, ID strings prioritized) | Field adoption |
| 14 | Health checks, structured logging, CI/CD, Docker compose | Production-ready baseline |

### OUT — deferred to Phase 2/3 (with rationale)
| Capability | Defer to | Reason |
|---|---|---|
| External Mitra/Vendor portal login | Phase 2 | Security scope (MFA, scoped per-project ACL) doubles auth work; mitra updates handled via assigned internal field user in MVP per R3/R6 |
| WhatsApp notifications | Phase 2 | Requires BSP onboarding + template approval; in-app + email sufficient for MVP |
| ERP / Finance system integration (claim trigger, CAPEX actuals) | Phase 2 | Target ERP not yet confirmed (open Q from Creator); MVP uses manual upload/entry |
| Map view of sites with status overlay | Phase 2 | Geotag is captured in MVP, visualization is nice-to-have |
| Document management (SPK, PO, Handover PDFs) | Phase 2 | MVP allows photo evidence + URL link; full DMS = scope creep (R5) |
| Predictive delay scoring (ML) | Phase 3 | Needs ≥6 months of clean data |
| Multi-tenant / multi-BU productization | Phase 3 | Pilot is single BU |
| OSS/inventory integration, customer portal, SLA mgmt | Phase 3 | Not in pilot success criteria |
| Vendor scorecards, bottleneck heatmap | Phase 2 | MVP ships raw data + basic dept funnel; advanced analytics after data quality stabilizes |
| Advanced PDP/data-residency hardening (on-prem option) | Phase 2 | MVP = local cloud (single region, ID); revisit after pilot |

**Justification for cuts:** Each cut either (a) depends on an unanswered Creator open question, (b) requires external-party onboarding that blows the 12-week window, or (c) is analytics on data that doesn't exist yet. The MVP IN list still satisfies all 4 strategic goals and Gate 1 criteria.

---

## 1. Roadmap

### Phase Milestones
| Phase | Window | Theme | Exit Criteria (Gate) |
|---|---|---|---|
| **MVP** | W1–W12 | Replace the Excel, earn trust | Pilot BU live; ≥70% PM WAU; Excel decommissioned in pilot; data-quality < 10% missing fields |
| **Phase 2** | W13–W20 (Months 4–6) | Optimize & integrate | ERP claim trigger live; mitra portal in production; WhatsApp notifications; map view; claim cycle −15% |
| **Phase 3** | W21+ (Months 7–12) | Scale & intelligence | Predictive delay scoring v1; multi-BU; OSS integration; productization assessment |

### Dependency / Sequencing Notes
- Auth + entity model + Excel import are **prereqs** for everything else. No parallelization shortcut.
- Milestone engine (auto Progress %, GAP-day, warning flags) **blocks** all dashboards.
- Mobile offline sync **depends on** stable backend write API + conflict resolution rules (must be defined by W6).
- Notifications **depend on** milestone engine events.
- UAT **requires** migrated pilot data ready by W10.

---

## 2. Prioritized Feature List (MoSCoW · Effort)

Effort: S = ≤3 dev-days · M = 4–8 dd · L = 9–15 dd · XL = >15 dd. MVP capacity ≈ 5 engineers × 60 productive days ≈ 300 dev-days.

| # | Feature | MoSCoW | Effort | Phase | Owner Roles |
|---|---|---|---|---|---|
| F1 | Auth (JWT, login, password reset) | M | M | MVP | BE, FE |
| F2 | RBAC (6 roles, field-level edit rules) | M | L | MVP | BE, FE, Sec |
| F3 | Entity model + Prisma schema (Order/SO/SOW/Site/Milestone/Vendor/Claim) | M | L | MVP | BE, Data |
| F4 | Excel importer ("Draft Dashboard.xlsx") + cleansing rules | M | XL | MVP | BE, Data |
| F5 | Excel exporter (project, dept, portfolio) | M | M | MVP | BE |
| F6 | Site & Segment mgmt (NE/FE, lat/long, master data) | M | M | MVP | BE, FE |
| F7 | Milestone tracking CRUD (STIP 2/4, 10, Design, Procurement, KOM, Material, Installation, RFS) | M | L | MVP | BE, FE |
| F8 | Auto Progress % + GAP-day + Warning flag engine | M | L | MVP | BE |
| F9 | Vendor/Mitra master + SOW assignment | M | M | MVP | BE, FE |
| F10 | BOD executive dashboard (portfolio KPIs + drill-down) | M | L | MVP | FE, Design |
| F11 | Dept Head dashboard (milestone funnel, bottlenecks) | M | M | MVP | FE, Design |
| F12 | PM project workspace (timeline, sites, vendor, remarks) | M | L | MVP | FE, Design |
| F13 | Mobile app shell (RN/Expo, login, role-aware home) | M | M | MVP | Mobile, Design |
| F14 | Mobile offline sync (SQLite/WatermelonDB + conflict policy) | M | XL | MVP | Mobile, BE |
| F15 | Mobile milestone update + photo/geotag capture | M | L | MVP | Mobile |
| F16 | Revenue claim visibility (OTC/MRC tied to RFS) | M | M | MVP | BE, FE |
| F17 | CAPEX realization view (read-only) | M | S | MVP | BE, FE |
| F18 | Notifications (in-app + email) for overdue/delay | M | M | MVP | BE, FE |
| F19 | Audit log (write-side) | M | M | MVP | BE, Sec |
| F20 | i18n (ID/EN) | M | S | MVP | FE, Mobile |
| F21 | Health check + structured logging | M | S | MVP | BE, DevOps |
| F22 | CI/CD + Docker compose | M | M | MVP | DevOps |
| F23 | WhatsApp notifications | S | M | Phase 2 | BE |
| F24 | External Mitra portal (scoped login + MFA) | S | L | Phase 2 | BE, FE, Sec |
| F25 | ERP claim trigger + CAPEX actuals integration | S | XL | Phase 2 | BE, Data |
| F26 | Map view with status overlay | S | M | Phase 2 | FE |
| F27 | Document mgmt (SPK/PO/Handover PDFs) | S | M | Phase 2 | BE, FE |
| F28 | Vendor scorecards + bottleneck heatmap | S | M | Phase 2 | FE, Data |
| F29 | Predictive delay scoring (ML) | C | L | Phase 3 | Data |
| F30 | Multi-tenant / multi-BU | C | XL | Phase 3 | BE |
| F31 | OSS/inventory integration | C | XL | Phase 3 | BE |
| F32 | Customer-facing status portal | C | L | Phase 3 | FE, BE |
| F33 | SLA mgmt + revenue-at-risk auto report | C | L | Phase 3 | BE, Data |
| F34 | Gantt with critical-path highlighting | W | L | — | Won't do for MVP — basic timeline sufficient |

**Rationale:** Every Must aligns to one of the 4 Strategic Goals from the vision. Should items unlock the Phase 2 KPI targets (claim cycle −30%, mitra adoption 60%). Could items address Phase 3 productization. F34 is parked because basic timeline+GAP-day delivers 80% of value.

---

## 3. Epics → Features → User Stories (with Acceptance Criteria)

Persona shorthand: **BOD**, **DH** (Dept Head), **PM**, **FE** (Field/Mitra), **FN** (Finance), **AD** (Admin).

---

### EPIC 1 — Authentication & RBAC

**F1/F2 user stories:**

**US-1.1** As an **AD**, I want to create users and assign one of 6 roles, so that each team only sees what they should.
- **AC:**
  - Given I am Admin, when I create a user with role=PM, then that user can only access PM features.
  - User cannot self-elevate role.
  - Email is unique; password meets policy (≥10 chars, 1 number, 1 symbol).
  - User creation is written to audit log.

**US-1.2** As a **user (any role)**, I want to log in with email/password and stay logged in for 8h, so that I don't re-auth all day.
- **AC:** JWT access (15 min) + refresh (8h); refresh rotates; logout invalidates refresh; failed-login lockout after 5 attempts/10 min.

**US-1.3** As a **user**, I want to reset my password via email link, so that I can recover access.
- **AC:** Token single-use, 30-min TTL; old sessions invalidated on reset.

**US-1.4** As a **PM**, I want to be restricted to projects I own or am assigned to, so that confidentiality is preserved.
- **AC:** PM list/detail endpoints filter by `ownerUserId OR assignedUserIds`. Attempting to access another PM's project returns 403 and is audit-logged.

**US-1.5** As a **FN**, I want read-only access to delivery data + edit access to claim status fields, so that I can do my job without breaking project data.
- **AC:** Field-level RBAC matrix enforced server-side (not just UI hide). Attempted write to non-permitted field = 403.

**US-1.6** As a **BOD**, I want a read-only portfolio view across all departments, so that I see the full picture without operational noise.
- **AC:** All write endpoints return 403 for BOD role. All dashboards load aggregates only.

**RBAC matrix (MVP):** Admin = all; BOD = read all; DH = read+edit own dept; PM = read+edit own projects; FE = read+edit assigned site milestones (mobile-only writes for status); FN = read all + write claim/CAPEX-actual fields.

---

### EPIC 2 — Order / SO / SOW Management

**US-2.1** As an **AD/PM**, I want to create an Order with customer, contract value, OTC/MRC, CAPEX budget, so that revenue baseline is captured.
- **AC:** Required fields validated; numeric fields >0; currency = IDR default; audit-logged.

**US-2.2** As a **PM**, I want to create one or more SOs under an Order, each with start/end dates and PIC, so that work is contracted.
- **AC:** SO start ≥ Order start; SO end ≤ Order end; PIC must be a user with PM/DH role; SO has unique `so_number`.

**US-2.3** As a **PM**, I want to create SOWs under an SO with scope, plan-RFS-date, and assigned vendor, so that work units are tracked.
- **AC:** SOW links to ≥1 Site; plan-RFS-date is mandatory; vendor must be from active master.

**US-2.4** As an **AD**, I want to import the existing "Draft Dashboard.xlsx" and have all Orders/SOs/SOWs/Sites/Milestones created in one run, so that I don't re-key 12 months of data.
- **AC:**
  - Importer accepts the workbook structure documented in vision §2.
  - Pre-import validation report shows row-by-row errors (missing PIC, bad dates, unknown customer) before commit.
  - Idempotent: re-running with same file does not duplicate.
  - Migration log persisted; rollback supported within 24h.
  - ≥95% of valid rows imported without manual intervention on the seed dataset.

**US-2.5** As a **PM/DH**, I want to export my project list / dept portfolio to Excel, so that I can share offline.
- **AC:** Export reflects current filters; includes timestamp + user; respects RBAC (no fields user can't see).

---

### EPIC 3 — Site & Segment Management

**US-3.1** As a **PM**, I want to register a Site with type (NE/FE), address, lat/long, and customer location ID, so that field work has a target.
- **AC:** lat/long validated as Indonesian range; duplicate site on same SOW blocked; geocoding helper offered but optional.

**US-3.2** As a **PM**, I want to define segments between NE and FE sites (A-end / Z-end), so that connectivity scope is explicit.
- **AC:** Segment must reference exactly one NE and one FE site; segment inherits SOW.

**US-3.3** As an **FE**, I want to see only sites assigned to me on mobile, so that my task list is focused.
- **AC:** Mobile site list filtered by `assignedFieldUserId`; offline cache scoped to assigned sites only.

---

### EPIC 4 — Milestone Tracking & Engine

**US-4.1** As a **PM**, I want each Site/SOW to auto-create the standard milestone set (STIP 2/4, STIP 10, Design, Procurement, KOM, Material, Installation, RFS) on creation, so that I don't manually set them up.
- **AC:** Milestone template versioned; creating SOW spawns 8 milestones with plan dates derivable from RFS-plan offsets; offsets configurable by Admin.

**US-4.2** As a **PM/FE**, I want to update milestone actual-date and status, so that progress is tracked.
- **AC:** Status enum: Not Started / In Progress / Done / Blocked; actual-date required when status=Done; backdating allowed up to 30 days, beyond that requires DH approval.

**US-4.3** As any user, I want **Progress %** to be auto-calculated from milestone completion, so that no one fudges it.
- **AC:** Weighted formula: each milestone has weight (sum=100); Progress% = Σ(weight × completion). Recomputed on every milestone write. Documented and exposed via API.

**US-4.4** As any user, I want **GAP-day-to-RFS** computed as `plan_RFS_date − today` (or `actual_RFS − plan_RFS` when done), so that delays are quantified.
- **AC:** Negative GAP = ahead; positive = behind. Recomputed nightly + on every milestone write.

**US-4.5** As any user, I want a **Warning flag** auto-set when (a) any milestone is overdue >3 days OR (b) GAP-day-to-RFS > 7 days OR (c) RFS-plan within 14 days and Installation not started, so that I know what to chase.
- **AC:** Flag levels: On-Track / At-Risk / Delay. Rule engine config-driven. Test cases cover all 3 triggers.

**US-4.6** As a **PM**, I want milestone changes to emit events, so that notifications & dashboards refresh.
- **AC:** Domain events `MilestoneUpdated`, `WarningRaised`, `RfsAchieved` published to internal bus; consumed by notification + dashboard cache.

---

### EPIC 5 — Vendor / Mitra Management

**US-5.1** As an **AD**, I want to maintain the vendor master (name, PIC, contact, SPK doc reference), so that assignment is consistent.
- **AC:** Vendor name unique; soft-delete; audit-logged.

**US-5.2** As a **PM**, I want to assign a vendor to an SOW with SPK number, SPK date, and PO date, so that responsibility is clear.
- **AC:** Vendor must be active; SPK date ≤ PO date ≤ Material date.

**US-5.3** As an **AD**, I want to assign internal Field users as the on-the-ground proxy for a vendor crew, so that mobile updates flow without external login.
- **AC:** Field user assignment per SOW; only assigned user sees site on mobile.

---

### EPIC 6 — Dashboards (BOD / Dept / Project)

**US-6.1** As **BOD**, I want a portfolio dashboard with: total contract value, OTC/MRC revenue, revenue at risk, CAPEX % consumed, On-Track/At-Risk/Delay counts, monthly RFS plan vs actual, so that I can run weekly reviews.
- **AC:** Loads in <3s for pilot data volume; numbers reconcile with underlying records ±0; drill-down to dept in 1 click.

**US-6.2** As **DH**, I want a milestone funnel showing counts at each stage and avg days-in-stage, so that bottlenecks are obvious.
- **AC:** Funnel respects dept filter; clicking a stage lists overdue items; CSV export available.

**US-6.3** As **PM**, I want a project workspace with site list, milestone timeline (simple Gantt), vendor execution, remarks, recent activity, so that I run standups from one screen.
- **AC:** Timeline shows plan vs actual bars + GAP-day badge; remarks support @mention (in-app notification).

**US-6.4** As any dashboard user, I want server-side pagination & filters (dept, customer, vendor, status, date range), so that screens stay responsive.
- **AC:** P95 query <500ms on pilot data; URL-encoded filter state shareable.

---

### EPIC 7 — Mobile Field App (Offline-First)

**US-7.1** As **FE**, I want to log in once and have my assigned sites cached, so that I can work offline all day.
- **AC:** First login fetches assigned sites + open milestones + last 30 days history; refreshable on demand; cache encrypted at rest.

**US-7.2** As **FE**, I want to update a milestone (Survey, Permit, Material Ready, MOS, Install Start/Finish, Ext FO Straightening, RFS) offline, so that no signal ≠ no work.
- **AC:** Updates queue locally; status badge "Pending sync"; queue persists across app restarts.

**US-7.3** As **FE**, I want to attach a photo with auto geotag + timestamp to each update, so that evidence is captured.
- **AC:** Photo compressed to ≤500KB; EXIF geotag preserved; if geotag missing, prompt to confirm location; photos uploaded async on sync.

**US-7.4** As **FE**, I want background sync when the app regains connectivity, so that I don't have to remember.
- **AC:** Sync triggered on network-up + app-foreground; retries with backoff; conflict policy = server-wins for status, append-only for photos; user notified of any rejected updates.

**US-7.5** As **FE**, I want a check-in action with geotag at site arrival, so that attendance is auditable.
- **AC:** Check-in records lat/long + timestamp + site; if >500m from registered site coords, flag for review.

**US-7.6** As **FE**, I want UI in Bahasa Indonesia by default, so that the app is usable in the field.
- **AC:** Default locale = id-ID; toggle to en-US; all field-app strings translated.

---

### EPIC 8 — Revenue Claim & CAPEX

**US-8.1** As **FN**, I want a claim queue listing every SOW where RFS is achieved but claim is not submitted, so that nothing slips.
- **AC:** Queue filters: OTC/MRC, customer, age. Each row shows RFS date, days-since-RFS, claim status (Pending / Submitted / Paid).

**US-8.2** As **FN**, I want to update claim status with submitted-date, invoice-number, paid-date, so that the cycle is tracked.
- **AC:** Only FN can edit claim fields; transitions enforced (Pending → Submitted → Paid); audit-logged.

**US-8.3** As **FN/PM**, I want a CAPEX realization view per SO showing budget vs actual vs % consumed, so that overruns surface early.
- **AC:** Actuals entered manually in MVP (no ERP); variance >10% highlighted; export to Excel.

---

### EPIC 9 — Notifications

**US-9.1** As any user, I want in-app notifications when a milestone I own is overdue or a warning is raised on my project, so that I can act.
- **AC:** Bell icon shows unread count; click = list with deep links; mark-read persisted.

**US-9.2** As any user, I want a daily email digest of my overdue items + new warnings, so that I don't miss anything when offline from the app.
- **AC:** 07:00 WIB daily; only sends if ≥1 item; unsubscribe per category; email template ID/EN by user locale.

**US-9.3** As **DH/PM**, I want @mention in remarks to notify the mentioned user, so that comms stay in-app.
- **AC:** In-app notification + (optional) email; mention parsing supports `@firstname.lastname`.

---

### EPIC 10 — Audit Log

**US-10.1** As **AD/Security**, I want every write (create/update/delete) recorded with user, timestamp, entity, before/after, so that we can investigate disputes.
- **AC:** Tamper-evident (append-only table, hash-chained optional); searchable by user/entity/date; retention ≥1 year; exportable.

---

### EPIC 11 — Platform / Cross-Cutting

**US-11.1** As **DevOps**, I want CI/CD pipeline (lint, test, build, deploy) on every PR + main merge, so that releases are safe.
- **AC:** GitHub Actions; required checks: lint, unit, integration, build; main → staging auto-deploy; tag → prod manual approval.

**US-11.2** As **DevOps**, I want `docker-compose up` to spin web+api+db locally, so that engineers onboard in <30 min.
- **AC:** README "Quickstart" succeeds on a clean machine; seed script populates demo data.

**US-11.3** As **SRE**, I want `/healthz` + `/readyz` endpoints + structured JSON logs, so that monitoring works on day 1.
- **AC:** Health endpoint <50ms; logs include trace-id, user-id, request-id.

---

## 4. Task Breakdown & 12-Week Milestone Plan

### Capacity model
- 1 PM, 1 Designer, 3 Fullstack, 1 Mobile, 1 QA, 1 DevOps. ~5 build engineers × 12 wks × 5 days × 0.7 productive = **210 dev-days**. Mobile single-threaded → critical path risk.

### Week-by-week plan

| Week | Theme | Key Deliverables (DoD) | Owner roles |
|---|---|---|---|
| **W1** | Foundation | Repo scaffold, CI, Docker compose, Prisma schema v0.1, design system tokens, persona journey maps | DevOps, BE, Designer |
| **W2** | Foundation | Auth (US-1.1/1.2/1.3), RBAC matrix wired, audit log skeleton (US-10.1), seed users, login UI | BE, FE, Sec |
| **W3** | Core entities + import | Order/SO/SOW/Site CRUD APIs (US-2.1/2.2/2.3/3.1/3.2), Vendor master (US-5.1) | BE, FE |
| **W4** | Core entities + import | Excel importer v1 (US-2.4) on real "Draft Dashboard.xlsx", validation report, dry-run mode | BE, Data, QA |
| **W5** | Core entities + import | Excel exporter (US-2.5), site assignment to field user (US-5.3), basic list/detail UI for PM | BE, FE, Designer |
| **W6** | Milestone engine + dashboards | Milestone template + auto-spawn (US-4.1), update API (US-4.2), Progress % (US-4.3), GAP-day (US-4.4), Warning rules (US-4.5), domain events (US-4.6). **Conflict policy frozen for mobile.** | BE, QA |
| **W7** | Milestone engine + dashboards | BOD dashboard (US-6.1), DH funnel (US-6.2), pagination/filters (US-6.4) | FE, Designer, BE |
| **W8** | Milestone engine + dashboards | PM project workspace (US-6.3), revenue claim view (US-8.1/8.2), CAPEX view (US-8.3), notifications in-app (US-9.1) | FE, BE, Designer |
| **W9** | Mobile + offline sync | Mobile shell + login + assigned sites cache (US-7.1), milestone update offline queue (US-7.2), photo+geotag (US-7.3) | Mobile, BE |
| **W10** | Mobile + offline sync | Background sync + conflict resolution (US-7.4), check-in (US-7.5), i18n ID/EN (US-7.6/F20), email digest (US-9.2). **Pilot data migrated for UAT.** | Mobile, BE, Data |
| **W11** | Hardening | Security review fixes, perf tuning (P95<500ms), accessibility pass, full regression, audit log export, docs draft | All + Sec |
| **W12** | UAT + launch | UAT with PMs + 1 mitra crew, defect burndown, Go/No-Go, prod deploy, hyper-care plan, Gate 1 review | All |

### Critical Path
**Auth (W2) → Entities (W3) → Importer (W4) → Milestone engine (W6) → Mobile sync (W9–W10) → UAT (W12).** Any slippage on Importer (W4) or Mobile sync (W9–W10) directly slips launch. Mobile is the longest single-thread (1 engineer); must start partial scaffolding in W7 in parallel.

### Definition of Done (per story)
- Code reviewed + merged to main
- Unit + integration tests passing (≥70% coverage on new code)
- API documented (OpenAPI)
- RBAC enforcement test included
- Audit log entry (if write)
- i18n strings (ID/EN) added
- QA sign-off on AC
- Designer sign-off on UI parity (where applicable)

---

## 5. Delivery Timeline & Trade-offs

### Risks to schedule / quality / scope
| # | Risk | Likelihood | Schedule Impact | Mitigation |
|---|---|---|---|---|
| D1 | Excel importer underestimates messiness of real workbook | High | +1–2 wks on W4 | Get real file in W1; spike importer in W2 in parallel; reserve W11 buffer |
| D2 | Mobile offline sync conflict edge cases | High | +1 wk on W10 | Freeze conflict policy at W6; integration tests from W9; designate BE pair partner for mobile |
| D3 | Single mobile engineer = bus factor 1 | Medium | +1–2 wks if absent | Cross-train 1 fullstack on RN basics from W7 |
| D4 | RBAC field-level rules ballooning | Medium | +0.5 wk | Lock matrix at W2; treat any extension as Phase 2 |
| D5 | UAT defects from 6 personas overwhelm W11 | Medium | +0.5–1 wk | Run "soft UAT" with PM + DH champion in W10 |
| D6 | Designer is single-threaded across web + mobile + email | Medium | quality | Component library reuse; mobile uses mostly web tokens |
| D7 | Stakeholder open questions unresolved (delay def, RaR formula) | High | rework | PM to drive sign-off by end of W2 (see §5.B) |

### Trade-off options if W12 is at risk
| Option | What is cut/delayed | Impact |
|---|---|---|
| **A — Cut CAPEX view (US-8.3)** | Defer to W13 | Low — Finance can use Excel export 1 cycle |
| **B — Cut email digest (US-9.2)** | In-app only at launch | Low — adoption risk on PMs not in-app daily |
| **C — Ship mobile as PWA, RN in Phase 2** | Lose true offline robustness | High — contradicts "offline-first non-negotiable"; **NOT recommended** |
| **D — Reduce pilot scope to 1 dept (not full BU)** | Smaller migration set | Medium — slower learning, but on-time launch preserved |
| **E — Drop @mention in remarks (US-9.3)** | Defer | Negligible |

**Recommended cut order if needed:** E → A → B → D. Never C.

### Recommended delivery plan
Stick to the 12-week plan with **Option D (reduced pilot scope)** held in reserve. Lock Gate 1 review for end of W12. Hyper-care = 2 weeks post-launch (W13–W14) before Phase 2 starts in earnest at W15.

---

## 6. Collaboration Plan

### Inputs needed from System Analyst (Stage 3)
- Confirmed entity-relationship diagram for Order/SO/SOW/Site/Segment/Milestone/Vendor/Claim — including field-by-field mapping from "Draft Dashboard.xlsx".
- State machine for milestone status (Not Started → In Progress → Done/Blocked) and claim status (Pending → Submitted → Paid).
- RBAC matrix at the field-level (per role × per field × read/write).
- API contract for the milestone engine events.
- Conflict resolution rules for mobile sync (server-wins + field-level append-only photos) — formalized.
- Domain glossary in ID/EN to lock taxonomy (R5 mitigation).

### Inputs needed from other agents
- **UI/UX (4):** Persona journey maps, hi-fi for BOD/DH/PM dashboards, mobile field-app flow (offline indicator, sync state, check-in), design tokens for ID/EN, component library, accessibility checklist.
- **Data (5):** Migration mapping spec from "Draft Dashboard.xlsx" (every column → every entity field), validation rules, master-data sources (customer, vendor, PIC), seed dataset for dev/UAT.
- **Coder (6):** Adherence to the 12-week plan; spike importer in W2.
- **QA (7):** Test plan covering RBAC matrix, importer fuzz tests, milestone engine truth tables, mobile offline scenarios (airplane mode, partial sync, conflict), perf P95.
- **Security (9):** Threat model, JWT/refresh hardening review, RBAC enforcement audit, audit-log integrity, photo/geotag PII review, PDP posture for pilot.
- **DevOps (10):** Environments (dev/staging/prod), CI/CD, secrets mgmt, backup/restore for Postgres, object storage for photos, monitoring/alerting baseline.

### Decision Log — items requiring leadership / sponsor sign-off (target: end of W2)
| # | Decision | Recommended Default | Owner |
|---|---|---|---|
| L1 | Pilot BU = Enterprise BU | Confirm | Exec sponsor |
| L2 | Mobile stack = React Native + Expo | Confirm (offline-first) | CTO + PM |
| L3 | Mitra external login deferred to Phase 2 | Confirm | Security + Sponsor |
| L4 | Notifications MVP = in-app + email (no WhatsApp) | Confirm | Sponsor |
| L5 | "Delay" definition = milestone overdue >3d OR GAP-to-RFS >7d | Confirm | DH council |
| L6 | "Revenue at Risk" = Σ(OTC+MRC) of SOWs flagged Delay or At-Risk | Confirm | Finance + BOD |
| L7 | Master data ownership = Admin role per BU | Confirm | Operations |
| L8 | Data residency = local-region cloud (Indonesia) | Confirm | Security + Legal |
| L9 | ERP target for Phase 2 integration | TBD | Finance |
| L10 | Excel parallel run = 1 cycle (4 weeks post-launch) | Confirm | Sponsor |

---

## 7. Release Plan

### MVP — W12 (cutover in pilot BU)
- All Must features (F1–F22) live.
- Pilot data migrated; Excel kept read-only as parachute for 1 cycle.
- Hyper-care W13–W14: daily standup, defect SLA <24h for Sev1.

### Phase 2 — W13–W20 (Months 4–6)
- F23 WhatsApp notifications
- F24 External Mitra portal + MFA
- F25 ERP claim trigger + CAPEX actuals
- F26 Map view
- F27 Document mgmt
- F28 Vendor scorecards + bottleneck heatmap
- Phase 2 Gate: claim cycle −15%, mitra adoption ≥40%, ERP integration live.

### Phase 3 — W21+ (Months 7–12)
- F29 Predictive delay scoring
- F30 Multi-tenant
- F31 OSS integration
- F32 Customer-facing status portal
- F33 SLA mgmt + auto revenue-at-risk reporting

---

## 8. KPIs & Success Metrics

| KPI | Definition | MVP Target (end W12+4) | Phase 2 Target | Source |
|---|---|---|---|---|
| **PM weekly active usage** | Distinct PM users with ≥1 write/week ÷ total PMs | ≥70% | ≥90% | App analytics |
| **Field/Mitra weekly active usage** | Distinct field users syncing ≥1 update/week ÷ total assigned | ≥40% | ≥70% | Mobile analytics |
| **Time-to-publish status** | Median time from event (e.g., MOS done) → visible on dashboard | <1h | <5min | Event timestamp vs sync timestamp |
| **% projects flagged Delay** | At-Risk + Delay ÷ active projects | Measured + trending | −20% vs MVP baseline | Engine output |
| **Claim cycle days** | Median days from RFS-actual → claim Submitted | Measured baseline | −15% (Ph2), −30% (Ph2 end) | Claim entity |
| **CAPEX realization variance** | abs(Actual − Budget) / Budget per SO | Tracked weekly | ±5% | CAPEX view |
| **Data quality** | % of mandatory fields blank across active records | <10% | <3% | DQ scorecard job |
| **Excel decommission** | Pilot BU using Excel for status updates | 0 (after parallel run) | 0 | Survey + audit |
| **App availability** | Monthly uptime | ≥99.5% | ≥99.9% | Monitoring |
| **P95 dashboard load** | Server-side query time | <500ms | <300ms | APM |

---

## 9. Risks & Mitigations (Delivery-Focused)

(See vision §4 for product risks; below are PM/delivery risks.)

| # | Risk | Imp | Lik | Mitigation | Owner |
|---|---|---|---|---|---|
| PM-R1 | Importer scope blowout (D1) | H | H | W2 spike on real workbook; field-level validation; W11 buffer | PM + Data |
| PM-R2 | Mobile single-threaded (D2/D3) | H | M | Cross-train 1 fullstack on RN; pair on sync from W9 | PM + Eng Mgr |
| PM-R3 | Stakeholder open Qs unresolved (D7) | H | H | Decision log §6.B; force sign-off W2 | PM + Sponsor |
| PM-R4 | Designer bandwidth (D6) | M | H | Component reuse; lock visual scope at W3 | PM + Designer |
| PM-R5 | RBAC scope creep (D4) | M | M | Lock matrix W2; field-level changes = Phase 2 | PM + Security |
| PM-R6 | UAT defect surge (D5) | M | M | Soft-UAT in W10 with champions; defect SLA pre-agreed | PM + QA |
| PM-R7 | Change management — Excel attachment | H | H | Per-persona champions; preserve naming; exec mandate; "Excel for 1 cycle" parachute | PM + Sponsor |
| PM-R8 | Data residency / PDP late surprise | M | M | Confirm L8 in W2; staging in ID region from W1 | PM + Security |

---

## 10. Handoff

**Inputs consumed**
- `c:\Users\soega\Project BAru\run\20260420_Enterprise_Project_Delivery_Dashboard\.artifacts\01-creator-vision.md`
- Constraints from session: Next.js 14 / RN+Expo / Fastify+TS / PostgreSQL+Prisma / JWT; team capacity (1 PM, 1 Designer, 3 FS, 1 Mobile, 1 QA, 1 DevOps); 12-week MVP; offline-first mobile; Excel migration mandatory.

**Outputs produced**
- `c:\Users\soega\Project BAru\run\20260420_Enterprise_Project_Delivery_Dashboard\.artifacts\02-pm-roadmap.md` (this document).

**Open questions for System Analyst (Stage 3)**
1. Confirm full ER diagram and field-by-field mapping from "Draft Dashboard.xlsx" — especially ambiguous columns (free-text status, merged headers).
2. Formalize milestone weight set (default suggestion: STIP2/4=5, STIP10=5, Design=10, Procurement=15, KOM=5, Material=15, Installation=25, RFS=20). Needs DH validation.
3. Define exact conflict-resolution rules for mobile sync (server-wins on status; what about photo dedup and remark merge?).
4. Specify domain events schema (`MilestoneUpdated`, `WarningRaised`, `RfsAchieved`) for notification + dashboard cache.
5. Lock state machines (milestone, claim) and transition guards.
6. Field-level RBAC matrix — produce as a single source-of-truth table.
7. Performance NFRs at pilot scale (400 sites × 8 milestones × ~12 months history) — index strategy.
8. Audit log integrity model — hash-chain or DB-only append-only?
9. i18n key strategy and translation governance (who owns ID translations).
10. Timezone handling — assume Asia/Jakarta server-side; confirm display + storage convention.

**Decisions required from sponsor by end of W2** — see §6 Decision Log (L1–L10).

**Go/No-Go Recommendation: GO.**
The MVP scope is achievable within the 12-week window and 5-engineer build capacity, with the importer (W4) and mobile offline sync (W9–W10) as the two critical-path watch items. Reserve trade-off Option D (reduce pilot to a single dept) as the schedule safety valve. **System Analyst is cleared to proceed to Stage 3.**
