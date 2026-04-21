# DeliverIQ — Operational Runbook

Audience: on-call engineers, DevOps, SRE.
Last updated: 2026-04-20.

---

## 0. On-call contacts

| Role | Primary | Secondary | Channel |
|---|---|---|---|
| DevOps lead | TBD (rotation) | TBD | `#deliveriq-oncall` |
| Backend owner | Coder lead | Backend SME | `#deliveriq-backend` |
| Data owner | Data lead | Backend lead | `#deliveriq-data` |
| Security | Security lead | DevOps lead | `#sec-incidents` |

PagerDuty schedule: `deliveriq-primary`. Incident severity definitions in
`docs/INCIDENT_SEVERITY.md` (TBD).

---

## 1. Deploy (staging)

Trigger:
1. Merge PR to `main` → `CI` workflow runs (must be green).
2. `Deploy — Staging` workflow runs automatically on `workflow_run.success`.
3. Or invoke manually: GitHub → Actions → `Deploy — Staging` → "Run workflow".

What it does:
- Builds & pushes `ghcr.io/<org>/backend:sha-<short>` and `frontend:sha-<short>`,
  tags `:staging`.
- Runs `prisma migrate deploy` against `STAGING_DATABASE_URL`.
- SSHes into staging host, `docker compose -f docker-compose.yml -f docker-compose.prod.yml pull && up -d`.
- Smoke-tests `STAGING_HEALTH_URL`.

Required GitHub secrets (per environment `staging`):
`STAGING_DATABASE_URL`, `STAGING_SSH_HOST`, `STAGING_SSH_USER`,
`STAGING_SSH_KEY`, `STAGING_DEPLOY_PATH`, `STAGING_HEALTH_URL`.

## 1b. Deploy (production)

Production uses the **same images** promoted from staging (no rebuild).

```sh
# On production deploy host:
cd /opt/deliveriq
export BACKEND_IMAGE=ghcr.io/<org>/backend:sha-<short>
export FRONTEND_IMAGE=ghcr.io/<org>/frontend:sha-<short>
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans
./infra/monitoring/health-check.sh
```

Promotion gate: at least 24h soak in staging + green smoke + 0 P1 alerts.

---

## 2. Rollback

Fast path (image revert):
```sh
cd /opt/deliveriq
export BACKEND_IMAGE=ghcr.io/<org>/backend:sha-<previous>
export FRONTEND_IMAGE=ghcr.io/<org>/frontend:sha-<previous>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
./infra/monitoring/health-check.sh
```

If a Prisma migration was applied:
1. Determine the failing migration: `npx prisma migrate status --schema=src/database/prisma/schema.prisma`.
2. Roll forward with a corrective migration (preferred).
3. Only restore from backup (§3) if data was corrupted; this loses changes since the dump.

Mark the rolled-back commit on GitHub with a `rollback/<sha>` tag and open an
incident postmortem within 48h.

---

## 3. Restore from backup

Backups: daily `pg_dump` (custom format) → `s3://$S3_BUCKET/backups/postgres/YYYY/MM/<db>-<ts>.dump`,
30-day retention. See [postgres-backup.sh](docker/postgres-backup.sh).

```sh
# 1. Provision new (empty) Postgres or quiesce app.
docker compose stop backend web

# 2. Pull dump
mc cp bk/$S3_BUCKET/backups/postgres/2026/04/deliveriq-20260420T020000Z.dump ./restore.dump

# 3. Restore (drop and recreate)
PGPASSWORD=*** psql -h $PGHOST -U postgres -c "DROP DATABASE IF EXISTS deliveriq;"
PGPASSWORD=*** psql -h $PGHOST -U postgres -c "CREATE DATABASE deliveriq OWNER deliveriq;"
PGPASSWORD=*** pg_restore -h $PGHOST -U deliveriq -d deliveriq --no-owner --no-privileges restore.dump

# 4. Re-apply role grants
psql -h $PGHOST -U postgres -d deliveriq -f infra/docker/postgres-init.sql

# 5. Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
./infra/monitoring/health-check.sh
```

**RPO**: 24h (daily snapshot). **RTO**: 4h.

PITR (point-in-time-recovery) is not in MVP scope. Roadmap: `wal-g` continuous
WAL archiving → S3, base backup nightly, RPO < 5 min, RTO < 30 min.

