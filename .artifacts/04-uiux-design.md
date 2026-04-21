# 04 — UI/UX Design: DeliverIQ (Enterprise Project Delivery Dashboard)

**Author:** UI/UX (Stage 4)
**Date:** 2026-04-20
**Inputs consumed:** `01-creator-vision.md`, `02-pm-roadmap.md`, `03-sa-system-design.md`
**Tech alignment:** Next.js 14 App Router (web) · React Native + Expo (mobile) · Tailwind CSS · TypeScript · i18n ID/EN.
**North Star:** *Every persona finishes their primary task in ≤3 clicks (web) or ≤3 taps (mobile), even on a slow link or offline.*

---

## 1. UX Strategy Summary

### 1.1 Primary user goals
| Persona | Primary "Job To Be Done" | Success signal |
|---|---|---|
| **BOD** | "Tell me where revenue is at risk this week" | Lands on portfolio → sees red/amber tiles → drills to dept in ≤2 clicks |
| **Dept Head (DH)** | "Where is my team stuck?" | Funnel screen highlights the bottleneck stage and overdue list |
| **Project Manager (PM)** | "Run my standup from one screen" | Project workspace shows timeline, sites, vendors, remarks, recent activity |
| **Field / Mitra (FE)** | "Update what I did today, even with no signal" | Mobile: open app → today's tasks → tap site → mark milestone + photo, all offline |
| **Finance (FN)** | "Which RFS-completed SOWs are unclaimed?" | Claim queue defaulted to PENDING + age-desc |
| **Admin (AD)** | "Onboard users + import the Excel + see the audit trail" | Import wizard, user mgmt, audit search reachable from one nav cluster |

### 1.2 Key usability principles
1. **Role-shaped home** — every persona has a default landing route; never make BOD see PM forms.
2. **Drill, never search** — left-to-right cognitive flow: Portfolio → Dept → Program → SO → SOW → Site → Milestone. Breadcrumb is always visible.
3. **Status is a color** — On Track / At Risk / Delay are the same 3 colors everywhere (tiles, pills, table rows, map pins).
4. **Trust the engine** — Progress %, GAP-day, Warning are read-only and labeled "auto-computed" so users don't try to override.
5. **Mobile = field tool, not mini-web** — bottom tabs, big targets, offline-first, photo-led.
6. **Bahasa first** — id-ID is the default; EN toggle in header. No mixed-language sentences.
7. **Friction at the right spots** — backdate >30d, RFS without Installation, claim status reversal: all require explicit confirmation.
8. **Skeleton → data → empty → error** — every list/screen has 4 deliberate states.

### 1.3 Experience priorities for MVP
- Speed of comprehension over visual richness.
- Density appropriate to persona (BOD = airy KPIs; PM = dense tables OK; mobile = 1 task per screen).
- Zero modal-on-modal stacks.
- Server pagination + filter chips (no infinite scroll on web).
- Mobile: 1-handed reach, 44 px touch targets, large bottom action bar.

### 1.4 Core assumptions
- Pilot user count ≤60 internal + ~6 mitra crews → no need for advanced search/global command palette in MVP.
- Field connectivity ranges from 4G to airplane mode → mobile must function on 0 bars.
- Photos are the dominant evidence; videos are out of MVP.
- Color is reinforced with shape/icon (accessibility + B/W printability of exports).

---

## 2. Information Architecture

### 2.1 Web (Next.js App Router) — route map

```
/(auth)
  /login
  /reset-password
  /reset-password/confirm

/(app)                         ← protected shell (sidebar + header)
  /                            ← role-router redirect:
                                  AD → /admin/users
                                  BOD → /portfolio
                                  DH  → /dept
                                  PM  → /projects
                                  FN  → /finance/claims

  /portfolio                   ← BOD
    /portfolio/dept/[deptId]   ← drilldown

  /dept                        ← DH dashboard (own dept default)
    /dept/[deptId]/funnel
    /dept/[deptId]/bottlenecks
    /dept/[deptId]/overdue

  /programs                    ← Order list
    /programs/[orderId]        ← Order detail (SO list)

  /projects                    ← PM list (SOWs)
    /projects/[sowId]          ← Project workspace
      /projects/[sowId]/overview
      /projects/[sowId]/timeline
      /projects/[sowId]/sites
      /projects/[sowId]/sites/[siteId]
      /projects/[sowId]/vendors
      /projects/[sowId]/remarks
      /projects/[sowId]/activity

  /finance
    /finance/claims
    /finance/claims/[claimId]
    /finance/capex
    /finance/capex/[soId]

  /admin
    /admin/users
    /admin/vendors
    /admin/imports
    /admin/imports/[importId]
    /admin/audit

  /notifications               ← bell drawer also available globally
  /settings                    ← profile, language, password
```

### 2.2 Mobile (Expo) — stack + tab map

```
RootStack
 ├─ AuthStack
 │   ├─ Login
 │   └─ ForgotPassword
 └─ AppTabs (bottom tab bar, 4 tabs)
     ├─ Tab: Hari Ini / Today      → TodayScreen
     │      └─ SiteDetailScreen
     │           └─ MilestoneUpdateScreen
     │                └─ PhotoCaptureScreen
     ├─ Tab: Sites                 → SiteListScreen (assigned)
     │      └─ SiteDetailScreen
     ├─ Tab: Sync                  → SyncStatusScreen (queue + conflicts)
     └─ Tab: Saya / Me             → ProfileScreen, LanguageToggle, Logout
   Modal: NotificationsScreen      (from bell icon in header)
   Modal: ConflictResolveScreen    (when push rejected stale)
```

### 2.3 Navigation patterns

**Web — left sidebar (collapsible at <1280px), top header:**
```
┌──────────┬──────────────────────────────────────────────────┐
│  Logo    │  Breadcrumb            🔍 Search    🌐 ID|EN  🔔 👤│
├──────────┼──────────────────────────────────────────────────┤
│ ▸Home    │                                                  │
│ ▸Portf.  │              Page content                        │
│ ▸Dept    │                                                  │
│ ▸Programs│                                                  │
│ ▸Projects│                                                  │
│ ▸Finance │                                                  │
│ ▸Admin   │                                                  │
│          │                                                  │
│  ⓘ Help  │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```
Sidebar items are filtered by role (RBAC-aware). Active route = primary color left border + bold label.

**Mobile — bottom tabs:**
```
┌────────────────────────────────────┐
│ ← Hari Ini                  🔔  ⚙ │  ← header (back if not root)
├────────────────────────────────────┤
│                                    │
│         screen content             │
│                                    │
├────────────────────────────────────┤
│  ◐ Hari Ini  ◉ Sites  ⇅ Sync  👤  │  ← bottom tab bar (44px+)
└────────────────────────────────────┘
```
Persistent **offline banner** appears above tabs when `netinfo.isConnected === false`.

---

## 3. Persona-Driven User Journeys

