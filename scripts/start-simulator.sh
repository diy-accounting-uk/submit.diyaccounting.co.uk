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

# dynalite and the HTTP simulator each pick an ephemeral (OS-assigned) port and log it on
# startup, so two of this script can run side by side without colliding. Their output is
# captured to a log file so the chosen port can be read back, and tailed in the background so
# it still shows up on screen.
DYNAMODB_LOG="$(mktemp)"
SIMULATOR_LOG="$(mktemp)"

echo 'Starting data (dynalite)...' >&2
DYNAMODB_PORT=0 npm run data:simulator > "$DYNAMODB_LOG" 2>&1 &
BG_PIDS+=("$!")
tail -f "$DYNAMODB_LOG" &
BG_PIDS+=("$!")

echo 'Waiting for dynalite to report its port...' >&2
DYNAMODB_URL=''
for i in {1..60}; do
  DYNAMODB_URL="$(grep -m1 -o 'DynamoDB started url=.*' "$DYNAMODB_LOG" 2>/dev/null | sed 's/^DynamoDB started url=//')" || true
  [[ -n "$DYNAMODB_URL" ]] && break
  sleep 0.5
done
if [[ -z "$DYNAMODB_URL" ]]; then
  echo 'Timed out waiting for dynalite to start' >&2
  exit 1
fi

# Dynalite config - point the AWS SDK at the port it actually bound to
export AWS_REGION='us-east-1'
export AWS_ACCESS_KEY_ID='dummy'
export AWS_SECRET_ACCESS_KEY='dummy'
export AWS_ENDPOINT_URL="$DYNAMODB_URL"
export AWS_ENDPOINT_URL_DYNAMODB="$DYNAMODB_URL"

echo 'Starting HTTP simulator (replaces mock-oauth2-server and HMRC API)...' >&2
TEST_HTTP_SIMULATOR_PORT=0 npm run simulator > "$SIMULATOR_LOG" 2>&1 &
BG_PIDS+=("$!")
tail -f "$SIMULATOR_LOG" &
BG_PIDS+=("$!")

echo 'Waiting for the HTTP simulator to report its port...' >&2
SIMULATOR_URL=''
for i in {1..60}; do
  SIMULATOR_URL="$(grep -m1 -o 'Server listening on .*' "$SIMULATOR_LOG" 2>/dev/null | sed 's/^Server listening on //')" || true
  [[ -n "$SIMULATOR_URL" ]] && break
  sleep 0.5
done
if [[ -z "$SIMULATOR_URL" ]]; then
  echo 'Timed out waiting for the HTTP simulator to start' >&2
  exit 1
fi

# Wait for simulator to be ready
echo 'Waiting for simulator to be ready...' >&2
for i in {1..30}; do
  if curl -s "$SIMULATOR_URL/health" > /dev/null 2>&1; then
    echo 'Simulator is ready!' >&2
    break
  fi
  sleep 0.5
done

export HMRC_BASE_URI="$SIMULATOR_URL"
export HMRC_SANDBOX_BASE_URI="$SIMULATOR_URL"
export TEST_MOCK_OAUTH2_BASE="$SIMULATOR_URL"

echo 'Starting web server...' >&2
# Foreground process; when this exits, cleanup will run and terminate the others.
# TEST_SERVER_HTTP_PORT=0 picks an ephemeral port too; app/bin/server.js logs the real one.
TEST_SERVER_HTTP_PORT=0 npm run server:simulator
