# 01 — Creator Vision: Enterprise Project Delivery Monitoring Dashboard

**Product Name (working):** **DeliverIQ** — Enterprise Project Delivery Monitoring Dashboard
**One-line Value Proposition:** *A single, real-time source of truth that turns a fragile multi-team Excel tracker into a role-aware web + mobile control tower for enterprise telecom project delivery — from PO to RFS to revenue claim.*

---

## 1. Product Vision

### Problem Statement
Enterprise project delivery in the organization is currently coordinated through a shared spreadsheet ("Draft Dashboard.xlsx") spanning six teams (Enterprise, Pre Sales, TEL, Project, System Automation, Project/Mitra). The file mixes commercial data (PO/SO/SOW, OTC/MRC revenue, CAPEX), site inventory (NE/FE, geo coordinates), engineering milestones (STIP 2/4, STIP 10, Design, Procurement), field execution (vendor SPK/PO, MOS, installation, RFS) and status flags. The result:

- No real-time visibility — status is whatever was last typed into a cell.
- No drill-down path from BOD KPIs down to a specific site milestone.
- Field/mitra updates arrive late, by chat or email, and are re-keyed.
- GAP-day-to-RFS and delay warnings are computed manually and inconsistently.
- Revenue claim (OTC/MRC) and CAPEX realization are disconnected from delivery state.
- Concurrent editing, version drift, and access-control gaps create data integrity and audit risk.

### Vision Statement
Become the **delivery operating system** for enterprise project execution in Indonesia — every order, SO, SOW, site, milestone, vendor activity and claim is captured once, updated from where the work happens (including the field, offline), and rolled up instantly into the view each role needs to act.

### Value Proposition
- **For BOD/Execs:** Trustworthy portfolio KPIs (revenue at risk, on-track %, CAPEX burn, monthly RFS achievement) refreshed in minutes, not weeks.
- **For Dept Heads:** Bottleneck visibility across STIP, Design, Procurement, KOM, MOS, Installation, RFS.
- **For PMs:** One screen per project with timeline, vendor and site execution.
- **For Field/Mitra:** A mobile-first, offline-capable update flow with photo evidence and geotag.
- **For Finance:** Delivery-linked revenue claim and CAPEX realization tracking.

### Strategic Goals
1. Replace the Excel tracker as the authoritative system within 12 weeks (MVP).
2. Reduce average delay (Plan vs Actual RFS) by ≥20% within 6 months of rollout.
3. Cut OTC/MRC claim cycle time by ≥30% through delivery-linked claim triggers.
4. Achieve ≥80% weekly active usage by PMs and ≥60% by field/mitra users in Phase 2.

---

## 2. Business Requirements

### Core Business Objectives
- Establish a single source of truth for end-to-end enterprise delivery (Order → SO → SOW → Site → Milestones → RFS → Handover → Claim).
- Improve on-time RFS achievement and reduce revenue at risk.
- Accelerate revenue recognition by tying claim eligibility to delivery milestones.
- Improve governance, auditability, and role-based access across six teams.

### User / Customer Requirements
- Role-based dashboards for BOD, Dept Heads, PMs, Field/Mitra, Finance.
- Drill-down navigation: Portfolio → Department → Program → SO → SOW → Site → Milestone.
- Mobile field app with offline capture, photo + geotag evidence, and sync.
- Automated GAP-day-to-RFS and warning flags (On Track / Delay).
- Vendor/Mitra collaboration with PIC contact, SPK/PO dates, material and installation tracking.
- Excel import for initial migration; export for ad-hoc reporting.

### Success Metrics (Business-Facing KPIs)
| KPI | Baseline (Excel) | Target (Phase 1) | Target (Phase 2) |
|---|---|---|---|
| Time-to-publish status (event → visible on dashboard) | Days–weeks | < 1 hour | < 5 minutes |
| % projects flagged Delay vs total active | Unknown / inconsistent | Measured & trending | −20% reduction |
| OTC/MRC claim cycle (RFS → Claim submitted) | ~weeks | −15% | −30% |
| CAPEX realization variance (Budget vs Actual) | Manual | Tracked weekly | ±5% accuracy |
| Weekly active users — PMs / Field-Mitra | n/a | 70% / 40% | 90% / 70% |
| Data quality (missing mandatory fields) | High | < 10% | < 3% |

### Key Constraints & Assumptions
- Indonesia field connectivity is unreliable → **offline-first mobile is non-negotiable**.
- Existing Excel data must be migrated without loss of historical records.
- Multiple vendor/mitra organizations will need controlled external access.
- Bahasa Indonesia + English UI required.
- Must comply with Indonesian data residency and basic PDP expectations.
- Integrations with ERP/Finance and any existing OSS/inventory are likely Phase 2+.

---

## 3. Market Analysis