### 3.1 BOD — "Weekly portfolio review"
1. Login → auto-redirect `/portfolio`.
2. Scan 6 KPI tiles (Total Revenue, Revenue at Risk, On-Track %, CAPEX % consumed, Monthly RFS Plan vs Actual, Overdue Count).
3. Eye drawn to red "Revenue at Risk" tile → click → Dept breakdown table.
4. Click worst dept → Dept funnel.
5. Click "DELAY (12)" badge in Installation stage → overdue SOW list.
6. Click a SOW → enters PM workspace **read-only mode** (banner: "Anda dalam mode lihat-saja").
7. Optional: export current view → email to exec assistant.

**Edge cases:** No data this week (empty state with last-refreshed timestamp); cache stale (subtle yellow "Updated 5m ago"); no permission to a dept (403 → friendly screen).

### 3.2 Dept Head — "Find this week's bottleneck"
1. Login → `/dept` (own dept by default).
2. Funnel chart shows counts at each milestone stage with avg days-in-stage.
3. Tallest red bar = bottleneck → click stage → overdue list filtered to that stage.
4. Bulk select rows → "Assign to PM" or "Notify PM" action.
5. Approve any pending backdate requests from inbox tile.

### 3.3 PM — "Run standup from one screen"
1. Login → `/projects` list (own SOWs, sorted by GAP-day desc).
2. Click most-at-risk SOW → `/projects/{sowId}/overview`.
3. Tab through: Timeline → Sites → Vendors → Remarks → Activity.
4. Update a milestone via inline modal (status, actual date, remark, photo URL).
5. @mention `@andi.pratama` in remark → in-app + email notification.
6. Export project to Excel for the customer.

### 3.4 Field / Mitra — "Update MOS at site, no signal"
1. Open mobile app (already logged in).
2. **Today** tab shows 3 site cards for today.
3. Tap site → SiteDetail → milestone list.
4. Tap "MOS" → MilestoneUpdate sheet → toggle status `IN_PROGRESS → DONE` → set actual date (default today) → write 1-line remark.
5. Tap **Camera** → take photo → auto geotag + timestamp captured → preview → confirm.
6. Tap **Save**. Banner: *"Tersimpan offline. Akan tersinkron saat online."* with badge `1 pending`.
7. Walk back to van → 4G returns → silent background sync → toast: *"3 update tersinkron."*
8. If conflict: Sync tab shows red badge → tap → ConflictResolve screen → choose `Keep server` / `Resubmit mine` / `Discard`.

### 3.5 Finance — "Clear claim queue"
1. Login → `/finance/claims` (default filter `status=PENDING`, sort `age desc`).
2. See aging chips on each row (e.g., "12 hari sejak RFS").
3. Click claim → side panel → fill `submittedDate`, `invoiceNumber` → state moves to SUBMITTED.
4. Later, fill `paidDate` → PAID. Audit log records who/when.
5. Switch to `/finance/capex` to enter monthly actuals per SO.

---

## 4. Wireframe Package

Notation: `[ ]` = button · `▢` = input · `●○○` = stepper · `▮▮▯` = progress bar · `▲▼` = sort · `…` = overflow.

### 4.1 WEB — Login (`/login`)
```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│              ╭──────────────────────────╮                  │
│              │   DeliverIQ              │                  │
│              │   Masuk ke akun Anda     │                  │
│              │                          │                  │
│              │  Email                   │                  │
│              │  ▢ ____________________  │                  │
│              │  Password                │                  │
│              │  ▢ ____________________  │                  │
│              │  ☐ Ingat saya            │                  │
│              │  [   MASUK            ]  │                  │
│              │  Lupa password?          │                  │
│              │                          │                  │
│              │  🌐 ID | EN              │                  │
│              ╰──────────────────────────╯                  │
└────────────────────────────────────────────────────────────┘
```
- Single-column, centered card, max-w 400px.
- After 5 failures shows lockout countdown.
- Inline error states under each field (red text + icon).

### 4.2 WEB — BOD Executive Dashboard (`/portfolio`)
```
Breadcrumb: Portfolio
┌──────────────────────────────────────────────────────────────────────┐
│  Portfolio Overview              Period: [Apr 2026 ▾]  [Export ⤓]   │
├──────────────────────────────────────────────────────────────────────┤
│ ┌─KPI─┐ ┌─KPI─┐ ┌─KPI─┐ ┌─KPI─┐ ┌─KPI─┐ ┌─KPI─┐                    │
│ │Total│ │Rev. │ │On   │ │CAPEX│ │RFS  │ │Over │                    │
│ │Rev. │ │@Risk│ │Track│ │ %   │ │M-T-D│ │due  │                    │
│ │1.2T │ │ 84B │ │ 78% │ │ 62% │ │24/30│ │ 17  │                    │
│ │ ↑5% │ │ ↑12%│ │ ↓3% │ │ ↑1% │ │ -6  │ │ ↑4  │                    │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                    │
├──────────────────────────────────────────────────────────────────────┤
│  Department Heatmap                          Status Distribution     │
│ ┌─────────────────────────────┐ ┌────────────────────────────────┐ │
│ │ Dept ▾  │ On │ Risk│ Delay│ │ │   ████████ On Track 78%        │ │
│ │ Enter.  │ 42 │  9  │  4   │ │ │   ██▌ At Risk 14%              │ │
│ │ TEL     │ 28 │  6  │  7   │ │ │   █  Delay 8%                  │ │
│ │ Project │ 35 │  4  │  2   │ │ │                                │ │
│ │ PreSales│ 18 │  2  │  1   │ │ └────────────────────────────────┘ │
│ └─────────────────────────────┘                                     │
├──────────────────────────────────────────────────────────────────────┤
│  RFS Plan vs Actual (last 6 months)                                  │
│  ┌──────────────────────────────────────────────────────┐           │
│  │   ▆▇  Plan    ▃▄  Actual                             │           │
│  │   bar chart                                           │           │
│  └──────────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────┘
```
- Cards clickable → drill down.
- Heatmap cells colored by status; click cell → filtered SOW list.
- Last refreshed timestamp in header right.

### 4.3 WEB — Department Drilldown (`/dept/[deptId]/funnel`)
```
Breadcrumb: Portfolio › Department: TEL
┌──────────────────────────────────────────────────────────────────────┐
│ Filters: [Customer ▾] [Vendor ▾] [Date ▾] [Status ▾]   [Reset]      │
├──────────────────────────────────────────────────────────────────────┤
│ Milestone Funnel — TEL                                               │
│                                                                      │
│ STIP 2/4   ████████████████████████  120  avg 4d                     │
│ STIP 10    ███████████████████       110  avg 3d                     │
│ Design     █████████████████         102  avg 7d  ⚠ 12 overdue       │
│ Procurement███████████               92   avg 14d ⚠ 18 overdue ◀──── │ click
│ KOM        █████████                 81   avg 5d                     │
│ Material   ███████                   72   avg 10d                    │
│ MOS        █████                     60   avg 4d                     │
│ Install    ████                      48   avg 21d ⚠ 9 overdue        │
│ RFS        ██                        32   avg 6d                     │
├──────────────────────────────────────────────────────────────────────┤
│ Bottleneck Detail — Procurement (18 overdue)        [Export ⤓]      │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ ☐ │ SOW # ▲▼ │ Customer ▲▼ │ Plan RFS ▲▼ │ GAP ▲▼ │ Status ▲▼ │ ││
│ │ ☐ │ SOW-118  │ PT Adi      │ 02 May      │ +12 d  │ ● DELAY   │ ││
│ │ ☐ │ SOW-077  │ PT Sinar    │ 15 May      │ +5 d   │ ◐ AT RISK │ ││
│ │ ...                                                              ││
│ │ [ Bulk: Notify PM ]  [ Bulk: Assign... ]                        ││
│ └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### 4.4 WEB — Program / Order list & Order detail (`/programs`, `/programs/[orderId]`)
```
Programs (Orders)
┌──────────────────────────────────────────────────────────────────────┐
│ [+ New Order]   Filters: [Customer] [PIC] [Status]                  │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ Order # │ Customer │ Contract │ OTC  │ MRC  │ CAPEX │ # SOW │ St ││
│ │ ORD-201 │ PT Adi   │ 12.5B    │ 7.2B │ 0.4B │ 3.1B  │  14   │ ● ││
│ │ ORD-202 │ PT Sinar │  8.1B    │ 5.0B │ 0.2B │ 2.0B  │   8   │ ◐ ││
│ └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘

