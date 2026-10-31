#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# @capability DEV-14 Start the proxy and simulator local dev environments
# - **Use when:** starting local development against native HTTPS with Docker, or a Docker-free simulator variant.
# - **Does:** start-proxy.sh starts dynalite, the Docker mock-oauth2-server and the web server on local.submit.diyaccounting.co.uk, and tears them down on exit. start-simulator.sh builds the simulator static files, then starts dynalite and the HTTP simulator on ephemeral ports with no Docker dependency. startDynamoDB ensures every DynamoDB table exists, and pick-free-port.js resolves a free port for concurrent runs.
# - **Run:** `npm run start:proxy`; `npm run start:simulator`; `node scripts/static-server.mjs <root-dir>`; `node scripts/pick-free-port.js VAR_NAME -- command args`
# - **Entry:** `scripts/start-proxy.sh`; `scripts/start-simulator.sh`; `app/bin/dynamodb.js:startDynamoDB`
# - **Files:** scripts/start-proxy.sh, scripts/start-simulator.sh, app/bin/dynamodb.js, scripts/static-server.mjs, scripts/pick-free-port.js
# - **Keywords:** local dev, proxy variant, dynalite, mock-oauth2-server, dynamodb tables, ephemeral port, accessibility scan, pa11y, lighthouse
# - **Related:** DEV-01, DEV-02, DEV-15
# @end-capability

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
