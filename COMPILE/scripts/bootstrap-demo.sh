#!/usr/bin/env bash
# bootstrap-demo.sh — One-shot DeliverIQ demo bring-up (macOS / Linux / WSL)
#
# Prerequisites: Docker Desktop (or Docker Engine + Compose v2), Node.js 20+

set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> DeliverIQ demo bring-up (root: $ROOT)"

[ -f .env ] || cp .env.example .env
echo "[ok] .env present"

echo "==> Starting infra containers (postgres/redis/minio/adminer)..."
docker compose up -d postgres redis minio adminer
sleep 8

echo "==> Generating Prisma client..."
npx prisma generate --schema src/database/prisma/schema.prisma

echo "==> Applying Prisma migrations..."
npx prisma migrate dev --name init --schema src/database/prisma/schema.prisma --skip-seed

echo "==> Seeding demo dataset..."
npm run prisma:seed

cat <<EOF

===================================================================
 DeliverIQ infra + DB are ready. Now start the apps in two terminals:
   npm run dev:backend     # API on http://localhost:3600
   npm run dev:frontend    # Web on http://localhost:3601
===================================================================
 Adminer:        http://localhost:3606
 MinIO console:  http://localhost:3605

 Demo logins (password: Passw0rd! ; admin uses ChangeMe!2026):
   admin@deliveriq.local
   bod@deliveriq.local           dh.ent@deliveriq.local
   dh.pres@deliveriq.local       pm1@deliveriq.local
   pm2@deliveriq.local           field1@deliveriq.local
   field2@deliveriq.local        finance@deliveriq.local
===================================================================
EOF
