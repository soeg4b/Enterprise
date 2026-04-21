#!/bin/sh
# Daily Postgres logical backup → S3/MinIO with 30-day retention.
# Designed to be run from cron (e.g. host crontab: 0 2 * * * /opt/deliveriq/postgres-backup.sh)
# Required env (loaded from .env or systemd EnvironmentFile):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
#   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
#   BACKUP_PREFIX (default: backups/postgres)
#   RETENTION_DAYS (default: 30)
#
# PITR (point-in-time-recovery) is documentation-only:
#   Use `wal-g` or AWS RDS automated snapshots; configure WAL archiving to the
#   same bucket under prefix `wal/` and a base backup nightly. Out of MVP scope.
set -eu

: "${PGHOST:?}" "${PGUSER:?}" "${PGDATABASE:?}"
: "${S3_BUCKET:?}" "${S3_ENDPOINT:?}" "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}"

PGPORT="${PGPORT:-5432}"
PREFIX="${BACKUP_PREFIX:-backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
TMPDIR="$(mktemp -d)"
DUMP="$TMPDIR/${PGDATABASE}-${TS}.dump"

cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

echo "[backup] pg_dump $PGDATABASE @ $PGHOST:$PGPORT -> $DUMP"
PGPASSWORD="$PGPASSWORD" pg_dump \
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --file "$DUMP"

SIZE=$(stat -c%s "$DUMP" 2>/dev/null || stat -f%z "$DUMP")
echo "[backup] dump size: $SIZE bytes"

# Configure mc client (alias 'bk').
mc alias set bk "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null

KEY="$PREFIX/$(date -u +%Y/%m)/${PGDATABASE}-${TS}.dump"
mc cp "$DUMP" "bk/$S3_BUCKET/$KEY"
echo "[backup] uploaded s3://$S3_BUCKET/$KEY"

# Retention: list and delete objects older than RETENTION_DAYS.
echo "[backup] enforcing $RETENTION_DAYS-day retention under $PREFIX"
mc rm --recursive --force --older-than "${RETENTION_DAYS}d" "bk/$S3_BUCKET/$PREFIX/" || true

echo "[backup] done"
