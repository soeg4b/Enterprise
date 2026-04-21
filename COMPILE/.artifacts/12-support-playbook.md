# 12 — Support Playbook: DeliverIQ (Enterprise Project Delivery Dashboard)

**Author:** Support (Stage 12 — final)
**Date:** 2026-04-20
**Inputs consumed:** [`.artifacts/01-creator-vision.md`](01-creator-vision.md) → [`.artifacts/11-documentation.md`](11-documentation.md), [`infra/RUNBOOK.md`](../infra/RUNBOOK.md), [`infra/SECRETS.md`](../infra/SECRETS.md), [`docs/api.md`](../docs/api.md), [`docs/observability.md`](../docs/observability.md).
**Outputs produced:** This document.
**Pipeline status:** **COMPLETE** (Stage 12 of 12).
**Final decision:** **CONDITIONAL GO** for production — pilot/staging green-lit, production blocked on the four pre-prod items in §14.

---

## 1. Application Overview for Support

DeliverIQ is the enterprise project-delivery dashboard replacing the shared
"Draft Dashboard.xlsx". Six personas (BOD, DH, PM, FE/Mitra, FN, AD) consume
the same backend over web (Next.js) and mobile (Expo). All writes are audited;
all reads are RBAC-scoped.

### 1.1 Services and health endpoints

| Service | Container | Port (internal) | Health | Notes |
|---|---|---|---|---|
| Backend API | `deliveriq-backend` | 3600 | `GET /healthz`, `GET /readyz` | Fastify; workers run in-process (MVP) |
| Web (Next.js) | `deliveriq-web` | 3000 | `GET /` (200) | SSR + CSR mix |
| Mobile | n/a (clients) | n/a | n/a | Expo build; talks to backend `/v1/*` |
| Postgres 16 | `deliveriq-postgres` | 5432 | `pg_isready` | Source of truth |
| Redis 7 | `deliveriq-redis` | 6379 | `redis-cli ping` | BullMQ + cache + rate-limit (single-node MVP) |
| MinIO / S3 | `deliveriq-minio` | 9000 | `/minio/health/live` | Imports, photos (Phase 2), exports, backups |
| nginx (prod overlay) | `deliveriq-nginx` | 80/443 | `GET /healthz` | TLS, HSTS, rate limits |
| Prometheus / Loki / Grafana | observability stack | 9090/3100/3000 | service health | Backend `/metrics` endpoint pending (Coder) |

### 1.2 Critical user journeys (must monitor)

1. **Login** (`POST /v1/auth/login` → `POST /v1/auth/refresh`) — all personas.
2. **BOD portfolio dashboard** (`GET /v1/reports/bod`, cached 60 s).
3. **PM milestone update** (`PATCH /v1/milestones/:id` → BullMQ recompute → SOW progress).
4. **Field mobile sync** (`POST /v1/sync/pull`, `POST /v1/sync/push`).
5. **AD Excel import** (`POST /v1/imports/excel` → BullMQ import job → commit).
6. **Notifications** (`GET /v1/notifications` + email digest 07:00 WIB).

### 1.3 Dependencies

- **Internal**: Postgres, Redis, MinIO/S3, SMTP relay (digest).
- **External (MVP)**: Let's Encrypt (cert renewal), GHCR (image pulls on deploy).
- **External (Phase 2)**: WhatsApp BSP, ERP/Finance, Geocoding — **not live**, do not promise.

### 1.4 Environments

| Env | URL | Deploy | Data | Secrets |
|---|---|---|---|---|
| Local dev | `http://localhost:3000` | `docker compose up` | seed | `.env` |
| Staging | `https://staging.deliveriq.<corp>` | auto on `main` green | refreshed weekly from prod-anonymized | AWS SSM `/deliveriq/staging/*` |
| Production | `https://deliveriq.<corp>` | manual approval (GitHub Env) | live | AWS SSM `/deliveriq/prod/*` |

Default first-login (staging only): `admin@deliveriq.local` / `ChangeMe!2026`.
Operator MUST rotate on first prod boot — see [`infra/RUNBOOK.md` §5](../infra/RUNBOOK.md).

---

## 2. Severity Classification (SLA / SLO Targets)

### 2.1 Severity matrix