Order Detail — ORD-201 (PT Adi)
┌──────────────────────────────────────────────────────────────────────┐
│ Header: Customer · Contract · OTC · MRC · CAPEX · PIC · Dates       │
├──────────────────────────────────────────────────────────────────────┤
│ SO / SOW Tree                                            [+ Add SO] │
│ ▾ SO-201-01  PIC: Andi  Plan: 01-Apr → 30-Jun       Progress 68% ◐  │
│   ▾ SOW-001  Site: JKT-NE-12 ↔ JKT-FE-44  Vendor: PT Mitra  72% ●  │
│   ▾ SOW-002  Site: BDG-NE-03 ↔ BDG-FE-21  Vendor: PT Mitra  41% ◐  │
│ ▸ SO-201-02  PIC: Rina  Plan: 15-Apr → 15-Jul       Progress 22% ◐  │
└──────────────────────────────────────────────────────────────────────┘
```
- Tree expandable; each node shows progress pill + status pill.
- Click SOW → `/projects/{sowId}/overview`.

### 4.5 WEB — Order detail with SO/SOW tree (above) + financial summary side panel
```
                                               ┌────────── Side Panel ─────────┐
                                               │ Financial Summary             │
                                               │ Contract  : Rp 12.5B          │
                                               │ OTC       : Rp  7.2B          │
                                               │ MRC/mo    : Rp  0.4B          │
                                               │ CAPEX bdg : Rp  3.1B          │
                                               │ CAPEX act : Rp  1.9B (61%)    │
                                               │ Claim Pdg : Rp  0.5B (3 SOW)  │
                                               │ Rev@Risk  : Rp  0.8B          │
                                               │ ──────────────────────────    │
                                               │ [Open Finance View →]         │
                                               └───────────────────────────────┘
```

### 4.6 WEB — Site Detail with Milestone Timeline (`/projects/[sowId]/sites/[siteId]`)
```
Breadcrumb: Projects › SOW-001 › Site JKT-NE-12
┌──────────────────────────────────────────────────────────────────────┐
│ Site JKT-NE-12   Type: NE   Lat -6.21, Lng 106.85   📍 [Map]        │
│ Address: Jl. Sudirman 22, Jakarta                                   │
│ Field user: @budi.santoso        [Reassign...]                      │
├──────────────────────────────────────────────────────────────────────┤
│ Milestone Timeline (plan vs actual)                                  │
│                                                                      │
│ STIP 2/4    ●─Done────────── plan 01-Apr  act 02-Apr  +1d            │
│ STIP 10     ●─Done────────── plan 05-Apr  act 04-Apr  -1d            │
│ Design      ●─Done────────── plan 12-Apr  act 13-Apr  +1d            │
│ Procurement ◐─In Progress──  plan 22-Apr  ⚠ today +3d                │
│ KOM         ○─Not Started─   plan 28-Apr                             │
│ Material    ○─Not Started─   plan 05-May                             │
│ MOS         ○─Not Started─   plan 10-May                             │
│ Install     ○─Not Started─   plan 12-May                             │
│ RFS         ○─Not Started─   plan 25-May    ⚠ DELAY                  │
├──────────────────────────────────────────────────────────────────────┤
│ Photos (8)                                                           │
│ [thumb] [thumb] [thumb] [thumb] [thumb] [thumb] [thumb] [thumb]      │
├──────────────────────────────────────────────────────────────────────┤
│ Recent Activity                                                      │
│ • Andi updated Procurement → IN_PROGRESS (2h ago)                    │
│ • Budi attached photo to Design (yesterday)                          │
└──────────────────────────────────────────────────────────────────────┘
```
- Timeline rows are a `<MilestoneStepper>` component — click any row → opens MilestoneUpdate modal.

### 4.7 WEB — Milestone Update Modal
```
┌─────────── Update Milestone — Procurement ───────────┐
│ Site: JKT-NE-12        SOW: SOW-001                  │
│                                                      │
│ Status:                                              │
│   ○ Not Started   ◉ In Progress   ○ Done   ○ Blocked│
│                                                      │
│ Plan date:    22-Apr-2026   (read-only)              │
│ Actual date:  ▢ [ 23-Apr-2026 📅 ]                   │
│   (required jika status = Done)                      │
│                                                      │
│ Remark (opsional):                                   │
│ ▢ ┌──────────────────────────────────────────────┐  │
│   │ Material delivered, awaiting QC              │  │
│   └──────────────────────────────────────────────┘  │
│                                                      │
│ Attach photo: [📷 Upload]   [no file selected]       │
│                                                      │
│ ⚠ Backdating > 30 days requires DH approval.         │
│                                                      │
│              [ Batal ]   [ Simpan ]                  │
└──────────────────────────────────────────────────────┘
```

### 4.8 WEB — Vendor List (`/admin/vendors`)
```
Vendors                                       [+ Add Vendor]
┌──────────────────────────────────────────────────────────────────────┐
│ Search ▢ ___________   Filter: [Active ▾]                           │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ Name ▲▼      │ PIC          │ Contact      │ # SOW │ Active │ … ││
│ │ PT Mitra Jaya│ Pak Budi     │ +62 812-...  │  18   │  ●     │ ⋮ ││
│ │ PT Karya     │ Bu Sari      │ +62 813-...  │   7   │  ●     │ ⋮ ││
│ └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### 4.9 WEB — Excel Import Wizard (`/admin/imports`)
```
Step 1 of 4 — Upload                                                  ●○○○
┌──────────────────────────────────────────────────────────────────────┐
│  Drop "Draft Dashboard.xlsx" here                                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │             ⤓                                                │   │
│  │      Drag & drop file or [Browse...]                         │   │
│  │      Max 25 MB · .xlsx only                                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  [ Cancel ]                                          [ Next → ]      │
└──────────────────────────────────────────────────────────────────────┘

Step 2 — Parsing                                                      ●●○○
   ▮▮▮▮▮▯▯▯  62%  parsing sheet "Sites"...

Step 3 — Validation Report                                            ●●●○
┌──────────────────────────────────────────────────────────────────────┐
│ Summary: 1,204 rows · 1,178 valid · 26 errors · 8 warnings          │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ Sheet      │ Row │ Field         │ Severity │ Message           ││
│ │ Sites      │  47 │ lat           │ ERROR    │ out of ID range   ││
│ │ Milestones │ 219 │ planDate      │ WARN     │ before SO start   ││
│ │ ...                                                              ││
│ └──────────────────────────────────────────────────────────────────┘│
│ ☐ I have reviewed errors and want to commit valid rows only         │
│ [ Download report ⤓ ]    [← Back ]   [ Dry-run ]   [ Commit → ]     │
└──────────────────────────────────────────────────────────────────────┘

Step 4 — Done                                                         ●●●●
   ✓ Imported 1,178 rows.  Batch ID: imp_20260420_001
   [ Open Audit Log ]    [ Rollback (within 24h) ]
```

