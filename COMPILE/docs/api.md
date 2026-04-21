# API Reference

Base URL (dev): `http://localhost:3600`
All business endpoints are versioned under `/v1`.
All requests/responses are JSON unless noted (`/v1/imports/excel` is `multipart/form-data`).
Authentication: `Authorization: Bearer <accessToken>` on every `/v1/**` route.

Error envelope (RFC 7807):
```json
{
  "type": "about:blank",
  "title": "Validation failed",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "...",
  "errors": [{ "path": "body.email", "message": "Invalid email" }],
  "requestId": "req_..."
}
```

Rate limits: per-IP and per-email on `/v1/auth/login` (token bucket; lockout after 5 failed attempts in 15 min).

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` | none | Liveness |
| GET | `/readyz` | none | Readiness (DB + Redis ping) |

```bash
curl http://localhost:4000/healthz
```

## Auth

### POST `/v1/auth/login`

```bash
curl -sX POST http://localhost:4000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@deliveriq.local","password":"ChangeMe!2026"}'
```

Response:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "user": { "id": "...", "email": "...", "role": "AD", "fullName": "..." }
}
```

### POST `/v1/auth/refresh`

```bash
curl -sX POST http://localhost:4000/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"eyJ..."}'
```

Rotates the refresh token (old jti is revoked).

### POST `/v1/auth/logout`

```bash
curl -sX POST http://localhost:4000/v1/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/v1/me`

```bash
curl -s http://localhost:4000/v1/me -H "Authorization: Bearer $TOKEN"
```

## Users

| Method | Path | Roles |
|---|---|---|
| GET | `/v1/users` | AD, BOD |
| GET | `/v1/users/:id` | AD, BOD |

## Orders (Programs)

PM sees only `ownerUserId = self`. DH is scoped to their `departmentId`.

### GET `/v1/orders`

```bash
curl -s "http://localhost:4000/v1/orders?page=1&pageSize=50" \
  -H "Authorization: Bearer $TOKEN"
```

Query: `page`, `pageSize` (max 200), `customerId`, `departmentId`, `q` (matches `orderNumber`).

### POST `/v1/orders`  (AD, PM)

```bash
curl -sX POST http://localhost:4000/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "orderNumber":"ORD-2026-0001",
    "customerId":"<uuid>",
    "departmentId":"<uuid>",
    "type":"NEW",
    "productCategory":"CONNECTIVITY",
    "contractValue":1500000000,
    "otcAmount":250000000,
    "mrcAmount":15000000,
    "capexBudget":400000000,
    "startDate":"2026-04-20",
    "endDate":"2026-12-31"
  }'
```

Business rule: `endDate >= startDate` else `409 BUSINESS_RULE`.

### GET `/v1/orders/:id`

Returns the order with nested `sos -> sows` summary.

## Sites

FE sees only sites where `assignedFieldUserId = self`.

### GET `/v1/sites`

```bash
curl -s "http://localhost:4000/v1/sites?sowId=<uuid>" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/v1/sites/:id`

```bash
curl -s http://localhost:4000/v1/sites/<uuid> \
  -H "Authorization: Bearer $TOKEN"
```

Returns the site, its parent SOW, ordered milestones, and assigned field user.

### POST `/v1/sites`  (AD, PM)

```bash
curl -sX POST http://localhost:4000/v1/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "sowId":"<uuid>",
    "code":"JKT-NE-001",
    "name":"Sudirman Tower NE",
    "type":"NE",
    "owner":"CUSTOMER",
    "city":"Jakarta",
    "province":"DKI",
    "latitude":-6.2089,
    "longitude":106.8221,
    "assignedFieldUserId":"<uuid>"
  }'
```

## Milestones

### PATCH `/v1/milestones/:id`  (AD, PM, FE)

State-machine guarded. Triggers BullMQ `recompute:{sowId}`.

