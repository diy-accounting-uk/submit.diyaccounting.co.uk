#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Simulator environment start script
# Runs entirely locally without Docker or an external HMRC API
#
# Ports: dynalite, the HTTP simulator and the web server each take an OS-assigned port. The web
# server prints its port on standard output as a line "Listening at http://127.0.0.1:<port>".
# A caller that needs the base URL starts this script with its output redirected to a file, then
# reads that line from the file (for example, with grep -o 'Listening at .*').
#
# Links the server builds for a browser (the MCP codes link, the OAuth callbacks) use
# DIY_SUBMIT_BASE_URL, which .env.simulator sets to port 3000. A caller that opens those links
# sets TEST_SERVER_HTTP_PORT to a free port it chose; this script then points DIY_SUBMIT_BASE_URL
# and MCP_PUBLIC_HOSTS at http://localhost:<port>/ so the links open on the running server.
#
# Tables: dynalite creates every table whose *_TABLE_NAME variable .env.simulator sets (the
# practice clients table among them), through ensureConfiguredTablesExist in app/bin/dynamodb.js,
# the same list the behaviour-test helper uses.

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
export HMRC_AGENT_AUTHORISATION_BASE_URI="$SIMULATOR_URL"
export TEST_MOCK_OAUTH2_BASE="$SIMULATOR_URL"
export COMPANIES_HOUSE_BASE_URI="$SIMULATOR_URL"
export COMPANIES_HOUSE_IDENTITY_BASE_URI="$SIMULATOR_URL"
export COMPANIES_HOUSE_FILING_BASE_URI="$SIMULATOR_URL"
export COMPANIES_HOUSE_XMLGW_URI="$SIMULATOR_URL/v1-0/xmlgw/Gateway"
export HMRC_TRANSACTION_ENGINE_URL="$SIMULATOR_URL/hmrc-transaction-engine/submission"

WEB_PORT="${TEST_SERVER_HTTP_PORT:-0}"
if [[ "$WEB_PORT" != '0' ]]; then
  export DIY_SUBMIT_BASE_URL="http://localhost:$WEB_PORT/"
  export MCP_PUBLIC_HOSTS="localhost:$WEB_PORT,127.0.0.1:$WEB_PORT"
fi

echo 'Starting web server...' >&2
# Foreground process; when this exits, cleanup will run and terminate the others.
# TEST_SERVER_HTTP_PORT=0 picks an ephemeral port too; app/bin/server.js logs the real one.
TEST_SERVER_HTTP_PORT="$WEB_PORT" npm run server:simulator