### 4.10 WEB — Revenue Claim Queue (`/finance/claims`)
```
Claims                                            [Export ⤓]
┌──────────────────────────────────────────────────────────────────────┐
│ Tabs: [ Pending (18) ] [ Submitted (7) ] [ Paid (42) ] [ All ]      │
│ Filters: [Customer ▾] [Type OTC|MRC ▾] [Age ▾]                      │
├──────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ ☐│Claim# │SOW    │Customer│Type│Amount │RFS Date │Age │Status ▲▼││
│ │ ☐│CLM-19 │SOW-001│PT Adi  │OTC │2.1B   │02-Apr   │18d │● Pdg   ││
│ │ ☐│CLM-20 │SOW-002│PT Adi  │MRC │0.04B  │05-Apr   │15d │● Pdg   ││
│ └──────────────────────────────────────────────────────────────────┘│
│ Side panel (on row click):                                           │
│   Update status → [Submitted] [Paid]                                 │
│   Submitted date  ▢                                                  │
│   Invoice #       ▢                                                  │
│   Paid date       ▢                                                  │
│   [ Save ]                                                           │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.11 WEB — Notifications (`/notifications` and bell drawer)
```
Bell drawer (slide-in from right, 400 px wide):
┌────────────────────────────────────┐
│ Notifikasi                ✕        │
│ [ Semua ] [ Belum dibaca (5) ]    │
├────────────────────────────────────┤
│ ⚠ SOW-118 raised to DELAY  • 5m   │
│   Bottleneck: Procurement         │
│   [ Buka project → ]              │
├────────────────────────────────────┤
│ 🔔 @anda di remark SOW-077  • 1h  │
├────────────────────────────────────┤
│ ✓ Claim CLM-19 marked Paid • 3h   │
├────────────────────────────────────┤
│           Tandai semua dibaca      │
└────────────────────────────────────┘
```

### 4.12 WEB — Audit Log (`/admin/audit`)
```
Audit Log                                       [Export XLSX ⤓]
┌──────────────────────────────────────────────────────────────────────┐
│ Filters: [User ▾] [Entity ▾] [Action ▾] [Date range]   [Reset]      │
├──────────────────────────────────────────────────────────────────────┤
│ Time (WIB)         │User        │Entity        │Action │Detail │ ⓘ  │
│ 20-Apr 14:02:11    │andi.p      │milestone:441 │UPDATE │status │ ▸  │
│ 20-Apr 13:55:02    │admin       │import:imp_01 │COMMIT │1178rw │ ▸  │
│ 20-Apr 13:40:18    │budi.s      │sync/push     │ACCEPT │3 ops  │ ▸  │
│ ...                                                                 │
│ Click row → expand JSON before/after panel                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 4.13 MOBILE — Login
```
┌──────────────────────────┐
│                          │
│       DeliverIQ          │
│                          │
│  Email                   │
│  ▢ ____________________  │
│  Password                │
│  ▢ ____________________  │
│  ☐ Ingat saya            │
│                          │
│  [       MASUK        ]  │
│                          │
│  Lupa password?          │
│                          │
│        🌐 ID | EN        │
└──────────────────────────┘
```

### 4.14 MOBILE — Today's Tasks (`TodayScreen`)
```
┌──────────────────────────────┐
│ Hari Ini, 20 Apr  🔔  ⚙       │
├──────────────────────────────┤
│ ⓘ Offline · 2 update tertunda│   ← only when offline
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ JKT-NE-12  ●  AT RISK    │ │
│ │ PT Adi · SOW-001         │ │
│ │ Next: Procurement (today)│ │
│ │ Plan RFS: 25-May  GAP +3 │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ BDG-FE-21  ◐  ON TRACK   │ │
│ │ PT Sinar · SOW-002       │ │
│ │ Next: KOM (besok)        │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ SBY-NE-07  ●  DELAY      │ │
│ │ ...                      │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ ◐Hari Ini ◉Sites ⇅Sync 👤Saya│
└──────────────────────────────┘
```

### 4.15 MOBILE — Site Detail (`SiteDetailScreen`)
```
┌──────────────────────────────┐
│ ← JKT-NE-12          🔔       │
├──────────────────────────────┤
│ NE  ●  AT RISK               │
│ PT Adi · SOW-001             │
│ 📍 -6.21, 106.85  [Peta]     │
│ 📞 PIC: Andi P.              │
├──────────────────────────────┤
│ Milestone                    │
│ ● STIP 2/4  Done   02-Apr    │
│ ● STIP 10   Done   04-Apr    │
│ ● Design    Done   13-Apr    │
│ ◐ Procurement  ⚠ +3d   [▶]   │  ← tap = update
│ ○ KOM        plan 28-Apr     │
│ ○ Material   plan 05-May     │
│ ○ MOS        plan 10-May     │
│ ○ Install    plan 12-May     │
│ ○ RFS        plan 25-May     │
├──────────────────────────────┤
│ [   ✓ Check-in di sini   ]   │  ← geotag check-in CTA
├──────────────────────────────┤
│ ◐Hari Ini ◉Sites ⇅Sync 👤    │
└──────────────────────────────┘
```

### 4.16 MOBILE — Milestone Update with Photo + Geotag (`MilestoneUpdateScreen`)
```
┌──────────────────────────────┐
│ ← Update: Procurement        │
├──────────────────────────────┤
│ Status                       │
│  ○ Belum  ◉ Berjalan  ○ Selesai│
│  ○ Terblokir                 │
│                              │
│ Tanggal aktual               │
│  ▢ 20-Apr-2026  📅           │
│                              │
│ Catatan (opsional)           │
│  ▢ ┌────────────────────┐    │
│    │ Material datang... │    │
│    └────────────────────┘    │
│                              │
│ Foto bukti                   │
│  ┌───┐ ┌───┐ ┌───┐  [+ 📷]   │
│  │ ▣ │ │ ▣ │ │ ▣ │           │
│  └───┘ └───┘ └───┘           │
│  📍 Geotag: -6.21, 106.85 ✓  │
│  🕒 20-Apr 14:02 WIB         │
│                              │
├──────────────────────────────┤
│ [  Simpan offline / kirim ]  │  ← single primary CTA, full-width
└──────────────────────────────┘
```
- If geotag missing → modal: *"Lokasi tidak terdeteksi. Konfirmasi lokasi situs?"*
- Photo capture full-screen camera; auto compress ≤500 KB; EXIF preserved.