---

## 4. Scale workers

Workers currently run **in-process** with the API (Coder roadmap item).
Until split, scaling the API also scales workers.

Horizontal:
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale backend=4
```

When workers are split into a dedicated container:
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale worker=N
```

BullMQ concurrency knobs (env on backend container):
- `MILESTONE_WORKER_CONCURRENCY` (default 4)
- `IMPORT_WORKER_CONCURRENCY` (default 1 — keep low; ExcelJS is CPU-bound)

---

## 5. Rotate JWT / refresh secrets

Quarterly rotation, or immediately on suspected compromise.

```sh
NEW_JWT=$(openssl rand -base64 48 | tr -d '\n')
NEW_REF=$(openssl rand -base64 48 | tr -d '\n')
aws ssm put-parameter --name /deliveriq/prod/JWT_SECRET         --type SecureString --overwrite --value "$NEW_JWT"
aws ssm put-parameter --name /deliveriq/prod/JWT_REFRESH_SECRET --type SecureString --overwrite --value "$NEW_REF"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate backend
```

Effect:
- All in-flight access tokens immediately invalid (clients get 401, refresh attempt also fails).
- All refresh tokens invalid → users must log in again. **Notify users in advance.**
- For zero-downtime rotation, support dual-secret verification (roadmap item).

---

## 6. Common alerts → response

### `BackendDown`
1. `docker compose ps` — check container status.
2. `docker logs deliveriq-backend --tail 200`.
3. If crash-loop: roll back to previous image (§2).

### `BackendHigh5xxRate`
1. Grafana → "DeliverIQ — Backend Overview" → identify offending route.
2. Loki: `{service="backend"} | json | level="error"` filtered to last 30m.
3. If single route, consider feature-flag disable; else roll back.

### `BullMQQueueBacklog` / `MilestoneWorkerStalled`
1. `docker exec deliveriq-redis redis-cli LLEN bull:milestone:wait`.
2. Check Redis health: `redis-cli INFO replication`.
3. Restart backend (workers): `docker compose restart backend`.
4. If recurring, scale (§4).

### `LoginFailureSpike` (brute force)
1. Loki: `{service="backend"} |= "LOGIN ok=false"` group by IP.
2. Add IP to nginx `deny` list or upstream WAF.
3. Verify rate-limit + lockout still active in app logs.

### `DBConnectionPoolSaturated`
1. `SELECT * FROM pg_stat_activity WHERE state='active' ORDER BY query_start;`
2. Kill long-running queries: `SELECT pg_terminate_backend(pid);`.
3. Reduce backend pool: set `DATABASE_POOL_MAX` (Prisma URL `connection_limit`).

### `PostgresDown`
1. `docker compose logs postgres --tail 200`.
2. Disk full? See `node_filesystem_avail_bytes`.
3. Restore from backup if data dir corrupted (§3).

---

## 7. Routine ops

| Task | Cadence | Command |
|---|---|---|
| Verify backups | Weekly | `mc ls bk/$S3_BUCKET/backups/postgres/$(date +%Y/%m)/` |
| Test restore | Monthly | Restore latest dump into `deliveriq_restore_test`, run smoke |
| Rotate secrets | Quarterly | §5 |
| `npm audit` review | Weekly | CI report + Dependabot PRs |
| Trivy scan review | Weekly | CI report |
| Cert renewal | Auto (Let's Encrypt 60d) | `certbot renew && docker compose exec nginx nginx -s reload` |

---

## 8. Useful commands

```sh
# Tail backend logs (json, pretty)
docker logs -f deliveriq-backend | jq -r '"\(.time) \(.level) \(.reqId // "-") \(.msg)"'

# Show top routes by latency (last 5m, requires metrics endpoint)
curl -s http://prometheus:9090/api/v1/query --data-urlencode \
  'query=topk(5, histogram_quantile(0.95, sum by (le, route)(rate(http_request_duration_seconds_bucket[5m]))))'

# Open psql to staging
docker compose exec postgres psql -U deliveriq -d deliveriq

# Force a manual recompute for one SOW
docker compose exec backend node -e "require('./dist/queues/queues').milestoneQueue.add('recompute', {sowId:'<id>'}, {jobId:'recompute:<id>'})"
```
