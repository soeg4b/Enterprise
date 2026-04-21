# =============================================================================
# bootstrap-demo.ps1 — One-shot DeliverIQ demo bring-up
#
# Prerequisites:
#   - Docker Desktop installed and running (https://www.docker.com/products/docker-desktop/)
#   - Node.js 20+ on PATH (already present)
#
# What it does:
#   1. Copies .env.example -> .env if missing
#   2. Starts Postgres + Redis + MinIO + Adminer via docker compose (3602/3603/3604/3605/3606)
#   3. Generates Prisma client
#   4. Runs Prisma migrate (creates schema)
#   5. Seeds the demo dataset (5 customers, 5 orders, 8 SOWs, 8 sites, claims, capex, notifications)
#   6. Starts the backend (port 3600) and web frontend (port 3601) in separate windows
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/bootstrap-demo.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> DeliverIQ demo bring-up (root: $root)" -ForegroundColor Cyan

# 1. .env
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "[ok] .env created from .env.example" -ForegroundColor Green
}

# 2. Docker compose — infra only
Write-Host "==> Starting infra containers (postgres/redis/minio/adminer)..." -ForegroundColor Cyan
docker compose up -d postgres redis minio adminer
Write-Host "[ok] Infra up. Waiting 8s for readiness..." -ForegroundColor Green
Start-Sleep -Seconds 8

# 3. Prisma generate
Write-Host "==> Generating Prisma client..." -ForegroundColor Cyan
npx prisma generate --schema src/database/prisma/schema.prisma | Out-Host

# 4. Migrate
Write-Host "==> Applying Prisma migrations..." -ForegroundColor Cyan
npx prisma migrate dev --name init --schema src/database/prisma/schema.prisma --skip-seed | Out-Host

# 5. Seed
Write-Host "==> Seeding demo dataset..." -ForegroundColor Cyan
npm run prisma:seed | Out-Host

# 6. Launch dev servers in new windows
Write-Host "==> Launching backend (port 3600) and web (port 3601)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$root`"; npm run dev:backend"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$root`"; npm run dev:frontend"

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Yellow
Write-Host " DeliverIQ demo is starting up." -ForegroundColor Yellow
Write-Host "===================================================================" -ForegroundColor Yellow
Write-Host " Web UI:        http://localhost:3601"
Write-Host " API health:    http://localhost:3600/healthz"
Write-Host " Adminer (DB):  http://localhost:3606  (server=postgres, user=deliveriq, pass=deliveriq, db=deliveriq)"
Write-Host " MinIO console: http://localhost:3605  (user=deliveriq, pass=deliveriq-dev)"
Write-Host ""
Write-Host " Demo logins (password: Passw0rd! ; admin uses ChangeMe!2026):"
Write-Host "   admin@deliveriq.local       (System Administrator)"
Write-Host "   bod@deliveriq.local         (Board portfolio view)"
Write-Host "   dh.ent@deliveriq.local      (Dept Head Enterprise)"
Write-Host "   dh.pres@deliveriq.local     (Dept Head PreSales)"
Write-Host "   pm1@deliveriq.local         (PM — owns PPO1/PPO2/PPO5)"
Write-Host "   pm2@deliveriq.local         (PM — owns PPO3/PPO4)"
Write-Host "   field1@deliveriq.local      (Field engineer — JKT/SBY/MDN/MKS-FE)"
Write-Host "   field2@deliveriq.local      (Field engineer — BDG/MKS-NE)"
Write-Host "   finance@deliveriq.local     (Finance / claims)"
Write-Host "===================================================================" -ForegroundColor Yellow
