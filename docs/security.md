# Security

Full review: [.artifacts/09-security-review.md](../.artifacts/09-security-review.md).
This page is the operational summary.

## 1. Authentication

- Bcrypt password hashing, cost from `BCRYPT_COST` (default 12).
- JWT with **two namespaces**:
  - access: secret `JWT_SECRET`, TTL `JWT_ACCESS_TTL` (15 min default).
  - refresh: secret `JWT_REFRESH_SECRET`, TTL `JWT_REFRESH_TTL` (7 d default).
- Refresh tokens are persisted (`RefreshToken{userId, tokenHash=jti, expiresAt, ip, userAgent}`) and **rotated** (revoke old + issue new) on every `/v1/auth/refresh`.
- Lockout: 5 failed logins per email -> `lockedUntil = now + 15 min`. Per-IP and per-email token-bucket on `/v1/auth/login`.
- Bootstrap admin from env (`SEED_ADMIN_*`) on first boot. Rotate immediately per environment.

## 2. Authorisation (RBAC)

`requireAuth` + `requireRole(...)` on every mutating route. Row-level scoping:

| Role | Scope |
|---|---|
| PM | `Order.ownerUserId = self` |
| DH | `Order.departmentId = self.departmentId` |
| FE | `Site.assignedFieldUserId = self` (cascades to milestones + field updates) |

Detailed matrix: [rbac.md](rbac.md).

IDOR fixes applied (Tester findings):
- `PATCH /v1/milestones/:id` re-checks site ownership for FE.
- `POST /v1/sync/push` mirrors the same check for both `Milestone` and `FieldUpdate` items, plus the state-machine guard.

## 3. Input validation & error handling

- 100 % of mutating endpoints + path/query params validated with Zod.
- Failures return `400 VALIDATION_FAILED` with RFC 7807 envelope and per-field `errors[]`.
- Central error handler scrubs stack traces from response body; only `requestId` is returned. Stack is logged with redaction.

## 4. Transport / headers

- nginx (prod) terminates TLS 1.2 / 1.3, HSTS, per-IP rate limits.
- Backend sets: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, conditional HSTS.
- CORS strict allowlist from `CORS_ORIGINS`.
- Frontend (Next.js) ships baseline CSP + COOP + Permissions-Policy; `poweredByHeader: false`. CSP currently allows `'unsafe-inline'` for scripts -> follow-up: replace with nonces.

## 5. OWASP Top 10 (2021)

Status snapshot (full evidence in [.artifacts/09-security-review.md](../.artifacts/09-security-review.md)):

| # | Category | Status |
|---|---|---|
| A01 Broken Access Control | Mitigated (after IDOR fixes) |
| A02 Cryptographic Failures | Partial — bcrypt + dual JWT signers; rotate secrets via Vault/SSM |
| A03 Injection | Mitigated — Prisma parameterises; one `$queryRaw` (`SELECT 1`) with no user input; no `dangerouslySetInnerHTML`; no `child_process` |
| A04 Insecure Design | Mitigated — STRIDE, RBAC matrix, idempotent sync, state machine |
| A05 Security Misconfiguration | Partial — headers + CORS + CSP added; CSP nonce + `trustProxy` CIDR pending |
| A06 Vulnerable Components | Partial — current majors; commit lockfile + Dependabot + `npm audit` in CI |
| A07 AuthN | Mitigated — bcrypt, lockout, refresh rotation, dual JWT signers; password-strength + MFA on roadmap |
| A08 Integrity | Partial — SHA-256 import dedup, idempotent BullMQ jobs; sign images, lockfile commit |
| A09 Logging & Monitoring | Mitigated — pino redaction, request-id, audit on every write incl. login outcome |
| A10 SSRF | Mitigated — no user-controlled outbound; webhooks not implemented |

## 6. Audit log

Append-only:
- Application: only `auditLog.create` is called from any module.
- Database: Postgres trigger denies `UPDATE` and `DELETE` on `AuditLog` (defence-in-depth).

`GET /v1/audit` is AD-only.

## 7. File uploads

- Only multipart route: `POST /v1/imports/excel`, AD-only, `.xlsx?` filter, 25 MB cap, SHA-256 dedup.
- ExcelJS reads cells as data; macros are not executed.
- Photo upload (Phase 2) will use per-user pre-signed S3 PUT URLs, server-side EXIF strip, `Content-Type` allowlist.

## 8. Pre-prod checklist

Pre-prod blockers from Security review:

- [ ] Replace in-process rate limiter with **Redis-backed** for multi-replica deploys.
- [ ] Rotate `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SEED_ADMIN_PASSWORD` to 32-byte random in SSM/Vault.
- [ ] Tighten CSP: replace `'unsafe-inline'` with nonces.
- [ ] Lock `trustProxy` to known proxy CIDR.
- [ ] Cap import worker rows (`IMPORT_MAX_ROWS`, `IMPORT_MAX_CELL_BYTES`).
- [ ] Migrate web auth to httpOnly cookie BFF (move tokens out of `localStorage`).
- [ ] Mobile cert pinning for prod build.
- [ ] Commit `package-lock.json`, enable Dependabot, gate `npm audit --omit=dev --audit-level=high` in CI.

## 9. Reporting a vulnerability

Email security@deliveriq.local with reproduction steps. Do not open public issues for security defects. SLA: ack within 1 business day.