### 4.17 MOBILE — Offline Queue Indicator (`SyncStatusScreen`)
```
┌──────────────────────────────┐
│ Sinkronisasi          🔔      │
├──────────────────────────────┤
│ Status: 🟠 Offline           │
│ Antrian: 3 update            │
│ Foto: 5 menunggu unggah      │
│                              │
│ [    Coba sinkron sekarang ] │
├──────────────────────────────┤
│ Konflik (1)        ●         │
│ • SOW-001 / Procurement      │
│   Server lebih baru (15m)    │
│   [ Lihat & selesaikan → ]   │
├──────────────────────────────┤
│ Riwayat sync                 │
│ ✓ 20-Apr 09:12  3 update OK  │
│ ✓ 19-Apr 17:45  5 update OK  │
│ ✗ 19-Apr 08:01  1 ditolak    │
└──────────────────────────────┘
```

**ConflictResolveScreen (modal):**
```
┌──────────────────────────────┐
│ Konflik: Procurement         │
├──────────────────────────────┤
│ Server (terbaru):            │
│  Status: Selesai             │
│  Aktual: 19-Apr 16:00        │
│  Oleh:   andi.p              │
│ ──────────────────────────── │
│ Anda (lokal):                │
│  Status: Berjalan            │
│  Aktual: 20-Apr 09:00        │
│ ──────────────────────────── │
│ [ Pakai versi server ]       │
│ [ Kirim ulang versi saya ]   │
│ [ Buang perubahan saya ]     │
└──────────────────────────────┘
```

### 4.18 MOBILE — Notifications
```
┌──────────────────────────────┐
│ ← Notifikasi                 │
├──────────────────────────────┤
│ ⚠ SOW-118 → DELAY      5m   │
│ 🔔 @anda di remark      1h  │
│ ✓ Sync 3 update OK     2h   │
│ 📅 KOM besok (BDG-FE-21) 4h │
├──────────────────────────────┤
│        Tandai dibaca         │
└──────────────────────────────┘
```

---

## 5. Design System

### 5.1 Color palette

| Token | Hex | Use |
|---|---|---|
| `--color-primary-50` | `#EFF6FF` | bg subtle |
| `--color-primary-500` | `#2563EB` | brand, primary buttons, links |
| `--color-primary-700` | `#1D4ED8` | hover/active |
| `--color-accent-500` | `#0EA5E9` | secondary CTAs, highlights |
| `--color-success-500` | `#16A34A` | **On Track** status |
| `--color-success-50` | `#DCFCE7` | success bg |
| `--color-warning-500` | `#D97706` | **At Risk** status (amber) |
| `--color-warning-50` | `#FEF3C7` | warning bg |
| `--color-danger-500` | `#DC2626` | **Delay** status (red) |
| `--color-danger-50` | `#FEE2E2` | danger bg |
| `--color-neutral-900` | `#0F172A` | body text |
| `--color-neutral-700` | `#334155` | secondary text |
| `--color-neutral-500` | `#64748B` | muted |
| `--color-neutral-200` | `#E2E8F0` | borders |
| `--color-neutral-100` | `#F1F5F9` | row stripe |
| `--color-neutral-50` | `#F8FAFC` | app background |
| `--color-info-500` | `#0284C7` | informational banner |

All status colors meet **WCAG AA contrast ≥4.5:1** against white and `--color-neutral-50`. Status is **always paired with an icon** (●/◐/▲) so colorblind users are not status-blind.

### 5.2 Typography scale (Inter for web, system for mobile)

| Token | Size / Line | Weight | Use |
|---|---|---|---|
| `text-display` | 32 / 40 | 700 | KPI tile values |
| `text-h1` | 24 / 32 | 700 | Page title |
| `text-h2` | 20 / 28 | 600 | Section title |
| `text-h3` | 16 / 24 | 600 | Card title |
| `text-body` | 14 / 20 | 400 | Default body |
| `text-bodyL` | 16 / 24 | 400 | Mobile body |
| `text-caption` | 12 / 16 | 400 | Helper, timestamps |
| `text-mono` | 13 / 20 | 500 | IDs, numbers in tables |

### 5.3 Spacing & radius

- Spacing scale (Tailwind defaults): `0, 1, 2, 3, 4, 6, 8, 12, 16, 24` (× 4 px).
- Border radius: `rounded-md` (6 px) buttons/inputs, `rounded-lg` (8 px) cards, `rounded-full` pills.
- Shadows: `shadow-sm` cards · `shadow-md` modals · `shadow-lg` drawers.

### 5.4 Tailwind config tokens (`tailwind.config.ts` extract)

```ts
// shared between apps/web (Tailwind) and mirrored as theme in apps/mobile
export const theme = {
  colors: {
    primary: { 50:'#EFF6FF', 500:'#2563EB', 700:'#1D4ED8' },
    accent:  { 500:'#0EA5E9' },
    success: { 50:'#DCFCE7', 500:'#16A34A' },
    warning: { 50:'#FEF3C7', 500:'#D97706' },
    danger:  { 50:'#FEE2E2', 500:'#DC2626' },
    info:    { 500:'#0284C7' },
    neutral: { 50:'#F8FAFC', 100:'#F1F5F9', 200:'#E2E8F0',
               500:'#64748B', 700:'#334155', 900:'#0F172A' },
  },
  fontFamily: {
    sans: ['Inter', 'ui-sans-serif', 'system-ui'],
    mono: ['JetBrains Mono', 'ui-monospace'],
  },
  borderRadius: { md:'6px', lg:'8px', xl:'12px', full:'9999px' },
  fontSize: {
    display:['32px','40px'], h1:['24px','32px'], h2:['20px','28px'],
    h3:['16px','24px'], body:['14px','20px'], bodyL:['16px','24px'],
    caption:['12px','16px'],
  },
  screens: { sm:'640px', md:'768px', lg:'1024px', xl:'1280px', '2xl':'1536px' },
};
```
Mobile reuses these tokens via a `theme.ts` constants module (no Tailwind on RN; use `StyleSheet` consuming the same constants — keeps brand parity).

### 5.5 Component library (build list for Coder)

Web (`apps/web/src/components/ui/`):
- `Button` — variants: primary, secondary, ghost, destructive, link; sizes sm/md/lg; loading + disabled states.
- `IconButton`
- `Input`, `Textarea`, `Select`, `DatePicker`, `Checkbox`, `Radio`, `Switch`
- `Card`, `CardHeader`, `CardBody`, `CardFooter`
- `Badge` (neutral/info/success/warning/danger)
- `StatusPill` (`ON_TRACK | AT_RISK | DELAY`) — icon + label, color from token
- `KpiTile` — value, delta, sparkline, click-through
- `ProgressBar` — segmented + percentage
- `MilestoneStepper` — vertical, plan vs actual, GAP badge
- `GanttRow` — horizontal bar (plan vs actual overlay), tooltip
- `DataTable` — column defs, sort, server pagination, filter chips, row select, bulk actions, empty/loading/error
- `FilterBar` — chips + clear
- `Breadcrumb` — RBAC-aware, truncates middle
- `Sidebar` + `SidebarItem`
- `Header` (logo, breadcrumb, search, lang toggle, bell, profile)
- `Modal`, `Drawer`, `Toast`, `ConfirmDialog`
- `EmptyState`, `Skeleton` (table/card/chart variants), `ErrorState`
- `Heatmap`, `BarChart`, `LineChart`, `Gauge`, `Funnel` (wrap Recharts/Visx)
- `MapPlaceholder` — static map tile + status pin (real map = Phase 2)
- `PhotoUpload` — drag-drop + thumbnails + remove
- `OfflineBanner` (shared with mobile look)
- `ActivityFeed`, `RemarkComposer` (with @mention)
- `LanguageToggle`, `Avatar`, `Tag`

