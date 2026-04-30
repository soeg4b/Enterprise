# DeliverIQ Enterprise — Deployment Guide

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Local Docker)](#quick-start-local-docker)
- [VPS Ubuntu Deployment](#vps-ubuntu-deployment)
- [Port Reference](#port-reference)
- [Default Credentials](#default-credentials)
- [Maintenance Commands](#maintenance-commands)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Docker Engine | 24+ |
| Docker Compose | v2.20+ |
| Node.js (for seeding only) | 18+ |
| Git | 2.x |

---

## Quick Start (Local Docker)

```bash
# 1. Clone and enter the project
git clone <repo-url> && cd Enterprise

# 2. Create environment file
cp .env.example .env
# Edit .env — at minimum change JWT_SECRET and JWT_REFRESH_SECRET

# 3. Build images
docker compose build

# 4. Start all services
docker compose up -d

# 5. Apply database migration
docker compose exec backend npx prisma migrate deploy --schema=prisma/schema.prisma

# 6. Seed demo data (from host, requires Node.js + npm install)
npx prisma generate --schema=src/database/prisma/schema.prisma
npm -w src/database run seed

# 7. Verify all containers are healthy
docker compose ps
```

---

## VPS Ubuntu Deployment

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin (if not included)
sudo apt install -y docker-compose-plugin

# Install Node.js 20 (for seed script only)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build essentials (for bcrypt native module in seed)
sudo apt install -y build-essential python3
```

### 2. Clone Repository

```bash
cd /opt
sudo git clone <repo-url> pcd_enterprise
sudo chown -R $USER:$USER /opt/pcd_enterprise
cd /opt/pcd_enterprise
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

**Critical .env changes for production:**

```env
NODE_ENV=production

# Use strong random secrets (generate with: openssl rand -hex 32)
JWT_SECRET=<random-64-char-hex>
JWT_REFRESH_SECRET=<different-random-64-char-hex>

# Database — keep internal Docker hostname for containers
DATABASE_URL=postgresql://deliveriq:<STRONG_PASSWORD>@postgres:5432/deliveriq?schema=public

# Redis
REDIS_URL=redis://redis:6379/0

# S3 / MinIO — use internal hostname
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=deliveriq
S3_SECRET_KEY=<STRONG_MINIO_SECRET>

# Frontend URL — your domain or VPS IP
NEXT_PUBLIC_API_URL=https://yourdomain.com
CORS_ORIGINS=https://yourdomain.com

# Change default admin password
SEED_ADMIN_PASSWORD=<YOUR_STRONG_PASSWORD>
```

Also update `docker-compose.yml` postgres/minio passwords to match:
- `POSTGRES_PASSWORD` → matches DATABASE_URL password
- `MINIO_ROOT_PASSWORD` → matches S3_SECRET_KEY

### 4. TLS Certificates (Production)

```bash
# Option A: Let's Encrypt with certbot
sudo apt install -y certbot
sudo certbot certonly --standalone -d yourdomain.com

# Copy certs to project
mkdir -p infra/docker/tls
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem infra/docker/tls/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem infra/docker/tls/
sudo chown $USER:$USER infra/docker/tls/*.pem

# Option B: Self-signed (for internal/testing only)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infra/docker/tls/privkey.pem \
  -out infra/docker/tls/fullchain.pem \
  -subj "/CN=yourdomain.com"
```

### 5. Build and Deploy

```bash
# Set image names for production
export BACKEND_IMAGE=deliveriq-backend:local
export FRONTEND_IMAGE=deliveriq-frontend:local

# Build images
docker compose build

# Start with production overlay
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 6. Initialize Database

```bash
# Apply migrations
docker compose exec backend npx prisma migrate deploy --schema=prisma/schema.prisma

# Seed data (run from host)
npm install
npx prisma generate --schema=src/database/prisma/schema.prisma
npm -w src/database run seed
```

### 7. Verify Deployment

```bash
# Check all containers are healthy
docker compose ps

# Test health endpoint
curl -fsS http://localhost:3600/healthz

# Test login
curl -s -X POST http://localhost:3600/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@deliveriq.local","password":"ChangeMe!2026"}'
```

### 8. Firewall Setup

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Do NOT expose internal ports (3600-3606) publicly
```

### 9. Auto-Restart on Reboot

The production compose already has `restart: unless-stopped`. To ensure Docker starts on boot:

```bash
sudo systemctl enable docker
```

### 10. Auto-Renew TLS (Let's Encrypt)

```bash
# Add cron job for certificate renewal
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'docker compose -f /opt/pcd_enterprise/docker-compose.yml -f /opt/pcd_enterprise/docker-compose.prod.yml restart nginx'") | crontab -
```

---

## Port Reference

| Service | Internal Port | Host Port (Dev) | Production |
|---------|--------------|-----------------|------------|
| Backend API | 3600 | 3600 | via Nginx :443 |
| Frontend | 3601 | 3601 | via Nginx :443 |
| PostgreSQL | 5432 | 3602 | not exposed |
| Redis | 6379 | 3603 | not exposed |
| MinIO API | 9000 | 3604 | not exposed |
| MinIO Console | 9001 | 3605 | not exposed |
| Adminer | 8080 | 3606 | disabled |
| Nginx | 80/443 | — | 80/443 |

**Production routing** (via Nginx):
- `https://yourdomain.com/v1/*` → backend:3600
- `https://yourdomain.com/*` → web:3601

---

## Default Credentials

| Service | User | Password |
|---------|------|----------|
| App (Admin) | `admin@deliveriq.local` | `ChangeMe!2026` |
| App (BOD) | `bod@deliveriq.local` | `Passw0rd!` |
| PostgreSQL | `deliveriq` | `deliveriq` (change in prod!) |
| MinIO | `deliveriq` | `deliveriqsecret` (change in prod!) |

> **Change all default passwords before deploying to production.**

---

## Maintenance Commands

```bash
# View logs
docker compose logs -f backend --tail 100
docker compose logs -f web --tail 100

# Restart a single service
docker compose restart backend

# Rebuild after code changes
docker compose build backend web
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Run new migrations
docker compose exec backend npx prisma migrate deploy --schema=prisma/schema.prisma

# Database backup
docker compose exec postgres pg_dump -U deliveriq deliveriq > backup_$(date +%Y%m%d).sql

# Database restore
cat backup_20260430.sql | docker compose exec -T postgres psql -U deliveriq -d deliveriq

# Stop everything
docker compose down

# Full reset (deletes all data!)
docker compose down -v
```

---

## Troubleshooting

### Backend fails to start — `EACCES mkdir`
The `DATA_DIR` environment variable is not set, causing the app to try writing to root filesystem. Ensure `DATA_DIR: /app/data` is in the backend environment in `docker-compose.yml`.

### `@prisma/client` module not found or missing export
Run `npx prisma generate --schema=src/database/prisma/schema.prisma` to regenerate the Prisma client.

### `Table does not exist` error
Migrations haven't been applied. Run:
```bash
docker compose exec backend npx prisma migrate deploy --schema=prisma/schema.prisma
```

### Login returns 401
1. Check the `User` table has records: seed the database
2. Verify the password hash matches — re-run the seed
3. Check if the account is locked (`failedLoginCount >= 5`) — wait 15 min or reset via SQL

### Container `unhealthy` or `restarting`
```bash
docker compose logs <service> --tail 50
docker inspect deliveriq-<service> --format='{{.State.Health.Log}}'
```

### Port already in use
Change the host port mapping in `docker-compose.yml` or stop the conflicting process:
```bash
sudo lsof -i :3600
sudo kill <PID>
```

### Frontend cannot reach backend
Ensure `NEXT_PUBLIC_API_URL` in `.env` matches the publicly accessible backend URL. In production with Nginx, this should be `https://yourdomain.com`.
