# RBAC

Six roles, enforced at every mutating route via `requireAuth` + `requireRole(...)`. Definitions live in [src/backend/src/auth/auth.ts](../src/backend/src/auth/auth.ts) and per-route handlers in [src/backend/src/modules/](../src/backend/src/modules).

## 1. Roles

| Code | Persona | Default landing |
|---|---|---|
| `AD` | Admin | `/admin/users` |
| `BOD` | Board / Executives | `/portfolio` |
| `DH` | Department Head | `/dept` (own department) |
| `PM` | Project Manager | `/projects` (own SOWs) |
| `FE` | Field Engineer / Mitra | mobile `Today` |
| `FN` | Finance | `/finance/claims` |

## 2. Endpoint matrix

| Endpoint | AD | BOD | DH | PM | FE | FN |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `GET /v1/me`, `POST /v1/auth/logout` | Y | Y | Y | Y | Y | Y |
| `GET /v1/users(/:id)` | Y | Y | - | - | - | - |
| `GET /v1/orders` | Y (all) | Y (all) | Y (own dept) | Y (own as owner) | - | Y (all) |
| `POST /v1/orders` | Y | - | - | Y | - | - |
| `GET /v1/orders/:id` | Y | Y | scoped | scoped | - | Y |
| `GET /v1/sites` | Y | Y | Y | Y | Y (assigned only) | - |
| `POST /v1/sites` | Y | - | - | Y | - | - |
| `GET /v1/sites/:id` | Y | Y | Y | Y | Y (assigned) | - |
| `PATCH /v1/milestones/:id` | Y | - | - | Y | Y (assigned site) | - |
| `POST /v1/imports/excel` | Y | - | - | - | - | - |
| `GET /v1/imports(/:id)` | Y | - | - | - | - | - |
| `GET /v1/reports/bod` | Y | Y | Y | - | - | - |
| `GET /v1/reports/department/:id` | Y | Y | Y | - | - | - |
| `POST /v1/sync/pull`, `/push` | Y | - | - | Y | Y | - |
| `GET /v1/notifications` | Y | Y | Y | Y | Y | Y |
| `GET /v1/audit` | Y | - | - | - | - | - |
| `/v1/{sos,sows,vendors,field-updates,claims}*` | 501 | 501 | 501 | 501 | 501 | 501 |

## 3. Row-level scoping rules

| Role | Rule |
|---|---|
| `PM` | `Order.ownerUserId = self` (auto-applied in `GET /v1/orders`). |
| `DH` | `Order.departmentId = self.departmentId`. |
| `FE` | `Site.assignedFieldUserId = self`. Cascades to milestones (only via assigned site) and `FieldUpdate.siteId` (must be assigned). |

## 4. Server enforcement points

- Route guard: `requireRole('AD','PM','FE')` etc.
- IDOR fix: `PATCH /v1/milestones/:id` re-checks site ownership for FE; `POST /v1/sync/push` mirrors the same check for both `Milestone` and `FieldUpdate` items.
- Audit: every successful write -> `AuditLog` row (`actorUserId`, `before`, `after`, `ip`).

## 5. Token model

- Access JWT, TTL 15 min, namespace `default`, secret `JWT_SECRET`.
- Refresh JWT, TTL 7 d, namespace `refresh`, secret `JWT_REFRESH_SECRET`. Stored as `RefreshToken{userId, tokenHash=jti, expiresAt}`. Rotated (revoke + issue) on every `/v1/auth/refresh`.
- Lockout: 5 failed logins per email -> `lockedUntil = now + 15 min`.
- Password hashing: bcrypt, cost from `BCRYPT_COST` (default 12).

See [security.md](security.md) for full controls.