Mobile (`apps/mobile/src/components/`):
- `MButton`, `MInput`, `MSelect`, `MDatePicker`, `MCheckbox`
- `MCard`, `MStatusPill`, `MMilestoneRow`
- `MOfflineBanner` — sticky above tab bar
- `MSyncBadge` — pending count
- `MPhotoCapture` — full-screen camera + crop + geotag overlay
- `MGeotagChip`
- `MConflictCard`
- `MEmptyState`, `MSkeleton`, `MErrorState`
- `MToast`, `MBottomSheet`

---

## 6. Data Visualization Patterns

| Pattern | Component | Used in | Notes |
|---|---|---|---|
| **Portfolio heatmap** | `Heatmap` | BOD `/portfolio` | Rows = depts, cols = status buckets (On/Risk/Delay); cell = count, color = status; click → drill |
| **RFS achievement vs plan** | `BarChart` (grouped) | BOD + DH | X = month, Y = count; pair Plan (light) + Actual (solid); annotate gap |
| **CAPEX gauge** | `Gauge` (semi-circle) | BOD KPI tile + finance | 0–100%; thresholds: ≤80 success, 81–95 warning, >95 danger |
| **Milestone funnel** | `Funnel` (horizontal bars) | DH `/dept/.../funnel` | Counts at each milestone stage, avg days-in-stage label, ⚠ badge if overdue |
| **Delay distribution** | Histogram (`BarChart`) | DH bottlenecks | X = GAP-day buckets (-7,-3,0,+3,+7,+14,>14), Y = count |
| **Plan vs Actual timeline** | `GanttRow` stack | PM project workspace | Per-milestone: plan bar (gray) overlaid by actual bar (status color) |
| **Trend sparkline** | mini `LineChart` | KPI tiles | Last 8 periods, no axes, tooltip on hover |

All charts:
- Have a text-equivalent data table behind a "View as table" toggle (a11y).
- Respect color tokens; never use color alone (add patterns/labels).
- Provide loading skeletons and "No data" empty states.
- Support CSV export of underlying data.

---

## 7. Status Semantics (mapped to system rules)

| Status | Color token | Icon | Shape | Trigger (per `03-sa §6.4`) |
|---|---|---|---|---|
| **On Track** | `success-500` (green) | ● filled circle / ✓ | round | RFS done OR (no overdue AND gapDays ≤ 0) |
| **At Risk** | `warning-500` (amber) | ◐ half / ! | square | Any overdue ≤7d OR 1 ≤ gapDays ≤ 7 |
| **Delay** | `danger-500` (red) | ▲ triangle / × | triangle | maxOverdue >7d OR gapDays >7 OR RFS imminent + Installation not started |

Used identically across: KPI tiles, table rows (left border), pills, map pins, mobile cards, notification icons. **Labels are always shown** alongside color/shape — no color-only states.

---

## 8. Accessibility (WCAG 2.1 AA)

- **Contrast:** all text ≥4.5:1, large text ≥3:1, UI components ≥3:1; verified for status colors against `neutral-50` and white.
- **Color independence:** status uses color + icon + text label.
- **Keyboard:** every interactive element reachable via Tab; visible focus ring (`ring-2 ring-primary-500 ring-offset-2`); logical tab order; `Esc` closes modals/drawers; arrow keys navigate tables.
- **ARIA:** semantic roles for nav, main, complementary, dialog; `aria-live="polite"` for sync toasts; `aria-busy` on loading; data tables use `<th scope>` and `<caption>`.
- **Forms:** explicit `<label>` linkage; inline error with `aria-describedby`; required fields marked with `*` and `aria-required`.
- **Motion:** respect `prefers-reduced-motion` (disable subtle animations, keep functional transitions).
- **Mobile touch targets:** minimum **44×44 px** (iOS HIG / WCAG); primary CTAs full-width 48 px tall; spacing ≥8 px between targets.
- **Screen reader:** all icons have `aria-label` or hidden text; charts have a "View as table" alternative.
- **Language:** `<html lang="id">` / `<html lang="en">` set per user locale; mobile uses `I18nManager` + `accessibilityLanguage`.
- **Photos:** require `alt` (auto-generated: `"Bukti milestone {name} di {site} {timestamp}"`).
- **Time zones:** all dates display "WIB" suffix to prevent ambiguity.

---

## 9. Localization (ID + EN)

- **Default locale:** `id-ID`. Toggle in header (web) + Profile tab (mobile).
- **Library:** `next-intl` (web), `i18next` + `expo-localization` (mobile). One source of truth: `packages/shared/i18n/{id,en}.json`.
- **Keys** are namespaced: `common.*`, `auth.*`, `portfolio.*`, `dept.*`, `pm.*`, `mobile.*`, `validation.*`, `errors.*`.
- **Numbers:** Indonesian thousand separator (`.`) and decimal (`,`); currency formatted `Rp 1.234.567`.
- **Dates:** `dd-MMM-yyyy` (e.g., `20-Apr-2026`); "WIB" suffix on times.
- **Status labels:** ID — On Track = *Sesuai Jadwal*, At Risk = *Berisiko*, Delay = *Terlambat*.
- **Microcopy guidance:** short, imperative, no jargon — "Simpan", "Batal", "Kirim ulang"; avoid English loan words when ID equivalent is clear.
- **Pluralization:** ICU MessageFormat for items like *"{n, plural, one{# update tertunda} other{# update tertunda}}"* (ID has no plural inflection — keeps logic simple).
- **RTL:** not required.
- **Email templates:** rendered server-side per user.locale.

---

## 10. Mobile UX — Offline-First Patterns

- **Offline indicator:** persistent thin banner above tab bar:
  - 🟢 hidden when online + queue empty.
  - 🟠 *"Offline · {n} update tertunda"* when offline OR queue >0.
  - 🔴 *"Konflik sinkronisasi · tinjau"* when conflicts pending.
- **Optimistic UI:** writes apply locally immediately; show `Pending sync` chip on the affected milestone row until ACK.
- **Outbox visibility:** Sync tab lists every queued op (entity, time created, retry count) — user trust through transparency.
- **Sync triggers:** (a) network-up, (b) app-foreground, (c) manual button, (d) every 5 min while foregrounded online. Retry: exponential backoff 5 s → 1 min → 5 min, max 1 h.
- **Conflict resolution UI:** explicit screen with side-by-side server vs local; 3 actions (use server, resubmit local, discard). Never auto-discard user input.
- **Photo capture:** full-screen camera, single shutter; auto compress ≤500 KB JPEG; embed geotag + WIB timestamp into EXIF; upload via presigned URL when online; thumbnails cached locally.
- **Low-bandwidth optimization:**
  - JSON only on `/sync/pull`, no embedded media.
  - Photos deferred to separate upload queue.
  - Pull deltas via `since=token` watermark, never full snapshot.
  - Image quality auto-degrades to 60% if connection type ∈ `2g | slow-2g`.
  - Cache list pages for instant open; show stale-while-revalidate badge.
