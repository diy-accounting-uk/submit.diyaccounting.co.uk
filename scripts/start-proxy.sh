#!/usr/bin/env bash
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

echo 'Starting data (dynalite)...' >&2
npm run data &
BG_PIDS+=("$!")

# Dynalite config
export AWS_REGION='us-east-1'
export AWS_ACCESS_KEY_ID='dummy'
export AWS_SECRET_ACCESS_KEY='dummy'
export AWS_ENDPOINT_URL='http://127.0.0.1:9000'
export AWS_ENDPOINT_URL_DYNAMODB='http://127.0.0.1:9000'

echo 'Starting auth (mock-oauth2-server)...' >&2
npm run auth &
BG_PIDS+=("$!")

echo 'Starting web server...' >&2
# Foreground process; when this exits, cleanup will run and terminate the others
npm run server
