#!/usr/bin/env bash
# Simple smoke check script for local stack
set -euo pipefail

BASE_URL=${1:-http://localhost:5000}

echo "Checking platform health at ${BASE_URL}/healthz"
curl -fsS "${BASE_URL}/healthz" >/dev/null || { echo "Platform healthcheck failed"; exit 2; }

echo "Checking API health at ${BASE_URL}/api/health"
curl -fsS "${BASE_URL}/api/health" >/dev/null || { echo "API healthcheck failed"; exit 2; }

echo "Checking auth session endpoint at ${BASE_URL}/api/auth/session"
curl -fsS -X POST "${BASE_URL}/api/auth/session" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com"}' >/dev/null || { echo "Auth smoke check failed"; exit 2; }

echo "Checking metrics at ${BASE_URL}/api/metrics"
curl -fsS "${BASE_URL}/api/metrics" >/dev/null || echo "Metrics endpoint not available or inaccessible"

echo "Smoke checks passed"
