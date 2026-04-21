# Secrets Management — DeliverIQ

Local dev uses a `.env` file. Staging and production **must not** ship a `.env`
inside the image — secrets must be loaded at container start from a managed
store. This document outlines the migration path.

---

## Sources of truth (priority order)

1. **AWS SSM Parameter Store** (recommended default — cheap, IAM-scoped, audited).
2. **AWS Secrets Manager** (use for credentials needing rotation: DB master, S3).
3. **HashiCorp Vault** (alternative if not on AWS; same patterns apply via `vault kv`).

Naming convention:
```
/deliveriq/{env}/{KEY}
e.g. /deliveriq/prod/JWT_SECRET
     /deliveriq/staging/DATABASE_URL
```

## Required production secrets

| Key | Source | Rotation |
|---|---|---|
| `JWT_SECRET` | SSM SecureString | Quarterly |
| `JWT_REFRESH_SECRET` | SSM SecureString | Quarterly |
| `DATABASE_URL` | Secrets Manager (auto-rotation) | 90 days |
| `REDIS_URL` | SSM SecureString | On compromise |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | IAM role (preferred) or Secrets Manager | 90 days |
| `SEED_ADMIN_PASSWORD` | SSM SecureString | First-boot only |
| `SMTP_PASSWORD` (future) | Secrets Manager | 90 days |

## Injection patterns

### A. Container `entrypoint` fetch (single host)
```sh
# /opt/deliveriq/load-secrets.sh
#!/bin/sh
set -eu
ENV=${ENV:-prod}
for k in JWT_SECRET JWT_REFRESH_SECRET DATABASE_URL REDIS_URL \
         S3_ACCESS_KEY S3_SECRET_KEY SEED_ADMIN_PASSWORD; do
  v=$(aws ssm get-parameter --with-decryption \
        --name "/deliveriq/$ENV/$k" --query 'Parameter.Value' --output text)
  printf '%s=%s\n' "$k" "$v"
done > /opt/deliveriq/.env.runtime
chmod 600 /opt/deliveriq/.env.runtime
```
Then in `docker-compose.prod.yml`, replace `env_file: .env` with `env_file: .env.runtime`.

### B. Vault Agent sidecar
Run `vault agent` with templates writing `/vault/secrets/.env` on a tmpfs and
mount into the backend container. Compose example:
```yaml
services:
  backend:
    volumes:
      - vault-secrets:/vault/secrets:ro
volumes:
  vault-secrets:
    driver_opts: { type: tmpfs, device: tmpfs }
```

### C. AWS ECS / Fargate
Use task definition `secrets[]` referencing SSM parameter ARNs — secrets are
materialised by the agent, never logged, never in the task definition body.

## Local development

`.env` (copied from `.env.example`) remains acceptable. Do **not** commit it —
already in `.gitignore`.

## Audit & rotation evidence

- Quarterly rotation tracked in `docs/SECURITY_LOG.md` (Operations to maintain).
- All `aws ssm put-parameter` calls produce CloudTrail events; alert on
  parameter changes outside the rotation runbook window.

## Forbidden

- ❌ Committing `.env`, `.env.production`, or any populated secret file.
- ❌ Echoing secrets in CI logs (`set +x` around any sensitive command).
- ❌ Baking secrets into Docker images (Trivy scans for high-entropy strings;
  CI fails on hits — see [trivy.yaml](ci/trivy.yaml)).
- ❌ Sharing secrets in chat or tickets — paste an SSM path instead.
