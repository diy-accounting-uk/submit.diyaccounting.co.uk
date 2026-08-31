#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd

# Simulator environment start script
# Runs entirely locally without Docker or an external HMRC API

set -euo pipefail

# Track background PIDs so we can clean them up
BG_PIDS=()

cleanup() {
  local exit_code=$?
  if ((${#BG_PIDS[@]})); then
    echo 'Shutting down background services...' >&2
    # Try to terminate background services nicely
    kill "${BG_PIDS[@]}" 2>/dev/null || true
    # Reap them
    wait "${BG_PIDS[@]}" 2>/dev/null || true
  fi
  exit "$exit_code"
}

trap cleanup INT TERM EXIT

echo 'Building simulator static files...' >&2
npm run build:simulator

echo 'Starting data (dynalite)...' >&2
npm run data:simulator &
BG_PIDS+=("$!")

# Dynalite config - use port 9001 to avoid conflict with simulator on 9000
export AWS_REGION='us-east-1'
export AWS_ACCESS_KEY_ID='dummy'
export AWS_SECRET_ACCESS_KEY='dummy'
export AWS_ENDPOINT_URL='http://127.0.0.1:9001'
export AWS_ENDPOINT_URL_DYNAMODB='http://127.0.0.1:9001'

echo 'Starting HTTP simulator (replaces mock-oauth2-server and HMRC API)...' >&2
npm run simulator &
BG_PIDS+=("$!")

# Wait for simulator to be ready
echo 'Waiting for simulator to be ready...' >&2
for i in {1..30}; do
  if curl -s http://localhost:9000/health > /dev/null 2>&1; then
    echo 'Simulator is ready!' >&2
    break
  fi
  sleep 0.5
done

echo 'Starting web server...' >&2
# Foreground process; when this exits, cleanup will run and terminate the others
npm run server:simulator