### Target Segments & Context
Primary internal market: enterprise services / telecom delivery organizations in Indonesia executing connectivity, FO, and managed-service projects across multi-site customer footprints. Secondary: regional system integrators and tower/managed-service mitra ecosystems with similar PO→SOW→Site→RFS lifecycles.

### Competitor / Status-Quo Landscape
- **Excel / Google Sheets (status quo):** Flexible, zero adoption cost, but no real-time roll-up, no role isolation, no mobile/offline, no audit trail.
- **JIRA / Asana / Monday:** Strong on generic task tracking; weak on telecom-specific entities (SO/SOW/Site/STIP/RFS), CAPEX/revenue, and offline field workflows.
- **Smartsheet / MS Project:** Better on Gantt & portfolio, but still desktop-centric and not domain-modeled for site delivery + vendor execution.
- **OSS/PMO suites (Ericsson Ensemble, Netcracker, custom):** Powerful but heavy, expensive, and slow to tailor to local team structures.

### Differentiation Opportunities
- **Domain-native data model** (Order/SO/SOW/Site/STIP/RFS/Claim) instead of generic tasks.
- **Role-shaped UX** per persona, not one screen for all.
- **Offline-first field mobile** purpose-built for Indonesian site conditions.
- **Delivery ↔ Finance linkage** (RFS → Claim trigger, CAPEX realization).
- **Fast Excel onboarding** — import the existing tracker on day 1.

### Go-to-Market (Strategic Level)
Internal rollout first (single business unit pilot → enterprise-wide), then potential productization for adjacent enterprise/telecom delivery organizations and mitra networks.

---

## 4. Risk Analysis

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | **Data migration** from messy Excel (inconsistent fields, merged cells, free-text status) | High | High | Dedicated import/cleanse workstream; staged migration; field-level validation; keep Excel read-only mirror for 1 cycle. |
| R2 | **Change management** — six teams used to Excel autonomy | High | High | Exec sponsorship; per-persona champions; phased cutover; preserve familiar field names/terms. |
| R3 | **Mobile adoption** by field engineers / mitra | High | Medium | Offline-first; minimal taps to update; Bahasa UI; WhatsApp-style simplicity; incentives tied to claim speed. |
| R4 | **Data quality** at source (wrong dates, blank PIC, free-text sites) | High | High | Mandatory fields, dropdowns from master data, validation rules, weekly data-quality scorecard per dept. |
| R5 | **Scope creep** (every team wants their Excel quirks) | Medium | High | Strict MVP gate; "Phase 2 backlog" parking lot; PM owns prioritization. |
| R6 | **External vendor/mitra access & security** | High | Medium | Scoped roles, per-project access, audit log, MFA for external users. |
| R7 | **Integration delays** (Finance/ERP, OSS) | Medium | Medium | MVP runs standalone; integrations scheduled in Phase 2 with clear contracts. |
| R8 | **Performance at scale** (thousands of sites, photos) | Medium | Medium | Pagination, async sync, object storage for media, indexing on SO/Site IDs. |

---

## 5. Product Scope Direction

### MVP (Weeks 1–12) — *Replace the Excel, earn trust*
- Core entity model: Order, SO, SOW, Site (NE & FE), Milestones, Vendor/Mitra activity, Status.
- Excel importer for the existing "Draft Dashboard.xlsx".
- Web dashboards for **BOD, Dept Heads, PMs** with drill-down.
- Mobile (PWA or React Native) for **Field/Mitra** with offline updates: MOS, Installation start/finish, RFS actual, photo + geotag.
- Automated GAP-day to RFS, On-Track/Delay flag, Project Warning.
- Role-based access for the six teams + Finance read-only.
- Revenue & CAPEX **visibility** (no ERP integration yet).
- Basic audit log, export to Excel.

### Phase 2 (Months 4–6) — *Optimize and integrate*
- Finance integration (claim trigger on RFS/Handover, CAPEX actuals from ERP).
- Vendor/Mitra portal (external scoped access).
- Advanced analytics: bottleneck heatmap by milestone, vendor scorecards, forecast vs actual RFS by week/month.
- Notifications (email / WhatsApp / in-app) on warnings and milestone breaches.
- Document management for SPK, PO, Handover docs.
- Map view of sites (lat/long) with status overlay.

### Phase 3 (Months 7–12) — *Scale and intelligence*
- Predictive delay risk scoring (ML on historical milestone data).
- Capacity & workload planning across teams and mitra.
- Multi-tenant / multi-BU support; productization for external customers.
- Integration with OSS/inventory and customer-facing status portal.
- SLA management and automated revenue-at-risk reporting to BOD.

### Decision Gates
- **Gate 1 (end of MVP):** ≥70% PM weekly active + Excel decommissioned in pilot BU → proceed to Phase 2.
- **Gate 2 (end of Phase 2):** Claim cycle reduced ≥15% + ERP integration live → proceed to Phase 3.
- **Gate 3 (end of Phase 3):** Productization viability assessment.