| Sev | Definition | Examples (DeliverIQ-specific) | Response (ack) | Resolution / mitigation |
|---|---|---|---|---|
| **P1 — Critical** | Service unavailable for ≥1 persona, data loss/corruption, security breach, or BOD/AD unable to operate | • `GET /v1/reports/bod` 5xx > 5 min<br>• `/healthz` red on prod<br>• Postgres down<br>• Mass auth failure (all logins 401)<br>• Confirmed data leak / IDOR exploited<br>• Excel import corrupts SOW data | **30 min** (24×7) | **4 h** |
| **P2 — High** | Significant degradation, single feature broken, single dept blocked, perf SLO breached >30 min | • Mobile sync push 5xx for one role<br>• BullMQ milestone backlog > 1 000<br>• P95 latency > 2 s sustained<br>• Notifications worker stalled<br>• AD cannot run import (one job class) | **2 h** (business hours) | **1 business day** |
| **P3 — Medium** | Single user / minor feature; workaround exists | • Single user cannot log in (locked)<br>• Mobile sync conflict UX confusing<br>• Wrong % shown briefly (cache stale)<br>• Backdate >30 d rejected as designed but user confused<br>• Cosmetic / copy bugs | **1 business day** | **3 business days** |
| **P4 — Low** | Question, enhancement, training | • "How do I export?" / "Where is map view?" (Phase 2)<br>• Phase-2 features requested<br>• Documentation gaps | **Best-effort** | Backlog |

### 2.2 Impact assessment

Pick the **highest** matching row:

