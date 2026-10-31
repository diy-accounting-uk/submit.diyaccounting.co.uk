#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# @capability OPS-146 Delete a deployment's app stacks in parallel waves
# - **Use when:** a ci or prod deployment's `{deployment}-app-*` CloudFormation stacks must be deleted in dependency order, as fast as the order allows.
# - **Does:** delete-deployment-stacks.sh deletes the stacks in four phases and waits for each phase before the next. SelfDestruct, Ops and Publish go together in phase 1. Edge is phase 2, ApiRoutes then Api phase 3, and the nine Lambda stacks go together in phase 4. Before a parallel wave it reads the CloudFormation exports and imports, and deletes the wave one stack at a time when a stack in it imports an export of another stack in it. A stack in DELETE_FAILED is deleted again with FORCE_DELETE_STACK. Each stack writes its own log, printed when its wave ends.
# - **Run:** `scripts/delete-deployment-stacks.sh <deployment-name>`; called by `destroy-ci.yml` and `destroy-prod.yml`
# - **Entry:** `scripts/delete-deployment-stacks.sh`
# - **Files:** scripts/delete-deployment-stacks.sh, app/unit-tests/scripts/deleteDeploymentStacks.test.js, .github/workflows/destroy-ci.yml, .github/workflows/destroy-prod.yml
# - **Keywords:** delete stacks, destroy deployment, parallel delete, dependency order, FORCE_DELETE_STACK, list-imports, wave, teardown
# - **Related:** OPS-13, OPS-14
# @end-capability

#
# Usage: scripts/delete-deployment-stacks.sh <deployment-name>
#
# Needs AWS credentials for the account that holds the deployment. Works on bash 3.2.

set -u

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "Usage: $0 <deployment-name>" >&2
  exit 2
fi

DEPLOYMENT="$1"
PREFIX="${DEPLOYMENT}-app-"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

delete_stack_in_region() {
  local STACK="$1" REGION="$2"
  local STATUS
  STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "DOES_NOT_EXIST")
  if [ "$STATUS" = "DOES_NOT_EXIST" ]; then
    echo "  $STACK does not exist in $REGION, skipping"
    return 0
  fi
  echo "  Deleting $STACK in $REGION (status: $STATUS)..."
  aws cloudformation delete-stack --stack-name "$STACK" --region "$REGION" 2>/dev/null || true
  aws cloudformation wait stack-delete-complete --stack-name "$STACK" --region "$REGION" 2>/dev/null || true
  STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "DOES_NOT_EXIST")
  if [ "$STATUS" = "DELETE_FAILED" ]; then
    echo "  $STACK is DELETE_FAILED, force deleting"
    aws cloudformation delete-stack --stack-name "$STACK" --region "$REGION" \
      --deletion-mode FORCE_DELETE_STACK || true
    aws cloudformation wait stack-delete-complete --stack-name "$STACK" --region "$REGION" 2>/dev/null || true
  fi
}

# Prints "<importer> <exporter>" for each import between two stacks of the wave.
# Arguments are "stack:region" entries.
wave_import_pairs() {
  local ENTRY REGION REGIONS="" EXPORT_LINES NAME EXPORTER_ID EXPORTER IMPORTS IMPORTER WAVE_STACKS=""
  for ENTRY in "$@"; do
    WAVE_STACKS="$WAVE_STACKS ${ENTRY%%:*} "
    REGION="${ENTRY##*:}"
    case " $REGIONS " in
      *" $REGION "*) ;;
      *) REGIONS="$REGIONS $REGION" ;;
    esac
  done
  for REGION in $REGIONS; do
    EXPORT_LINES=$(aws cloudformation list-exports --region "$REGION" \
      --query 'Exports[].[Name,ExportingStackId]' --output text 2>/dev/null || echo "")
    echo "$EXPORT_LINES" | while read -r NAME EXPORTER_ID; do
      [ -z "$NAME" ] || [ "$NAME" = "None" ] && continue
      EXPORTER="${EXPORTER_ID#*:stack/}"
      EXPORTER="${EXPORTER%%/*}"
      case "$EXPORTER" in
        "$PREFIX"*) ;;
        *) continue ;;
      esac
      case "$WAVE_STACKS" in
        *" $EXPORTER "*) ;;
        *) continue ;;
      esac
      IMPORTS=$(aws cloudformation list-imports --export-name "$NAME" --region "$REGION" \
        --query 'Imports[]' --output text 2>/dev/null || echo "")
      for IMPORTER in $IMPORTS; do
        [ "$IMPORTER" = "None" ] && continue
        case "$WAVE_STACKS" in
          *" $IMPORTER "*) echo "$IMPORTER $EXPORTER" ;;
        esac
      done
    done
  done
}

# delete_wave <label> <stack:region>...
delete_wave() {
  local LABEL="$1"
  shift
  local PAIRS LINE ENTRY STACK REGION PID INDEX=0 PIDS=""
  PAIRS=$(wave_import_pairs "$@")
  if [ -n "$PAIRS" ]; then
    echo "$LABEL: a stack in this wave imports an export of another stack in it, deleting one at a time:"
    while read -r LINE; do echo "  $LINE"; done <<<"$PAIRS"
    for ENTRY in "$@"; do
      delete_stack_in_region "${ENTRY%%:*}" "${ENTRY##*:}"
    done
    return 0
  fi
  for ENTRY in "$@"; do
    STACK="${ENTRY%%:*}"
    REGION="${ENTRY##*:}"
    INDEX=$((INDEX + 1))
    delete_stack_in_region "$STACK" "$REGION" >"$WORK_DIR/$INDEX.log" 2>&1 &
    PIDS="$PIDS $!"
  done
  for PID in $PIDS; do
    wait "$PID"
  done
  INDEX=0
  for ENTRY in "$@"; do
    INDEX=$((INDEX + 1))
    cat "$WORK_DIR/$INDEX.log"
  done
}

echo "=== Phase 1: SelfDestruct + Ops + Publish (no dependents) ==="
delete_wave "Phase 1" \
  "${PREFIX}SelfDestructStack:eu-west-2" \
  "${PREFIX}OpsStack:eu-west-2" \
  "${PREFIX}PublishStack:us-east-1"

echo "=== Phase 2: EdgeStack (depends on ApiStack outputs) ==="
delete_stack_in_region "${PREFIX}EdgeStack" us-east-1

echo "=== Phase 3: ApiRoutesStack, then ApiStack (depends on Lambda stacks) ==="
delete_stack_in_region "${PREFIX}ApiRoutesStack" eu-west-2
delete_stack_in_region "${PREFIX}ApiStack" eu-west-2

echo "=== Phase 4: Lambda stacks (no cross-dependencies) ==="
delete_wave "Phase 4" \
  "${PREFIX}AuthStack:eu-west-2" \
  "${PREFIX}HmrcStack:eu-west-2" \
  "${PREFIX}HmrcItsaStack:eu-west-2" \
  "${PREFIX}HmrcItsaPropertyStack:eu-west-2" \
  "${PREFIX}CompaniesHouseStack:eu-west-2" \
  "${PREFIX}AccountStack:eu-west-2" \
  "${PREFIX}BillingStack:eu-west-2" \
  "${PREFIX}DiyaGlStack:eu-west-2" \
  "${PREFIX}McpStack:eu-west-2"

echo "=== Stack deletion complete ==="
