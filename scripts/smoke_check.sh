#!/usr/bin/env bash
# Simple smoke check script for local stack
set -euo pipefail

BASE_URL=${1:-http://localhost:5000}

echo "Checking platform health at ${BASE_URL}/healthz"
curl -fsS "${BASE_URL}/healthz" >/dev/null || { echo "Platform healthcheck failed"; exit 2; }

echo "Checking API health at ${BASE_URL}/api/health"
HEALTH_JSON=$(curl -fsS "${BASE_URL}/api/health") || { echo "API/database healthcheck failed"; exit 2; }
node -e '
const payload = JSON.parse(process.argv[1]);
if (payload.status !== "ok" || payload.database?.connected !== true) process.exit(1);
' "$HEALTH_JSON" || { echo "Database is not connected"; exit 2; }

echo "Checking auth session endpoint at ${BASE_URL}/api/auth/session"
curl -fsS -X POST "${BASE_URL}/api/auth/session" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com"}' >/dev/null || { echo "Auth smoke check failed"; exit 2; }

echo "Smoke checks passed"