Allowed transitions:
- `NOT_STARTED -> IN_PROGRESS | BLOCKED`
- `IN_PROGRESS -> DONE | BLOCKED`
- `BLOCKED   -> IN_PROGRESS`
- `DONE      -> (locked)`

Rules:
- `status=DONE` requires `actualDate`.
- Backdating `actualDate` more than 30 days returns `409 BUSINESS_RULE` (DH approval token = Phase 2).
- FE may only patch milestones whose site is assigned to them.

```bash
curl -sX PATCH http://localhost:4000/v1/milestones/<uuid> \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "status":"DONE",
    "actualDate":"2026-04-20",
    "remark":"Signed off by site lead"
  }'
```

## Imports (Excel)

### POST `/v1/imports/excel`  (AD)

`multipart/form-data`, single `.xlsx?` file, max 25 MB. Returns `202` with `importJobId`. Identical files (SHA-256) return `409 duplicate`. Worker stages rows into `ImportRow`. **Commit step is Phase 2** (preview/diff to entities not yet implemented).

```bash
curl -sX POST http://localhost:4000/v1/imports/excel \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./Draft_Dashboard.xlsx"
```

### GET `/v1/imports` and `/v1/imports/:id`

Poll job status (`UPLOADED` -> `PARSING` -> `VALIDATED` / `FAILED`).

```bash
curl -s http://localhost:4000/v1/imports/<jobId> \
  -H "Authorization: Bearer $TOKEN"
```

See [excel-import.md](excel-import.md) for sheet/column mapping.

## Reports

### GET `/v1/reports/bod`  (AD, BOD, DH)

Cached 60 s in Redis. Field `cacheStatus` is `HIT` or `MISS`.

```bash
curl -s http://localhost:4000/v1/reports/bod \
  -H "Authorization: Bearer $TOKEN"
```

Response (truncated):
```json
{
  "totalRevenue": "12500000000.00",
  "revenueAtRisk": "850000000.00",
  "onTrackPercent": 78.4,
  "rfsMonthPlan": 22, "rfsMonthActual": 17, "overdueCount": 5,
  "statusDistribution": { "onTrack": 64, "atRisk": 12, "delay": 5 },
  "departments": [{ "departmentCode":"ENT", "onTrack":40, "atRisk":3, "delay":1 }],
  "generatedAt": "2026-04-20T03:14:00.000Z",
  "cacheStatus": "MISS"
}
```

### GET `/v1/reports/department/:id`  (AD, BOD, DH)

Funnel: count, overdue, avg days per milestone stage.

## Sync (Mobile)

### POST `/v1/sync/pull`  (FE, PM, AD)

```bash
curl -sX POST http://localhost:4000/v1/sync/pull \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"since":"2026-04-19T00:00:00Z","scope":"mine"}'
```

Returns `{ serverTimeUtc, nextToken, entities: { sites, milestones }, tombstones: [] }`.

### POST `/v1/sync/push`  (FE, PM, AD)

Batch up to 50 items. Each item is keyed by `clientId` (idempotent). Per-item result: `ACCEPTED`, `REJECTED_STALE` (with `serverState`), or `REJECTED_INVALID`.

```bash
curl -sX POST http://localhost:4000/v1/sync/push \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "items":[{
      "clientId":"c8f1...-uuid",
      "entity":"Milestone",
      "entityId":"<uuid>",
      "op":"UPSERT",
      "payload":{"status":"DONE","actualDate":"2026-04-20","remark":"installed"},
      "clientUpdatedAt":"2026-04-20T05:30:00Z"
    }]
  }'
```

## Notifications

| Method | Path | Roles |
|---|---|---|
| GET | `/v1/notifications` | any (self-scoped) |
| POST | `/v1/notifications/:id/read` | any (self-scoped) |

## Audit

| Method | Path | Roles |
|---|---|---|
| GET | `/v1/audit` | AD |

## Phase 2 stubs (return `501 NOT_IMPLEMENTED`)

`/v1/sos*`, `/v1/sows*`, `/v1/vendors*`, `/v1/field-updates`, `/v1/claims*`.
