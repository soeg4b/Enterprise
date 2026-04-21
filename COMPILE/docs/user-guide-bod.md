# User Guide: BOD / Executives

Audience: Board, executives, portfolio sponsors. Role code: `BOD`.

## What you can do

- See the entire portfolio at a glance.
- Drill from KPIs into a department, then a program / SO / SOW / site.
- Read milestone state, but **not** edit it.

## 1. Sign in

1. Open the web app (URL provided by IT).
2. Email + password. After 5 wrong attempts your account locks for 15 minutes.
3. You will land on `Portfolio` (`/portfolio`).

## 2. Portfolio dashboard

KPI tiles (cached up to 60 s, source: `GET /v1/reports/bod`):

| Tile | Meaning |
|---|---|
| Total Revenue | Sum of `contractValue` across all orders. |
| Revenue at Risk | Sum of `OTC + (MRC x MRC_HORIZON_MONTHS)` for orders that have at least one SOW in `DELAY` and not yet RFS-achieved. |
| On-Track % | SOWs with `warningLevel=ON_TRACK` divided by all SOWs. |
| RFS This Month (Plan vs Actual) | SOWs whose `planRfsDate` / `actualRfsDate` falls in the current WIB month. |
| Overdue | SOWs currently in `DELAY`. |
| Status Distribution | On Track / At Risk / Delay counts. |
| By Department | The same buckets, per department. |

Status colours are the same everywhere:
- Green = On Track
- Amber = At Risk
- Red = Delay

See [milestone-engine.md](milestone-engine.md) for the formulas.

## 3. Drill-down path

```
Portfolio  ->  Department  ->  Program (Order)  ->  SO  ->  SOW  ->  Site  ->  Milestone
```

Breadcrumb is always visible. You can deep-link any URL.

## 4. Reading a SOW

- **Progress %** is auto-computed from milestone weights. Do not try to override.
- **GAP days to RFS** is positive when actuals slip beyond plan; zero while plan is still in the future.
- **Warning level** combines GAP days, open-milestone overdue days, and the "RFS imminent / installation not started" rule.

## 5. Frequently asked

- *Why is this SOW DELAY when the GAP is only 2 days?*
  Likely an open milestone is overdue by more than 7 days, or RFS is within 14 days but Installation is `NOT_STARTED`. Drill into the SOW to see milestone planDates.
- *KPIs look stale.* Cache TTL is 60 s; refresh after a minute or after the next milestone update triggers a recompute.
- *I can't edit anything.* By design. BOD is read-only.

## 6. Help

For data corrections, contact the PM (`Order.owner`) or Admin. For access issues, contact IT.
