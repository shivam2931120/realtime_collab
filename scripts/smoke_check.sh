#!/usr/bin/env bash
# Simple smoke check script for local stack
set -euo pipefail

BASE_URL=${1:-http://localhost:5000}

echo "Checking health at ${BASE_URL}/api/health"
curl -fsS ${BASE_URL}/api/health || { echo "Healthcheck failed"; exit 2; }

echo "Checking metrics at ${BASE_URL}/api/metrics"
curl -fsS ${BASE_URL}/api/metrics >/dev/null || echo "Metrics endpoint not available or inaccessible"

echo "Smoke checks passed"
