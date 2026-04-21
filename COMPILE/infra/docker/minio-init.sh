#!/bin/sh
# Initialise the MinIO bucket used for Excel uploads, photos, and exports.
set -eu

ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
ACCESS="${MINIO_ROOT_USER:?}"
SECRET="${MINIO_ROOT_PASSWORD:?}"
BUCKET="${S3_BUCKET:-deliveriq}"

echo "[minio-init] waiting for $ENDPOINT ..."
i=0
until /usr/bin/mc alias set local "$ENDPOINT" "$ACCESS" "$SECRET" >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then
    echo "[minio-init] FATAL: cannot reach $ENDPOINT" >&2
    exit 1
  fi
  sleep 2
done

if /usr/bin/mc ls "local/$BUCKET" >/dev/null 2>&1; then
  echo "[minio-init] bucket '$BUCKET' already exists"
else
  /usr/bin/mc mb --ignore-existing "local/$BUCKET"
  echo "[minio-init] created bucket '$BUCKET'"
fi

# Versioning + 30-day lifecycle on /tmp/ prefix (parser scratch).
/usr/bin/mc version enable "local/$BUCKET" || true
/usr/bin/mc anonymous set none "local/$BUCKET" || true

# Sub-prefixes used by the app
for p in imports/ photos/ exports/ backups/; do
  echo "" | /usr/bin/mc pipe "local/$BUCKET/${p}.keep" >/dev/null 2>&1 || true
done

echo "[minio-init] done"