- **Battery / data:** background sync stops if battery <15% AND not charging; user can disable cellular sync ("WiFi only" toggle).
- **Auth on mobile:** access token kept in secure storage; refresh on app start; if refresh fails offline → keep last role/scope, allow read+queue, block on next online attempt.
- **Cache scope:** assigned sites + open milestones + last 30 days of history + last 50 photos thumbs. Encrypted at rest (Expo SecureStore for keys; SQLite encrypted via SQLCipher).
- **Field-friendly:** large fonts, high contrast, dark-mode auto, glove-tap targets (≥48 px on primary CTAs), haptic feedback on save.

---

## 11. Empty / Loading / Error States

Every list and detail screen MUST implement the 4-state pattern.

### 11.1 Loading skeletons
- **Tables:** 5 striped rows of `Skeleton` blocks matching column widths.
- **KPI tiles:** gray rectangle for value + smaller bar for delta.
- **Charts:** axis-only frame with shimmer rectangle in plot area.
- **Mobile cards:** 3 skeleton cards in `TodayScreen`.
- Skeleton must appear **after 200 ms** of pending state to avoid flicker; use `Suspense` boundaries on web (RSC).

### 11.2 Empty states
| Context | Illustration / icon | Title | Body | CTA |
|---|---|---|---|---|
| BOD `/portfolio` no data | 📊 | "Belum ada data" | "Impor data Excel untuk memulai." | [Buka Import →] (AD only) |
| PM project list empty | 📁 | "Belum ada project" | "Anda belum ditugaskan ke project apapun." | — |
| Milestones empty | 🏁 | "Milestone akan dibuat otomatis saat SOW disimpan" | — | — |
| Notifications empty | 🔔 | "Tidak ada notifikasi" | "Anda akan diberi tahu saat ada update penting." | — |
| Mobile Today empty | ✅ | "Tidak ada tugas hari ini" | "Selamat! Cek tab Sites untuk melihat semua." | [Lihat Sites] |
| Sync queue empty | 🟢 | "Semua tersinkron" | "Tidak ada update tertunda." | — |
| Search no results | 🔍 | "Tidak ditemukan" | "Coba kata kunci lain atau bersihkan filter." | [Reset filter] |

### 11.3 Error states
- **Inline (forms):** red text + icon under field, `aria-describedby` linked.
- **Section error:** card with `ErrorState` (icon, message, [Coba lagi]). Used for failed widgets without breaking page.
- **Page error (500):** "Terjadi kesalahan. Tim kami sudah diberi tahu." + traceId + [Muat ulang] [Kembali ke Beranda]. Show traceId in monospace for support.
- **403:** "Anda tidak memiliki akses ke halaman ini." + [Kembali].
- **404:** "Halaman tidak ditemukan." + [Beranda].
- **Network error (mobile):** banner *"Tidak dapat terhubung. Bekerja secara offline."* — never block the user.
- **Sync rejection:** toast + entry in Sync tab; never silent.

---

## 12. Responsive Design Specs

Tailwind breakpoints used: `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`.

### 12.1 Web layouts
| Breakpoint | Layout |
|---|---|
| **<768 (mobile web)** | Sidebar collapses to hamburger drawer; tables → stacked cards; KPI grid 1 col; charts full-width 240 px tall |
| **768–1023 (tablet)** | Sidebar = icon-rail (collapsed); KPI grid 2 cols; tables horizontal scroll |
| **1024–1279 (desktop)** | Sidebar expanded 240 px; KPI grid 3 cols; tables fit |
| **≥1280 (wide)** | Side panels (financial summary) appear; KPI grid 6 cols; charts side-by-side |

- All forms max-w 640 px regardless of breakpoint.
- Modals: full-screen on mobile, centered card 560 px on ≥md.
- Drawers: bottom-sheet on mobile, right-side on ≥md.

### 12.2 Mobile (native) layouts
- Phones 360–430 dp (portrait only in MVP).
- Tablets: 2-column for SiteList (master-detail) at width ≥768 dp.
- Bottom tab bar always visible; 56 dp tall + safe-area inset.
- Primary CTA fixed bottom, full-width, 48 dp tall, 16 dp side padding.

### 12.3 Touch / interaction adaptations
- Hover states (web) → omitted on touch; active/pressed states emphasized instead.
- Tooltips → tap-to-show on touch with 5 s auto-dismiss.
- Drag-drop (web import) → button-pick fallback.
- Long-press on table row (mobile) → context menu (e.g., "Tandai dibaca").

---

## 13. UI/UX Guidelines

### 13.1 Navigation & IA rules
- One primary action per screen, top-right or bottom-fixed (mobile).
- Breadcrumb on every web detail page; deep links must always be shareable & RBAC-checked server-side.
- Never more than 2 levels of modal/drawer stacking.
- Back behavior: web = browser; mobile = stack-aware header back, never closes modal accidentally.

### 13.2 Content & microcopy
- Use Indonesian first for end-user copy; mirror to English.
- Verbs in CTAs: *Simpan, Kirim, Batal, Hapus, Impor, Ekspor, Tinjau, Setujui*.
- Avoid acronyms in UI text where possible; if used (STIP, SOW, RFS), provide tooltip on first occurrence per session.
- Number formatting consistent (IDR currency, no abbreviations except KPI tiles where `Rp 1.2T` is allowed with tooltip showing full).
- Date format: always `dd-MMM-yyyy`; never US `MM/DD`.

### 13.3 Heuristic & a11y self-check (every screen)
- [ ] Visible system status (loading, saved, offline)?
- [ ] Match real-world (BU vocabulary)?
- [ ] User control (cancel, undo where reasonable)?
- [ ] Consistency with other DeliverIQ screens?
- [ ] Error prevention (confirm destructive)?
- [ ] Recognition over recall (no hidden gestures)?
- [ ] Flexibility (filters, shortcuts where helpful)?
- [ ] Aesthetic minimalism (only essential fields)?
- [ ] Recovery from errors (clear messages, traceId)?
- [ ] Help / docs reachable from header?
- [ ] WCAG AA contrast & keyboard tested?

### 13.4 Component usage principles
- One source for primitives (`components/ui`); feature folders compose them, never restyle.
- All status visuals via `StatusPill` — never raw colored divs.
- All tables via `DataTable` — never bespoke `<table>`.
- All forms via shared `Input`/`Select`/`DatePicker` to inherit a11y + i18n.

---

## 14. Collaboration Handoff

