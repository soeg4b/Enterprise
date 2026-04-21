# Data Model

Schema source of truth: [src/database/prisma/schema.prisma](../src/database/prisma/schema.prisma).
Detailed rationale: [.artifacts/05-data-schema.md](../.artifacts/05-data-schema.md).

## Conventions

- All money: `Decimal(18,2)` IDR.
- All timestamps: stored UTC, presented in `Asia/Jakarta` (WIB).
- Soft delete: every editable entity carries `deletedAt DateTime?`. Default queries filter `deletedAt IS NULL` via Prisma middleware.
- Optimistic lock: `version Int @default(1)` declared on editable entities (enforcement is Phase 2 hardening).
- Multi-tenant ready: nullable `tenantId String? @db.Uuid` on every domain entity; MVP runs single-tenant (`tenantId IS NULL`).
- Engine outputs denormalised on `SOW` and `Site`: `progressPct`, `gapDays`, `warningLevel`, `lastComputedAt`.

## Entity inventory

| Group | Entities |
|---|---|
| Identity | Tenant, User, Role, RefreshToken |
| Org master | Department, Customer, Program, Vendor |
| Delivery | Order, OrderDocument, SO, SOW, Site, Segment, VendorAssignment |
| Milestone | Milestone, MilestoneEvent |
| Mobile field | FieldUpdate, Photo |
| Finance | RevenueClaim, CapexBudget, CapexEntry |
| Cross-cutting | Notification, AuditLog, ImportJob, ImportRow, SyncOutbox, SyncCursor |

## Hierarchy

```
Customer ─┐
          v
        Order  ──── Department
          │
          ├─ OrderDocument
          v
         SO
          │
          v
        SOW ── VendorAssignment ── Vendor
          │       (planRfsDate, actualRfsDate)
          ├─ Milestone (10 types, weight sum = 100)
          ├─ RevenueClaim (OTC + N x MRC)
          v
        Site (NE / FE / POP)
          ├─ Milestone (site-level, optional)
          ├─ FieldUpdate ─ Photo (sha256 unique)
          └─ Segment (NE+FE pair, same SOW)
```

## Milestone template

| Type | Weight | Default plan offset (days before RFS) |
|---|---:|---:|
| STIP_2_4 | 5 | 60 |
| STIP_10 | 5 | 55 |
| DESIGN | 10 | 45 |
| PROCUREMENT | 15 | 35 |
| KOM | 5 | 30 |
| MATERIAL_READY | 15 | 20 |
| MOS | 5 | 15 |
| INSTALLATION | 25 | 10 |
| RFS | 15 | 0 |
| HANDOVER | 0 | -3 (administrative) |

Defined in [src/shared/src/constants.ts](../src/shared/src/constants.ts) (`MILESTONE_WEIGHTS`, `MILESTONE_PLAN_OFFSETS_DAYS`).

## Enums (selected)

- `UserRole`: `AD`, `BOD`, `DH`, `PM`, `FE`, `FN`.
- `OrderType`: `NEW`, `UPGRADE`, `RENEWAL`, `RELOCATION`, `TERMINATION`.
- `ProductCategory`: `CONNECTIVITY`, `DATACENTER`, `CLOUD`, `MANAGED_SERVICE`, `ICT_SOLUTION`, `OTHER`.
- `SiteType`: `NE`, `FE`, `POP`. `SiteOwner`: `CUSTOMER`, `TELCO`, `THIRD_PARTY`.
- `MilestoneType`: see template above.
- `MilestoneStatus`: `NOT_STARTED`, `IN_PROGRESS`, `DONE`, `BLOCKED`.
- `OverallStatus`: `ON_TRACK`, `AT_RISK`, `DELAY`. See [milestone-engine.md](milestone-engine.md).
- `ImportStatus`: `UPLOADED`, `PARSING`, `VALIDATED`, `COMMITTED` (Phase 2), `FAILED`.
- `ClaimType`: `OTC`, `MRC`. `ClaimStatus`: `PENDING`, `SUBMITTED`, `PAID`.

## Cascade rules

- `Order DELETE` cascades through `SO -> SOW -> Site / Segment / Milestone / VendorAssignment / Photo / Claim`.
- `User DELETE` cascades to `RefreshToken`, `Notification`, `SyncOutbox`, `SyncCursor`.
- Soft-delete is the default; hard cascade only used by admin purge job.

## Indexes (highlights)

- `SOW(planRfsDate)`, `SOW(warningLevel, planRfsDate)`, `SOW(ownerUserId, warningLevel)`.
- `Site(assignedFieldUserId, updatedAt)` — mobile sync delta.
- `Milestone(sowId, sequence)`, `Milestone(status, planDate)`, partial index on open milestones for the overdue scan.
- Trigram GIN on `Customer.name`, `Vendor.name`, `Site.name` (raw migration).
- `AuditLog(entityType, entityId, occurredAt)`; append-only enforced by trigger (see [security.md](security.md)).
- Unique: `ImportJob.sha256`, `SyncOutbox.clientId`, `Photo.sha256`.

## Mobile sync tables

- `SyncOutbox(clientId UNIQUE, status, serverState?, processedAt)` — server-side ledger of every push item.
- `SyncCursor(userId, scope, lastSyncedAt, token)` — per-user pull watermark.
