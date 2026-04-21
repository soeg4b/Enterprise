# User Guide: Project Manager

Audience: Project Managers. Role code: `PM`.

## What you can do

- Create and edit your own programs (Orders), SOs (Phase 2), SOWs (Phase 2), sites, and milestones.
- Update milestone status / actual date / remark.
- Upload Excel imports? -> No, that is Admin (AD).

You see only orders where you are `ownerUserId`.

## 1. Daily flow

1. Sign in. Land on `/projects` (your SOWs).
2. Open a project. The workspace shows: Overview, Timeline, Sites, Vendors, Remarks (UI tabs).
3. Click a site -> milestone stepper.
4. Update a milestone (see §3).
5. Watch the warning level change after a few seconds (recompute job is async).

## 2. Create a program (Order)

```
POST /v1/orders   (also available from the UI "New Program" button)
```

Required fields: `orderNumber`, `customerId`, `type`, `productCategory`, `contractValue`. Recommended: `departmentId`, `otcAmount`, `mrcAmount`, `capexBudget`, `startDate`, `endDate`. Rule: `endDate >= startDate`.

After creation, an Admin (or you, in Phase 2) creates the SO -> SOW -> sites under the order. Until SO/SOW CRUD ships, use Excel import for bulk seeding (handled by Admin).

## 3. Update a milestone

Allowed transitions:

```
NOT_STARTED  ->  IN_PROGRESS | BLOCKED
IN_PROGRESS  ->  DONE | BLOCKED
BLOCKED      ->  IN_PROGRESS
DONE         ->  (locked)
```

Rules:
- `status=DONE` requires `actualDate`.
- Backdating `actualDate` more than 30 days returns an error. Phase 2 will allow this with a DH approval token.
- A successful update enqueues `milestone:recompute` for the parent SOW. Progress %, GAP days, and warning level are refreshed within seconds.

Curl reference: [api.md](api.md#patch-v1milestonesid-ad-pm-fe).

## 4. Add a site

```
POST /v1/sites
```

Required: `sowId`, `code`, `name`, `type` (`NE` / `FE` / `POP`). Recommended: lat/long, address, `assignedFieldUserId` (a Field Engineer who will see this site in their mobile Today list).

## 5. Reading the warning level

See [milestone-engine.md](milestone-engine.md). Tips:
- If your SOW is `DELAY` and you haven't started Installation but RFS is within 14 days, the engine will **always** flag DELAY -> kick off MOS / Installation.
- If the SOW is `AT_RISK`, look for: any open milestone overdue by more than 3 days, or GAP days between 1 and 7.

## 6. Import history

You cannot trigger imports, but you can ask Admin for the current import status. After commit (Phase 2), entities you own will appear in `/projects` automatically.

## 7. Sync with the field

Field engineers update milestones from mobile (`POST /v1/sync/push`). On conflict (you and the field engineer both updated the same milestone), **server-wins by `updatedAt`** for `status` / `actualDate`; the field client receives `REJECTED_STALE` with the current server state. Remarks are append-only with `[ts][author]` prefix.

## 8. Common errors

| Error | What it means | What to do |
|---|---|---|
| `400 VALIDATION_FAILED` | Body failed Zod validation | Check the `errors[]` array |
| `409 BUSINESS_RULE` | A guard fired (e.g., bad transition, backdate >30d) | Read `detail`, fix the request |
| `403 FORBIDDEN` | RBAC scope violation | You may have tried to edit a milestone outside your projects |
| `404 NOT_FOUND` | Wrong id, or soft-deleted entity | Verify the id |

## 9. Keyboard / etiquette

- Use the breadcrumb to navigate up; do not rely on the browser back button across drill-down levels.
- Be specific in milestone remarks; they are appended verbatim and visible to BOD on drill-down.
