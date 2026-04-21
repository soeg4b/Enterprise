# Observability

PDC Enterprise ships structured logs, health probes, and a baseline Prometheus + Grafana + Loki stack.

## 1. Health endpoints

| Endpoint | Purpose | Probe |
|---|---|---|
| `GET /healthz` | Process liveness (always 200 if up) | LB / k8s liveness |
| `GET /readyz` | DB + Redis ping booleans | LB / k8s readiness |

Container-level Docker healthchecks are baked into both backend and frontend images.

## 2. Logging

- Backend: Pino JSON to stdout.
- Redaction (Security F3): `authorization`, `cookie`, `*.password*`, `accessToken`, `refreshToken`, `tokenHash`, `body.password`, `body.refreshToken`, `S3_SECRET_KEY`, `SEED_ADMIN_PASSWORD`, `set-cookie`, `x-api-key`.
- Every request gets `X-Request-Id` (echoed in response header and on every log line / error envelope).
- Promtail tails Docker logs -> Loki, labelled per service.

## 3. Metrics (planned)

Prometheus scrape config: [infra/monitoring/prometheus.yml](../infra/monitoring/prometheus.yml).

The backend `/metrics` endpoint is **not yet implemented** (Phase 2 follow-up). Once `prom-client` ships, it will expose:

- `http_requests_total{route, method, status}`
- `http_request_duration_seconds_bucket{...}`
- `bullmq_queue_depth{queue}`, `bullmq_job_duration_seconds`
- `auth_login_failures_total`

Grafana dashboard provisioned: [backend-overview.json](../infra/monitoring/grafana-provisioning/dashboards/files/backend-overview.json) (request rate, P95, 5xx %, queue depth).

## 4. Alerts

Rules pre-written in [infra/monitoring/alerts.yml](../infra/monitoring/alerts.yml). Severity routing:

| Severity | Channel | Examples |
|---|---|---|
| `critical` | PagerDuty | BackendDown, PostgresDown, MilestoneWorkerStalled |
| `high` | Slack `#deliveriq-oncall` | 5xx spike, latency, queue backlog, DB pool, login flood |
| `warning` | Slack `#deliveriq-ops` | misc thresholds |

Rules will activate once `/metrics` is live.

## 5. Tracing

OpenTelemetry through Fastify + Prisma + BullMQ is on the roadmap. `X-Request-Id` is the current correlation ID across logs and error envelopes.

## 6. Audit log

Append-only at two layers:
- App: only `auditLog.create` is called from any module (verified).
- DB: Postgres trigger denies `UPDATE`/`DELETE` on `AuditLog` (see [infra/docker/postgres-init.sql](../infra/docker/postgres-init.sql)).

`GET /v1/audit` (AD only) returns the chronological log; BigInt ids are serialised as strings.

## 7. External uptime

[infra/monitoring/health-check.sh](../infra/monitoring/health-check.sh) is a simple script that probes `/healthz` + `/readyz`. Wire it to your uptime-monitoring service (Pingdom, UptimeRobot, Cloudwatch Synthetics).

## 8. SLOs

See [deployment.md](deployment.md#10-slos).

## 9. Backups

- Daily `pg_dump` to S3/MinIO (30-day retention) via [infra/docker/postgres-backup.sh](../infra/docker/postgres-backup.sh).
- Monthly restore drill (see [infra/RUNBOOK.md](../infra/RUNBOOK.md) §7).
