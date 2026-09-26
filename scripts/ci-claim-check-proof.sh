#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

set -euo pipefail

TIMEOUT_MINUTES=60
REQUESTED_SET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout-minutes)
      TIMEOUT_MINUTES="$2"
      shift 2
      ;;
    --set)
      REQUESTED_SET="$2"
      shift 2
      ;;
    *)
      echo "Usage: $0 [--timeout-minutes N] [--set ci-set1|ci-set2]" >&2
      exit 1
      ;;
  esac
done

# Convert timeout to seconds
TIMEOUT_SECONDS=$((TIMEOUT_MINUTES * 60))
START_TIME=$(date +%s)

claimed_set=""

# Wait for a slot to be claimed and the stacks to be standing
while true; do
  current_time=$(date +%s)
  elapsed=$((current_time - START_TIME))

  if [[ $elapsed -ge $TIMEOUT_SECONDS ]]; then
    echo "Timeout after $TIMEOUT_MINUTES minutes waiting for a free ci slot" >&2
    exit 1
  fi

  # Check all slot parameters
  claimed_set=""

  for set in ci-set1 ci-set2; do
    # Skip if a specific set was requested and this is not it
    if [[ -n "$REQUESTED_SET" && "$set" != "$REQUESTED_SET" ]]; then
      continue
    fi

    # Try to get the slot parameter
    if aws --profile submit-ci ssm get-parameter --name "/submit/ci/slots/$set" 2>/dev/null | grep -q '"Value"'; then
      current_run=$(aws --profile submit-ci ssm get-parameter --name "/submit/ci/slots/$set" --query 'Parameter.Value' --output text)

      # Check if this is the last-known-good deployment - skip it
      if [[ "$current_run" == "/submit/ci/last-known-good-deployment" ]]; then
        continue
      fi

      # Check if the run is still in flight by checking its status
      if gh run view "$current_run" --json status --jq '.status' 2>/dev/null | grep -q "in_progress"; then
        # Check if the stacks for this set are standing
        stack_count=$(aws --profile submit-ci cloudformation list-stacks \
          --query "StackSummaries[?StackStatus!='DELETE_COMPLETE' && contains(StackName, '$set-app-')] | length(@)" \
          --output text)

        if [[ "$stack_count" -gt 0 ]]; then
          claimed_set="$set"
          break 2
        fi
      fi
    fi
  done

  # If we haven't found a qualified set, wait a bit before trying again
  sleep 10
done

# We found a claimed set with running stacks and a running deployment
echo "Found claimed slot: $claimed_set (run: $current_run)"

# Dispatch the destroy-ci workflow
echo "Dispatching destroy-ci.yml with sweep-min-age-hours=0..."
run_id=$(gh workflow run destroy-ci.yml \
  --ref main \
  -f sweep-for-stacks=true \
  -f sweep-min-age-hours=0 \
  --json id \
  --jq '.id')

echo "Destroy-ci run started: $run_id"

# Wait for the run to complete
while true; do
  current_time=$(date +%s)
  elapsed=$((current_time - START_TIME))

  if [[ $elapsed -ge $TIMEOUT_SECONDS ]]; then
    echo "Timeout waiting for destroy-ci run to complete" >&2
    exit 1
  fi

  status=$(gh run view "$run_id" --json status --jq '.status' 2>/dev/null || echo "unknown")

  if [[ "$status" == "completed" ]]; then
    break
  fi

  sleep 10
done

# Get the run logs and print "Skipping" lines
echo "Retrieving sweep results..."
gh run view "$run_id" --log 2>/dev/null | grep -i "Skipping" || true