### 14.1 Decisions needed from PM (blockers for fidelity, not for build start)
1. **L5 / L6** — Final "Delay" thresholds and "Revenue at Risk" formula impact KPI labels & color triggers; confirm before W7.
2. **MRC monthsToRecognize** default for Revenue at Risk (currently 12).
3. Final ID glossary for milestone names (use `STIP 2/4` as label or translate?).
4. Whether BOD can drill to PM workspace in true read-only or just see exported PDF.
5. Confirm 6 KPI tiles for BOD (current set in §4.2) — order and any add/remove.
6. Mobile: dark mode required at MVP, or auto-system only?
7. Notifications cadence: in-app real-time poll interval (currently 60 s suggested).

### 14.2 Implementation clarifications for Coder
- Use **`packages/shared/theme.ts`** as the single token source consumed by Tailwind config (web) and RN `StyleSheet` (mobile).
- All status logic must call `packages/shared/progress.ts` (per `03-sa §6.4`); never recompute in UI.
- Status pill styles MUST be derived from a `WarningLevel` enum, not strings.
- Web tables: server-side pagination + filter state in URL search params (Next.js `useSearchParams`) for shareability.
- Mobile photo upload: presign → S3 PUT → `/sync/push` metadata, in that order, retry-safe.
- Forms validated on **both** client (Zod via shared schema) and server.
- All money values rendered through `formatIDR()` helper (shared).
- Date inputs MUST use a controlled component that returns ISO string in UTC; display formatting separate.
- i18n keys must exist in **both** `id.json` and `en.json` at PR merge — CI check.
- Skeletons appear after 200 ms (`useDeferredValue` or simple `setTimeout`), never instantly.

### 14.3 Component build list for Coder (priority order, MVP)

Sprint W1–W2 (foundation):
1. `Button`, `IconButton`, `Input`, `Select`, `Checkbox`, `Radio`, `DatePicker`
2. `Card`, `Badge`, `StatusPill`
3. `Sidebar`, `Header`, `Breadcrumb`, `LanguageToggle`
4. `Modal`, `Drawer`, `Toast`, `ConfirmDialog`
5. `Skeleton`, `EmptyState`, `ErrorState`
6. Mobile: `MButton`, `MInput`, `MCard`, `MStatusPill`, `MOfflineBanner`, `MBottomSheet`

Sprint W3–W5:
7. `DataTable` + `FilterBar`
8. `KpiTile`, `ProgressBar`
9. `MilestoneStepper`, `GanttRow`
10. `PhotoUpload`
11. Mobile: `MMilestoneRow`, `MPhotoCapture`, `MGeotagChip`, `MSyncBadge`

Sprint W6–W8:
12. `BarChart`, `LineChart`, `Heatmap`, `Funnel`, `Gauge`
13. `RemarkComposer` with @mention
14. `ActivityFeed`
15. `MapPlaceholder`
16. Mobile: `MConflictCard`

### 14.4 Screen → API mapping (for Coder)

| Screen | Primary API call(s) |
|---|---|
| Web Login | `POST /auth/login`, `POST /auth/password-reset/request` |
| BOD `/portfolio` | `GET /reports/portfolio`, `GET /reports/rfs-monthly`, `GET /reports/revenue-at-risk` |
| Dept `/dept/[id]/funnel` | `GET /reports/dept-funnel?deptId`, `GET /reports/overdue?deptId&stage` |
| Programs list | `GET /orders`, `POST /orders` |
| Order detail | `GET /orders/{id}`, `GET /orders/{id}/sos`, then `GET /sos/{id}/sows` |
| Project workspace | `GET /sows/{id}` (incl. milestones), `GET /sows/{id}/sites`, `GET /sows/{id}/vendors`, `GET /sows/{id}/remarks` (Phase 2 endpoint stub OK for MVP) |
| Site detail | `GET /sites/{id}`, `GET /sows/{sowId}/milestones` |
| Milestone update modal | `PATCH /milestones/{id}` (+ `POST /uploads/presign`, `POST /milestones/{id}/photos`) |
| Vendor list | `GET /vendors`, `POST /vendors`, `PATCH /vendors/{id}` |
| Import wizard | `POST /imports`, `GET /imports/{id}`, `POST /imports/{id}/commit`, `POST /imports/{id}/rollback` |
| Claim queue | `GET /claims`, `PATCH /claims/{id}` |
| CAPEX | `GET /capex/by-so/{soId}`, `POST /capex/by-so/{soId}/entries` |
| Notifications | `GET /notifications`, `POST /notifications/{id}/read` |
| Audit log | `GET /audit`, `GET /audit/export` |
| Mobile Today / Sites | `GET /sync/pull?since=` (delta) |
| Mobile Milestone update | append to local outbox → `POST /sync/push` (batch) |
| Mobile Check-in | `POST /checkins` (or via outbox when offline) |
| Mobile Sync screen | local outbox query + `POST /sync/push` retry |

### 14.5 Open UX risks & follow-up validation
1. **PM project workspace tab density** — 5 tabs may be too many; validate with 2 PMs in W6.
2. **Mobile MOS / install milestone naming** in Bahasa needs field-engineer confirmation (jargon vs translation).
3. **Heatmap legibility** at small breakpoints (<lg) — may need fallback table.
4. **Conflict resolution UX** — first-time field users may not understand "server vs local"; consider in-app coach mark on first conflict.
5. **Bell drawer vs page** for notifications — observe whether users prefer in-context drawer or a full page.
6. Photo upload behavior on iOS background — RN background upload reliability needs spike in W9.

---

## 15. Handoff

- **Inputs consumed:**
  - `c:\Users\soega\Project BAru\run\20260420_Enterprise_Project_Delivery_Dashboard\.artifacts\01-creator-vision.md`
  - `c:\Users\soega\Project BAru\run\20260420_Enterprise_Project_Delivery_Dashboard\.artifacts\02-pm-roadmap.md`
  - `c:\Users\soega\Project BAru\run\20260420_Enterprise_Project_Delivery_Dashboard\.artifacts\03-sa-system-design.md`
- **Outputs produced:**
  - `c:\Users\soega\Project BAru\run\20260420_Enterprise_Project_Delivery_Dashboard\.artifacts\04-uiux-design.md` (this document).
- **Open questions for next stages (PM + Coder):**
  1. Lock final "Delay" / "Revenue at Risk" formulas (L5, L6) before W7 dashboards build.
  2. Confirm 6 KPI tiles & order on BOD portfolio.
  3. Confirm Bahasa labels for STIP / SOW / RFS / MOS — translate or keep English acronym?
  4. Dark mode required for mobile at MVP, or post-launch?
  5. Real-time notification: polling 60 s vs WebSocket — confirm given infra simplicity goal.
  6. BOD drill into PM workspace: read-only mode or PDF export only?
  7. Background photo upload reliability on iOS — needs Coder spike in W9.
  8. Offline cache size cap on mobile (MB) before old photos auto-evicted.
- **Go/No-Go for Coder:** **GO.** All MVP screens specified at wireframe fidelity, design tokens defined, component build list ordered by sprint, screen-to-API mapping aligned with `03-sa-system-design.md`. Open questions are refinements that do not block scaffold (W1–W2) or core entity UI (W3–W5). Coder may begin foundation work immediately and iterate on dashboards/charts in W6–W8 once L5/L6 are confirmed.
