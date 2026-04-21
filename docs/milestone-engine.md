# Milestone Engine

Pure functions in [src/backend/src/engine/milestone.ts](../src/backend/src/engine/milestone.ts).
No DB calls; safe to unit-test (see [tests/unit/engine/milestone.test.ts](../tests/unit/engine/milestone.test.ts)).
Triggered from `PATCH /v1/milestones/:id` and `POST /v1/sync/push` via the BullMQ job `milestone:recompute` keyed by `sowId`.

## 1. Milestone weights

Sum to 100:

| Type | Weight |
|---|---:|
| STIP_2_4 | 5 |
| STIP_10 | 5 |
| DESIGN | 10 |
| PROCUREMENT | 15 |
| KOM | 5 |
| MATERIAL_READY | 15 |
| MOS | 5 |
| INSTALLATION | 25 |
| RFS | 15 |
| HANDOVER | 0 |

Status factor: `DONE = 1.0`, `IN_PROGRESS = 0.5`, otherwise `0`.

## 2. Progress %

```
progressPct = round( sum_over_milestones( weight * statusFactor(status) ) , 1 decimal )
```

### Worked example A — early days

| Milestone | Weight | Status | Contribution |
|---|---:|---|---:|
| STIP 2/4 | 5 | DONE | 5.0 |
| STIP 10 | 5 | DONE | 5.0 |
| Design | 10 | IN_PROGRESS | 5.0 |
| Procurement | 15 | NOT_STARTED | 0 |
| KOM | 5 | NOT_STARTED | 0 |
| Material Ready | 15 | NOT_STARTED | 0 |
| MOS | 5 | NOT_STARTED | 0 |
| Installation | 25 | NOT_STARTED | 0 |
| RFS | 15 | NOT_STARTED | 0 |
| Handover | 0 | NOT_STARTED | 0 |

`progressPct = 15.0`

### Worked example B — pre-RFS

Done through Installation, RFS in progress:
`5 + 5 + 10 + 15 + 5 + 15 + 5 + 25 + (15 * 0.5) = 92.5`

## 3. GAP days to RFS

```
if sow.actualRfsDate:
    gapDays = days(actualRfsDate - planRfsDate)        # signed; +N late, -N early
else:
    gapDays = max(0, days(today - planRfsDate))        # 0 while plan is still in the future
```

Day arithmetic uses UTC midnight on each side (eliminates DST off-by-one).

### Worked example

`planRfsDate = 2026-04-20`, no `actualRfsDate`.
- On 2026-04-18 -> `gapDays = 0`
- On 2026-04-25 -> `gapDays = 5`

If `actualRfsDate = 2026-04-15`, `gapDays = -5` (delivered 5 days early).

## 4. Overall status

Constants ([src/shared/src/constants.ts](../src/shared/src/constants.ts)):

```
AT_RISK_GAP_MIN_DAYS         = 1
AT_RISK_GAP_MAX_DAYS         = 7
AT_RISK_OVERDUE_DAYS         = 3
DELAY_GAP_DAYS               = 7
DELAY_OVERDUE_DAYS           = 7
RFS_IMMINENT_WINDOW_DAYS     = 14
```

Inputs: open milestones (`status != DONE` and `planDate` set), `gap = computeGapDayToRfs(...)`.

```
if sow.actualRfsDate:                                      -> ON_TRACK
overdueDays         = max(0, today - milestone.planDate) for each open
maxOverdue          = max(overdueDays) or 0
anyOverdue          = any(overdueDays > AT_RISK_OVERDUE_DAYS)
installNotStarted   = INSTALLATION.status == NOT_STARTED
daysUntilRfs        = planRfsDate - today
rfsImminentNoInstall = daysUntilRfs <= RFS_IMMINENT_WINDOW_DAYS && installNotStarted

DELAY    if (anyOverdue && maxOverdue > DELAY_OVERDUE_DAYS)
         or gap > DELAY_GAP_DAYS
         or rfsImminentNoInstall
AT_RISK  else if anyOverdue
         or (AT_RISK_GAP_MIN_DAYS <= gap <= AT_RISK_GAP_MAX_DAYS)
ON_TRACK otherwise
```

### Worked example C — DELAY by GAP

`planRfsDate = 2026-04-10`, today = 2026-04-20, no actual.
`gap = 10 > DELAY_GAP_DAYS(7)` -> **DELAY**.

### Worked example D — DELAY by RFS-imminent rule

Today = 2026-04-20, `planRfsDate = 2026-04-25` (5 days), Installation still `NOT_STARTED`.
`daysUntilRfs = 5 <= 14` and `installNotStarted` -> **DELAY**.

### Worked example E — AT_RISK

Today = 2026-04-20, `planRfsDate = 2026-04-23` (gap 0), one open milestone overdue by 5 days.
`anyOverdue=true` (5 > 3) and `maxOverdue=5 <= 7` -> **AT_RISK**.

### Worked example F — ON_TRACK

`actualRfsDate = 2026-04-18` -> **ON_TRACK** (delivered).

## 5. Per-milestone overdue days

```
overdueDays(m) = 0 if m.status == DONE or m.planDate is null
               else max(0, today - m.planDate)
```

## 6. Recompute pipeline

1. Mutating endpoint writes the milestone change + `MilestoneEvent` + audit row.
2. Producer: `milestoneQueue.add('milestone:recompute', { sowId }, { jobId: 'recompute:'+sowId })`.
3. Worker (concurrency = 4 across SOWs, serialised per SOW via the `jobId` key):
   - loads SOW + its milestones.
   - calls `computeProgressPercent`, `computeGapDayToRfs`, `computeOverallStatus`.
   - writes back denormalised columns on `SOW` and per-site rollups.
   - `cache.invalidatePattern('default:reports:*')` to drop the BOD cache.

## 7. Reopen / DONE-rollback

Currently `DONE` is locked at the API layer. The reopen path (with DH approval token) is **Phase 2** (see [.artifacts/06-coder-plan.md](../.artifacts/06-coder-plan.md) §6 follow-up #10).
