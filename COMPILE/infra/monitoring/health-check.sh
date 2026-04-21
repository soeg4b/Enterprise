#!/bin/sh
# Lightweight health check for cron / external uptime monitor.
# Usage: BASE_URL=https://api.example.com ./health-check.sh
set -eu
BASE_URL="${BASE_URL:-http://127.0.0.1:3600}"
TIMEOUT="${TIMEOUT:-5}"

fail() { echo "[health] FAIL: $*" >&2; exit 1; }

curl -fsS --max-time "$TIMEOUT" "$BASE_URL/healthz" >/dev/null \
  || fail "/healthz unreachable"

# /readyz pings DB + Redis; treat 5xx as critical.
HTTP=$(curl -s -o /tmp/readyz.out -w "%{http_code}" --max-time "$TIMEOUT" "$BASE_URL/readyz" || echo 000)
if [ "$HTTP" != "200" ]; then
  fail "/readyz returned $HTTP: $(cat /tmp/readyz.out 2>/dev/null || true)"
fi

echo "[health] OK"