- **Blast radius** — all users / one role / one dept / one user.
- **Revenue/finance exposure** — affects claim/CAPEX numbers? auto-escalate +1.
- **Data integrity** — write path? audit trail? auto-escalate +1.
- **Security** — confirmed unauthorized access or PII exposure → P1 always.
- **Time of day** — BOD viewing window 07:00–09:00 WIB → +1 for any reports/* incident.

### 2.3 Escalation triggers

- P1 not acked in 30 min → page DevOps secondary + engineering on-call.
- P1 not mitigated in 2 h → page Tech Lead + Security lead.
- Repeat P2 of the same class within 7 d → promote to P1 on next occurrence.

---

## 3. Support Model

### 3.1 Tiers

| Tier | Owner | Scope | Tools |
|---|---|---|---|
| **T1 — Helpdesk** | Internal helpdesk / BU ops | Account/login, password reset, "how do I", Phase-2 questions, basic triage, ticket creation | KB, in-app screenshots, [`docs/user-guide-*`](../docs/user-guide-bod.md) |
| **T2 — Operations / SRE** | DevOps on-call | Restart services, flush cache, re-run jobs, restore from backup, rotate secrets, runbook execution | [`infra/RUNBOOK.md`](../infra/RUNBOOK.md), Grafana, Loki, `docker compose`, SSM |
| **T3 — Engineering** | Backend / Mobile / Frontend leads | Source-level diagnosis, code fix, hotfix release, schema/data fix | Git, repo access, prod read replica (where exists) |

### 3.2 Hours

- **T1**: Mon–Fri 07:00–19:00 WIB; Sat 08:00–14:00 (limited).
- **T2 (on-call)**: 24×7 rotation, primary + secondary.
- **T3**: Business hours; on-call **only** for P1 incidents not mitigated by T2.

### 3.3 On-call rotation outline

- **Cadence**: weekly handover Mondays 10:00 WIB.
- **Roster**: minimum 4 engineers in rotation; max 1 week primary / quarter.
- **Compensation**: per internal policy (off-hours overtime / TOIL).
- **Handover checklist**: open incidents, alerts firing, deployments planned this week, secrets/cert expiry within 14 d, backup-restore drill status.
- **PagerDuty schedule**: `deliveriq-primary`, `deliveriq-secondary` (see [`infra/RUNBOOK.md` §0](../infra/RUNBOOK.md)).

### 3.4 Channels

| Channel | Use | SLA gate |
|---|---|---|
| **In-app** ("Help" → "Report an issue") | Default for end-users; pre-fills request id, browser, app version | Tracked |
| **Email** `support@deliveriq.<corp>` | External / mitra users; auto-creates ticket | Tracked |
| **WhatsApp** broadcast `+62 …` (T1 only) | Field engineers (low bandwidth, photo evidence) | Tracked once T1 logs the ticket |
| **Slack `#deliveriq-support`** | Internal triage | Internal only |
| **Slack `#deliveriq-oncall`** | Page channel; alerts route here | 24×7 on-call |
| **Status page** `https://status.deliveriq.<corp>` | Customer comms during incidents | P1/P2 only |

---

## 4. Triage Checklist (T1 must collect before escalating)

Open the ticket only after the following are captured:

1. **Who**: user email + role (BOD/DH/PM/FE/FN/AD) + department.
2. **What**: one-line summary + expected vs actual.
3. **When**: timestamp (WIB) of first occurrence; intermittent or persistent?
4. **Where**:
   - **Web**: URL, browser + version (Chrome/Edge/Safari), OS.
   - **Mobile**: app version (Settings → About), OS + version, online/offline at the time, last successful sync time.
5. **Repro steps**: numbered, minimal.
6. **Evidence**:
   - Screenshot / screen recording (mobile: shake → "Report bug" attaches diagnostic).
   - **Request ID** (`X-Request-Id` header / shown in error toast / in mobile sync log).
   - Error code from RFC 7807 envelope (`code`, `title`, `detail`).
7. **Scope**: only this user? same dept? everyone? (T1 quick check on 2 other accounts where possible.)
8. **Recent changes**: did anything change for the user (new device, password reset, role change) in the last 24 h?
9. **Workaround tried**: hard refresh / re-login / re-install / wait-and-retry.

T1 then assigns **provisional severity** (§2) and routes:
- P1/P2 → page T2 immediately + write status-page draft.
- P3 → ticket in queue, KB link if available.
- P4 → KB link + close as resolved-with-info.

---

## 5. Common Issues and Solutions

> Always grab the **request id** first; almost every step below depends on it.

### 5.1 Cannot login

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 UNAUTHENTICATED`, "Invalid credentials" | Wrong password | T1: trigger password reset (AD only path in MVP). |
| `423 LOCKED` / "Account temporarily locked" | 5+ failed attempts → 15-min lockout | Wait 15 min, or AD: `UPDATE users SET failed_login_count=0, locked_until=NULL WHERE email='...';` |
| Login OK but next request 401 | Access token expired (15 min) and refresh failed | Check `/v1/auth/refresh` response. If `INVALID_TOKEN` → user must re-login. If consistent across users → JWT secrets just rotated (see [§6.4](#64-rotate-jwt-secrets)) — expected, communicate. |
| Login OK on web, fails on mobile only | **Time skew** on device > 60 s vs server (JWT iat/exp) | User: enable "Set automatically" date/time. Confirm via mobile diagnostics screen. |
| All users 401 simultaneously | JWT secret rotated without dual-secret support, or `JWT_SECRET` missing in env | T2: verify SSM param exists; restart backend; if rotation in progress, broadcast notice. |
| Refresh 401 only | Refresh token revoked (logout-all, password change, secret rotation) | Re-login. |

### 5.2 Excel import fails

Reference: [`docs/excel-import.md`](../docs/excel-import.md), [`infra/RUNBOOK.md` §8`](../infra/RUNBOOK.md).

| Symptom | Likely cause | Fix |
|---|---|---|
| `400 VALIDATION_FAILED` immediately | Wrong file extension / not `.xlsx` / `.xlsm` | Re-save as `.xlsx`. |
| `413 PAYLOAD_TOO_LARGE` | File > 25 MB | Split sheets; remove embedded images; or T2 raises `IMPORT_MAX_BYTES` (review). |
| `409 DUPLICATE_IMPORT` | SHA-256 of file already imported (idempotency) | Intentional; if a true re-run is needed, T2 deletes the prior `Import` row OR add a trivial whitespace edit and resave. |
| Job stuck in `QUEUED` > 5 min | Worker not draining (in-process w/ backend) | T2: `docker compose restart backend`; check `MILESTONE_WORKER_CONCURRENCY` / `IMPORT_WORKER_CONCURRENCY`. |
| Job `FAILED` with malformed-row errors | Header alias mismatch / mandatory column missing | Open the validation report from `GET /v1/imports/:id`; fix sheet; re-upload. |
| Job `FAILED` "duplicate key" on commit | `orderNumber` / `sowNumber` collision with existing row | Decide: skip, update, or rename in source sheet (no auto-merge in MVP). |
| Worker OOM on giant sheet | Row count cap not yet enforced (SEC-NEW-07 — open) | T2: kill job (`bullmq` UI / Redis CLI), ask user to split sheet < 100 k rows. **Pre-prod fix pending.** |

Re-run a failed import job: see [§6.3](#63-re-run-a-failed-import-job).

### 5.3 Mobile not syncing

| Symptom | Likely cause | Fix |
|---|---|---|
| "Offline" badge persists when WiFi present | Backend unreachable (DNS / cert / firewall) | User: pull-to-refresh on Sync screen. T2: confirm `/healthz` reachable from external. |
| Sync push returns 401 | Refresh token expired or device cleared keychain | Re-login on the app. |
| Sync push returns 403 `REJECTED_FORBIDDEN` | FE trying to update a site they are not assigned to (intentional, BUG-SEC-01 fixed) | AD: assign the user to the site (`Site.assignedFieldUserId`). |
| Sync push returns `REJECTED_INVALID` per item | State-machine violation (e.g., NOT_STARTED → DONE) | Walk user through valid transitions ([`docs/user-guide-field.md`](../docs/user-guide-field.md)). |
| Conflict notice shown | Server changed the same field after device's last pull | Pull → review server value → re-apply if still appropriate. Server wins by default in MVP. |
| Sync hangs at "Pushing 50 of N" | Batch > 50 rejected by Zod; client should chunk | Kill app, reopen — outbox replays in 50-item batches. If older app version lacks chunking, force-update. |

### 5.4 Photos not uploading  *(Phase 2 limitation)*

> **Important — communicate this verbatim:** "Photo evidence upload is a
> **Phase 2** feature and is not yet enabled in the production MVP. The mobile
> app may show a camera button, but the upload pipeline (S3 pre-signed PUT,
> EXIF strip, MIME allow-list) ships in Phase 2. Photo metadata captured today
> is **not** persisted — please do not rely on it as evidence."

If a user insists they uploaded photos before:
- Check `FieldUpdate` rows of kind `PHOTO` — only metadata exists, no S3 object.
- Document in KB and tag the ticket as **Phase 2 expectation gap**.

### 5.5 Milestone progress shows wrong %

Most often: BOD/PM dashboard read a stale cached aggregate.

1. Confirm the user's last update went through: `GET /v1/audit?entity=Milestone&entityId=...`.
2. Confirm the recompute job ran: Loki query in [§7](#7-log--metric-quick-queries).
3. **Flush BOD cache** ([§6.2](#62-flush-redis-bod-cache)).
4. Ask user to hard-refresh (Ctrl+F5) — Next.js may also hold an SSR cache.
5. If still wrong, T3: re-run a manual recompute for that SOW (see [`infra/RUNBOOK.md` §8`](../infra/RUNBOOK.md)):
   ```sh
   docker compose exec backend node -e "require('./dist/queues/queues').milestoneQueue.add('recompute', {sowId:'<id>'}, {jobId:'recompute:<id>'})"
   ```

### 5.6 BOD dashboard slow

Reference alert: `BackendHigh5xxRate`, `BullMQQueueBacklog`.

1. Grafana → "DeliverIQ — Backend Overview" → check P95 on `/v1/reports/bod`.
2. Cache **MISS** ratio: if cold/just-flushed, expect 1 slow request → 60 s of HITs.
3. **Queue backlog**: `docker exec deliveriq-redis redis-cli LLEN bull:milestone:wait`.
   - >1 000 → recompute storm (likely after import); scale workers ([`infra/RUNBOOK.md` §4`](../infra/RUNBOOK.md)).
4. **DB slow query**: `SELECT pid, now()-query_start AS dur, query FROM pg_stat_activity WHERE state='active' ORDER BY dur DESC LIMIT 5;`.
5. Stop-gap: extend BOD cache TTL temporarily (`BOD_CACHE_TTL_S`).

### 5.7 Notifications missing

1. Check the user's `Notification` table rows: `SELECT * FROM "Notification" WHERE "userId"='...' ORDER BY "createdAt" DESC LIMIT 20;`.
2. If empty: notification worker may be stalled.
   - Loki: `{service="backend"} |= "notification" |= "error"` last 30 min.
   - `redis-cli LLEN bull:notification:wait` and `:failed`.
   - **T2**: `docker compose restart backend` (workers in-process). Backlog will drain.
3. **Email digest** missing at 07:00 WIB:
   - Check `digest.scheduler` log line at 07:00.
   - SMTP failures show as `notification` worker errors with code `SMTP_*`.
4. WhatsApp not implemented in MVP — communicate Phase 2.

---

## 6. Standard Runbook Procedures

These mirror / reference [`infra/RUNBOOK.md`](../infra/RUNBOOK.md). Always execute as the deploy user on the prod host (or via approved bastion).

### 6.1 Restart backend / workers

```sh
cd /opt/deliveriq
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend
./infra/monitoring/health-check.sh
```

Workers are currently in-process with the backend (MVP). Once split, also:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart worker
```

### 6.2 Flush Redis BOD cache

```sh
# Targeted (safe — only the BOD aggregate)
docker compose exec redis redis-cli DEL "deliveriq:default:reports:bod"

# If unsure of the exact key
docker compose exec redis redis-cli --scan --pattern "deliveriq:*:reports:*" \
  | xargs -r docker compose exec -T redis redis-cli DEL
```

**Do NOT** `FLUSHALL` — it wipes BullMQ queues and rate-limit counters.

### 6.3 Re-run a failed import job

```sh
# 1. Identify the import id
docker compose exec backend node -e "require('./dist').prisma.import.findMany({where:{status:'FAILED'},orderBy:{createdAt:'desc'},take:5}).then(r=>console.log(r))"

# 2. Reset its status and re-enqueue (idempotent on jobId = import:<id>)
docker compose exec backend node -e "
const { prisma } = require('./dist');
const { importQueue } = require('./dist/queues/queues');
const id = '<IMPORT_ID>';
prisma.import.update({where:{id},data:{status:'QUEUED',error:null}}).then(()=>
  importQueue.add('import',{importId:id},{jobId:'import:'+id}));
"
```

For a corrupt job, T3 may need to delete the BullMQ job key:
```sh
docker compose exec redis redis-cli DEL "bull:import:<jobId>"
```

### 6.4 Rotate JWT secrets

Full procedure in [`infra/RUNBOOK.md` §5`](../infra/RUNBOOK.md). Summary:

```sh
NEW_JWT=$(openssl rand -base64 48 | tr -d '\n')
NEW_REF=$(openssl rand -base64 48 | tr -d '\n')
aws ssm put-parameter --name /deliveriq/prod/JWT_SECRET         --type SecureString --overwrite --value "$NEW_JWT"
aws ssm put-parameter --name /deliveriq/prod/JWT_REFRESH_SECRET --type SecureString --overwrite --value "$NEW_REF"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate backend
```

**User impact**: all sessions invalidated → users must re-login. Always announce
≥ 24 h in advance (template in §11.3). Dual-secret zero-downtime rotation is
on the roadmap (see §13).

### 6.5 Restore from backup

Full procedure: [`infra/RUNBOOK.md` §3`](../infra/RUNBOOK.md). Key facts:

- Daily `pg_dump` to `s3://$S3_BUCKET/backups/postgres/YYYY/MM/`, 30-day retention.
- **RPO 24 h, RTO 4 h** in MVP. Communicate this honestly to users.
- After restore: re-apply [`infra/docker/postgres-init.sql`](../infra/docker/postgres-init.sql) for role grants and audit-log immutability trigger.
- Run `./infra/monitoring/health-check.sh`, then notify users of any data loss window.

---

## 7. Log & Metric Quick Queries

### 7.1 Loki / LogQL

```logql
# Find a single request by id (paste from error toast / X-Request-Id)
{service="backend"} | json | reqId="<REQUEST_ID>"

# All 5xx in the last 15 min
{service="backend"} | json | level="error" | statusCode >= 500
| line_format "{{.time}} {{.reqId}} {{.statusCode}} {{.method}} {{.url}} {{.msg}}"

# Milestone worker errors (recompute storms, DB timeouts)
{service="backend"} | json | msg=~"milestone|recompute" | level="error"

# Import job failures (per import id)
{service="backend"} | json | msg=~"import" | (level="error" or status="FAILED")

# Login failures spike (potential brute-force) — group by IP in Grafana
{service="backend"} |= "LOGIN ok=false" | json

# Audit-write surface — confirm every PATCH was audited
{service="backend"} | json | msg="AUDIT" | actorUserId="<USER_ID>"
```

### 7.2 Prometheus (after backend `/metrics` ships — Coder follow-up)

```promql
# 5xx rate per route
sum by (route) (rate(http_requests_total{status=~"5.."}[5m]))

# P95 latency per route
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))

# BullMQ backlog
bullmq_queue_waiting{queue=~"milestone|import|notification"}

# Auth lockouts
increase(auth_login_failures_total[15m])
```

### 7.3 Postgres ad-hoc

```sql
-- Active long queries
SELECT pid, now()-query_start AS dur, state, left(query, 200)
FROM pg_stat_activity WHERE state='active' ORDER BY dur DESC LIMIT 10;

-- Locked rows
SELECT * FROM pg_locks WHERE NOT granted;

-- Last 50 audit events
SELECT "createdAt", action, "actorUserId", entity, "entityId"
FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 50;
```

---

## 8. Escalation Flow

```
T1 helpdesk
  │  triage (§4) → assign sev → KB?
  │  P3/P4 own; P1/P2 page →
  ▼
T2 DevOps on-call (PagerDuty `deliveriq-primary`)
  │  runbook (§6); restart / flush / re-enqueue
  │  if root cause needs code change OR not mitigated in 60 min →
  ▼
T3 Engineering on-call (per component)
  │  hotfix branch → cherry-pick → CI → deploy
  │  if blast radius widens (>1 dept, financial impact, security) →
  ▼
Tech Lead + Security Lead + Comms
   announce on status page; consider rollback (§ runbook)
```

### 8.1 When to wake DevOps / engineering on-call

Wake **immediately** (any hour) if **any** is true:
- `/healthz` red on prod ≥ 3 min.
- 5xx rate on `/v1/*` > 5 % over 5 min.
- Postgres or Redis container down on prod.
- Confirmed unauthorized access / data leak.
- BullMQ `milestone` or `import` queue depth > 5 000 and growing.
- Auth lockout / login-failure spike > 50 / min from one IP or > 200 / min globally.
- Backup job failed for the second consecutive day.

Wake **next business day** for P3 issues unless they recur.

### 8.2 Blast-radius criteria

| Radius | Action |
|---|---|
| 1 user | T1 ticket; no comms |
| 1 department or 1 role | Internal Slack notice; P2 |
| All users of one persona (e.g., all FEs cannot sync) | Status-page yellow + email; P1 |
| All users / data integrity / security | Status-page red + customer email + post-mortem mandatory; P1 |

### 8.3 Communication templates → see §11.

---

## 9. Post-Incident

### 9.1 Incident report template (file in `docs/incidents/YYYY-MM-DD-<slug>.md`)

```markdown
# Incident: <short title>
- **Date / time (WIB)**: start … detected … mitigated … resolved
- **Severity**: P1 | P2
- **Reporter**: <who/what alert>
- **Components**: backend / postgres / redis / web / mobile / nginx / …
- **User impact**: who, how many, what they couldn't do, financial impact (if any)
- **Detection**: alert | user report | manual check
- **Timeline (WIB)**:
  - HH:MM event 1
  - HH:MM event 2
  - …
- **Root cause**: …
- **Trigger**: deploy / config change / data event / external dependency / unknown
- **Mitigation**: what we did to stop the bleed (link to runbook step)
- **Resolution**: permanent fix (PR link)
- **What went well**:
- **What went poorly**:
- **Action items** (owner, ETA, ticket):
  - [ ] …
  - [ ] …
- **Linked tickets / PRs / dashboards**:
```

### 9.2 Blameless postmortem cadence

- Mandatory for **every P1**, within **5 business days** of resolution.
- Optional for P2; mandatory if same class recurs within 7 d.
- 60-min meeting: Engineering + DevOps + Support; Security if security-adjacent.
- Output: incident report (above) + action items in the issue tracker with owners + dates. Review action-item closure in monthly Ops review.

---

## 10. Bug Intake → Ticket Workflow

### 10.1 Labels

| Label | Meaning |
|---|---|
| `area/backend`, `area/web`, `area/mobile`, `area/data`, `area/infra` | Component |
| `module/<auth\|orders\|sites\|milestones\|sync\|imports\|reports\|notifications\|audit>` | Backend module |
| `type/bug`, `type/incident`, `type/enhancement`, `type/question` | Kind |
| `sev/P1` … `sev/P4` | Severity (mirrors §2) |
| `phase/mvp`, `phase/2`, `phase/3` | Roadmap phase |
| `regression` | Worked previously |
| `security` | Triggers Security review |
| `needs-repro`, `needs-info` | Awaiting reporter |
| `wontfix`, `duplicate`, `by-design` | Closure reasons |

### 10.2 Severity → support sev mapping

T1 severity (§2) maps 1:1 to the `sev/*` label. Engineering may downgrade with
written justification; T1 keeps the original severity in a comment for audit.

### 10.3 Workflow states

`new` → `triaged` → `assigned` → `in-progress` → `in-review` → `merged` →
`deployed-staging` → `verified-staging` → `deployed-prod` → `verified-prod` →
`closed`. Reopen if the verification fails.

### 10.4 Defect register format (continues Tester's [`08-tester-results.md`](08-tester-results.md))

```
ID: BUG-<MODULE>-<NN>
Title:
Severity: P1|P2|P3|P4
Status: open|in-progress|fixed|verified|closed
Found by: <stage / user>
First seen: <build / date>
Repro: <steps>
Expected / Actual:
Fix PR:
Verified by: <test id / manual>
```

Cross-reference open Tester / Security IDs:
- `BUG-CODE-01`, `BUG-AUTH-01`, `BUG-RL-01`, `BUG-INFRA-01`, `BUG-MS-01` (some
  fixed in Stage 9; the still-open ones are repeated in §13 as **Open risks**).

---

## 11. User Communication Templates

> All times in WIB. Keep customer-facing messages factual and short.

### 11.1 Outage notice (status page + in-app banner + email)

> **[INVESTIGATING] DeliverIQ — degraded service**
> Since **HH:MM WIB** we are seeing errors on **<feature, e.g., BOD dashboard / mobile sync>**. Other features remain available. We are investigating and will post the next update within **30 minutes**.

### 11.2 Fix-deployed notice

> **[RESOLVED] DeliverIQ — <feature> restored**
> The issue affecting **<feature>** between **HH:MM** and **HH:MM WIB** is now resolved. Root cause: **<one sentence>**. No data was lost. A full incident report will be published within 5 business days. Thank you for your patience.

### 11.3 Planned maintenance (≥ 48 h advance notice)

> **[SCHEDULED] DeliverIQ — maintenance window**
> On **<date>** between **HH:MM–HH:MM WIB** DeliverIQ will be **<unavailable | read-only | logged-out for re-login>** due to **<change, e.g., JWT secret rotation / database upgrade>**. Mobile users: please complete a sync **before** the window. Questions: `support@deliveriq.<corp>`.

### 11.4 Security advisory (P1 / data exposure only — coordinate with Security Lead first)

> **[SECURITY] DeliverIQ — action required**
> We identified **<short, factual description>** affecting **<scope>** between **<dates>**. We have **<mitigation taken>**. As a precaution, please **<re-login / change password / verify recent activity>**. We will share a full report by **<date>**.

### 11.5 Internal page (Slack `#deliveriq-oncall`)

> :rotating_light: **P1 — <component>** down/degraded since **HH:MM WIB**. Detected by **<alert/user>**. Primary on-call: @<name>. Bridge: <link>. Status page draft: <link>.

---

## 12. Knowledge Base Seed (publish at launch)

Populate the in-app Help Center with these articles. Each links to the relevant user guide / API doc.

1. **Logging in for the first time** (web + mobile) — see [`docs/user-guide-pm.md`](../docs/user-guide-pm.md).
2. **I forgot my password / my account is locked** — request via AD; 15-min auto-unlock.
3. **Why am I getting "session expired" every 15 minutes?** — JWT lifetime; refresh handled automatically; re-login if it persists.
4. **What does each milestone status mean? (NOT_STARTED / IN_PROGRESS / DONE / CANCELLED)** — link to [`docs/milestone-engine.md`](../docs/milestone-engine.md).
5. **Why can't I jump straight from NOT_STARTED to DONE?** — state machine, see milestone engine doc.
6. **How is "% Progress" calculated?** — weighted formula explainer.
7. **What does ON_TRACK / AT_RISK / DELAY mean?** — GAP-day thresholds.
8. **Why was my milestone update rejected with "REJECTED_FORBIDDEN"?** — site assignment; talk to your AD.
9. **How does mobile offline sync work?** — pull/push, conflict policy, link to [`docs/mobile.md`](../docs/mobile.md).
10. **Why is my mobile photo not in the system?** — Phase 2 limitation (§5.4).
11. **How do I import an Excel file?** (AD) — link to [`docs/excel-import.md`](../docs/excel-import.md), file size + format limits.
12. **My import said "duplicate" — what now?** — SHA-256 dedup explanation.
13. **Where is the map view / vendor portal / WhatsApp notification?** — Phase 2 roadmap.
14. **How do I change my dashboard time zone?** — fixed to WIB (Asia/Jakarta) in MVP.
15. **Where can I see who changed what?** — AD audit log endpoint and UI; users see history per entity.
16. **Status page & maintenance windows** — link to status page; subscription instructions.
17. **Reporting a bug** — what to include (mirror §4 triage checklist) + how to read the request id.

---

## 13. Open Risks Carried into Operations

These are inherited from Security ([`09-security-review.md`](09-security-review.md)) and DevOps ([`10-devops-pipeline.md`](10-devops-pipeline.md)). Support owns the **operational compensating controls** while engineering closes them.

| # | Risk | Compensating control during ops | Owner / closure |
|---|---|---|---|
| R1 | **Rate limiter is in-process** (BUG-RL-01). Multi-replica deploy degrades brute-force protection. | Run prod single-replica until fixed; nginx `limit_req_zone` `api_login=5r/min` is the real gate; alert on `LoginFailureSpike`. | Coder — pre-prod blocker |
| R2 | **JWT secret rotation is manual & user-disruptive** (no dual-secret support). | Always announce ≥ 24 h ahead (§11.3); rotate during low-traffic window. | Coder — roadmap |
| R3 | **No automated failover** (single Postgres, single Redis on prod overlay). | Daily backup verified weekly; monthly restore drill; RPO 24 h / RTO 4 h communicated. | DevOps — Phase 2 (Multi-AZ RDS, ElastiCache replica) |
| R4 | **Phase-2 features visibly absent** (photo upload, WhatsApp, ERP, map view). | KB articles 10/13; in-app "Phase 2" badges; T1 script: never promise an ETA. | PM |
| R5 | **Excel parser has no row cap** (SEC-NEW-07). | Document 100 k-row guideline; T2 kills runaway jobs; alert on import worker CPU > 80 % for 5 min. | Coder — pre-prod fix |
| R6 | **Web tokens in `localStorage`** (CQ-02 / SEC-NEW-04). | CSP active (F4); educate users not to install browser extensions on the corp profile. | Coder — roadmap (httpOnly via Next BFF) |
| R7 | **Mobile no TLS pinning** (SEC-NEW-05). | MDM-issued devices only; corp WiFi only for sensitive ops. | Coder — Phase 2 |
| R8 | **Backend `/metrics` not yet shipped** — alert rules dormant. | Until then, rely on Loki saved searches in §7.1 + manual Grafana checks. | Coder — pre-prod |
| R9 | **DONE is terminal** (BUG-MS-01). | T2 script for DB-level corrective update + audit row; require AD ticket. | SA + Coder |
| R10 | **Audit-log immutability is convention + DB trigger** (DevOps added trigger). Verify after every restore. | Restore checklist re-runs `postgres-init.sql`. | DevOps |

---

## 14. Handoff (back to Orchestrator)

**Inputs consumed**: All artifacts `.artifacts/01` through `.artifacts/11`, plus
`infra/RUNBOOK.md`, `infra/SECRETS.md`, `docs/api.md`, `docs/observability.md`,
`docs/user-guide-*`, `docs/excel-import.md`, `docs/mobile.md`.

**Outputs produced**: [`.artifacts/12-support-playbook.md`](12-support-playbook.md) (this document).

**Pipeline status**: **COMPLETE** — Stage 12 of 12.

### 14.1 Production-readiness summary

- **Architecture**: solid modular monolith; meets MVP scope.
- **Build / CI**: green; SBOM, gitleaks, Trivy, npm-audit gates in place.
- **Test coverage**: 69/69 vitest tests pass; E2E scaffolded; perf/ZAP/a11y nightly planned.
- **Security**: 4 critical fixes applied in Stage 9; 1 P1 (rate limiter) + 4 P2 still open.
- **Ops**: runbooks, dashboards, alert rules, backups exist; `/metrics` endpoint and managed Postgres failover are gaps.
- **Docs**: 17 docs covering all personas + dev + ops + security.
- **Support**: this playbook in place; KB seed defined; on-call rotation outlined (names TBD by org).

### 14.2 Must-fix-before-prod (cross-references)

| # | Item | Source | Owner |
|---|---|---|---|
| 1 | **Redis-backed rate limiter** (`@fastify/rate-limit` + ioredis store). Required for any multi-replica prod. | Security §7.2 / Tester BUG-RL-01 / DevOps §7.1 | Coder |
| 2 | **Vault/SSM-managed secrets** in production (no `.env` in image; rotate `SEED_ADMIN_PASSWORD`). | Security §7.2 / DevOps §6.3 / [`infra/SECRETS.md`](../infra/SECRETS.md) | DevOps |
| 3 | **`prisma generate` clean** (BUG-INFRA-01 — fix `fullTextSearchPostgres` preview-feature). Blocks CI typecheck + image build. | Tester §4 / Security §5.1 / DevOps §7.3 | Data + DevOps |
| 4 | **Backend `/metrics` endpoint** (`prom-client`) so DevOps alert rules activate. | DevOps §5.4 / §7.1 | Coder |
| 5 | **Excel parser caps** (`IMPORT_MAX_ROWS=200000`, per-cell length cap). | Security §7.2 (SEC-NEW-07) | Coder |
| 6 | **CSP nonce mode** (drop `'unsafe-inline'` for scripts). | Security SEC-NEW-03 | Coder (FE) |
| 7 | **TLS at LB + WAF rules + cert in place on prod host**. | DevOps §6.2 / §7.4 | DevOps |
| 8 | **Production environment review gate enabled** in GitHub Environments + branch protection on `main`. | DevOps §1.3 / §7.4 | DevOps |
| 9 | **CI grep test** asserting no `auditLog.update|delete` in `src/backend/**`. | Security §7.2 / QA TC-AUD-I-002 | QA |
| 10 | **On-call rotation populated** (names + PagerDuty) — currently TBD in [`infra/RUNBOOK.md` §0`](../infra/RUNBOOK.md). | This doc §3.3 | Org |

### 14.3 Recommended (not blocking) before first 100 active users

- Mobile cert pinning (SEC-NEW-05).
- Password-strength policy (SEC-NEW-12).
- `trustProxy` CIDR allowlist (SEC-NEW-13).
- DONE-reopen approval workflow (BUG-MS-01).
- Dual-secret JWT verification for zero-downtime rotation.

### 14.4 Final Go / No-Go

- **Pilot (≤ 50 users, single BU, single replica)**: **GO** — risks listed in §13 are acceptable with the stated compensating controls.
- **General Availability (multi-BU, multi-replica, external mitra access)**: **NO-GO** until items **1, 2, 3, 4, 7, 8** in §14.2 are closed and re-verified.

---

*End of pipeline. Stage 12 / 12 complete.*