---

## 6. High-Level Feature List by Persona

### BOD / Executives
- Portfolio KPI tiles: total revenue (OTC + MRC), revenue at risk, On-Track vs Delay %, CAPEX utilization, monthly RFS plan vs actual.
- Trend charts (weekly/monthly) and department comparison.
- Drill-down to department → program → SO.

### Department Heads (Enterprise / Pre Sales / TEL / Project)
- Team workload and milestone funnel (STIP 2/4 → STIP 10 → Design → Procurement → KOM → MOS → Installation → RFS).
- Bottleneck view (avg days per stage, overdue counts).
- PIC workload distribution.

### Project Managers
- Per-project workspace: SO/SOW/site list, milestone timeline (Gantt), vendor execution, issues/remarks, documents.
- Plan vs Forecast vs Actual RFS with GAP-day.
- Action items and overdue alerts.

### Field Engineers / Mitra (Mobile)
- Daily task list per site.
- Offline update: Survey, Permit Ready, Material Ready, MOS, Installation Start/Finish, Ext FO Straightening, RFS Actual.
- Photo + geotag evidence capture.
- Background sync when online.
- Bahasa Indonesia UI.

### Finance
- Revenue claim queue (OTC, MRC) tied to RFS / Handover status.
- Budget realization view (CAPEX, % consumed, remaining) per SO.
- Vendor PO/SPK status and aging.
- Export for accounting reconciliation.

### Cross-Cutting
- Role-based access control, audit log, Excel import/export, search, notifications, map view (Phase 2).

---

## 7. Guidance to Product Manager

### Immediate PM Decisions
1. **Pilot scope:** Which BU and how many active SOs/sites for the 12-week MVP?
2. **Mobile tech path:** PWA (faster) vs React Native (richer offline) — recommend RN given field connectivity.
3. **Excel import strategy:** One-time migration vs ongoing parallel run — recommend 1-cycle parallel run.
4. **Master data ownership:** Who owns Customer, Site, Vendor, PIC master lists post-cutover?
5. **Naming & taxonomy lock-in:** Confirm canonical terms (STIP, SOW, RFS, MOS, etc.) and statuses with each team to avoid Excel-era ambiguity.
6. **Notification channels for MVP:** In-app only, or include email / WhatsApp from day 1?

### Questions Requiring Stakeholder Validation
- Definition of "Revenue at Risk" — formula and threshold?
- Definition of "Delay" — GAP-day threshold, by milestone or only RFS?
- Who can edit which fields per role (especially financial fields)?
- Is mitra access in MVP or Phase 2? (Recommend Phase 2 to reduce security scope.)
- Data residency and PDP requirements — on-prem, local cloud, or hybrid?
- Existing ERP/Finance system to integrate with in Phase 2?

### Recommended Next Strategic Checkpoints
- **Week 2:** PM roadmap + prioritized backlog signed off by exec sponsor.
- **Week 4:** System Analyst design review (entities, roles, drill-down paths).
- **Week 6:** UI/UX prototypes validated with one user from each persona.
- **Week 10:** Pilot data migrated; UAT with PMs and 1 mitra crew.
- **Week 12:** MVP go-live in pilot BU; Gate 1 review.

---

## 8. Handoff

- **Inputs consumed:**
  - User idea / problem statement for an Enterprise Project Delivery Monitoring Dashboard (web + mobile).
  - Structural context from "Draft Dashboard.xlsx" covering Orders, SO/SOW, Sites (NE/FE), Milestones (TEL), Project Team, System Automation, Project/Mitra, Status.
  - Defined personas: BOD, Department Heads, Project Managers, Field Engineers/Mitra, Finance.
- **Outputs produced:**
  - `c:\Users\soega\Project BAru\run\20260420_Enterprise_Project_Delivery_Dashboard\.artifacts\01-creator-vision.md` (this document).
- **Open questions for Product Manager:**
  1. Pilot BU and MVP data volume?
  2. Canonical definitions for "Delay" and "Revenue at Risk"?
  3. Mobile stack: PWA vs React Native?
  4. Mitra/external access in MVP or Phase 2?
  5. Notification channels for MVP (in-app, email, WhatsApp)?
  6. Target ERP/Finance system for Phase 2 integration?
  7. Data residency and PDP compliance posture?
  8. Master data ownership model post-cutover?
- **Go/No-Go Recommendation:** **GO.** Strong business pain (Excel-bound delivery tracking across six teams), clear domain model already evidenced in the spreadsheet, measurable KPIs (claim cycle, delay %, CAPEX accuracy), and a feasible 12-week MVP path. Proceed to Product Manager (Stage 2) for roadmap, prioritization, and stakeholder validation of the open questions above.
