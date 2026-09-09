#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# scripts/aws-accounts/restore-tables-from-backup.sh
#
# Copies DynamoDB table data from one account to another (cross-account migration).
# Uses scan + batch-write-item since on-demand DynamoDB backups cannot be restored
# cross-account (AWS Backup cross-account copy requires Phase 3 vault setup).
#
# The target tables must already exist (created by DataStack deployment).
#
# Part of Phase 1.4 (PLAN_ACCOUNT_SEPARATION.md step 1.4.17).
#
# Usage:
#   ./scripts/aws-accounts/restore-tables-from-backup.sh \
#     --source-profile management --target-profile submit-prod [--env prod] [--dry-run]
#
# Prerequisites:
#   - AWS CLI v2 configured with SSO profiles (aws sso login --sso-session diyaccounting)
#   - jq installed
#   - Both accounts accessible via their profiles
#   - Target tables already exist (from DataStack deployment)

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# --- Defaults ---
SOURCE_PROFILE=""
TARGET_PROFILE=""
ENV="prod"
REGION="${AWS_REGION:-eu-west-2}"
DRY_RUN=false
BATCH_SIZE=25

# Critical tables to copy (plan step 1.4.17)
# Ephemeral async-request tables and bundle-capacity (rebuilt by Lambda) are excluded.
CRITICAL_TABLES=(
  "${ENV}-env-receipts"
  "${ENV}-env-bundles"
  "${ENV}-env-hmrc-api-requests"
  "${ENV}-env-passes"
  "${ENV}-env-subscriptions"
)

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-profile)
      SOURCE_PROFILE="$2"
      shift 2
      ;;
    --target-profile)
      TARGET_PROFILE="$2"
      shift 2
      ;;
    --env)
      ENV="$2"
      # Re-derive table names with new env
      CRITICAL_TABLES=(
        "${ENV}-env-receipts"
        "${ENV}-env-bundles"
        "${ENV}-env-hmrc-api-requests"
        "${ENV}-env-passes"
        "${ENV}-env-subscriptions"
      )
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 --source-profile <profile> --target-profile <profile> [--env <env>] [--dry-run]"
      echo ""
      echo "Copies DynamoDB table data from source account to target account."
      echo "Target tables must already exist (created by DataStack deployment)."
      echo ""
      echo "Required:"
      echo "  --source-profile <profile>  AWS CLI profile for source account (e.g., management)"
      echo "  --target-profile <profile>  AWS CLI profile for target account (e.g., submit-prod)"
      echo ""
      echo "Options:"
      echo "  --env <name>    Environment name (default: prod)"
      echo "  --dry-run       Show what would be copied without writing"
      echo ""
      echo "Tables copied (critical data):"
      echo "  {env}-env-receipts            HMRC submission receipts (7-year retention)"
      echo "  {env}-env-bundles             User data + salt backup"
      echo "  {env}-env-hmrc-api-requests   HMRC API audit log (~48 MB, TTL-managed)"
      echo "  {env}-env-passes              Invitation pass codes"
      echo "  {env}-env-subscriptions       Stripe subscription data"
      echo ""
      echo "Tables NOT copied (ephemeral/rebuilt):"
      echo "  {env}-env-bundle-capacity               Rebuilt by Lambda"
      echo "  {env}-env-*-async-requests (5 tables)    Ephemeral correlation data"
      echo ""
      echo "Example:"
      echo "  $0 --source-profile management --target-profile submit-prod"
      echo "  $0 --source-profile management --target-profile submit-prod --dry-run"
      exit 0
      ;;
    *)
      echo -e "${RED}ERROR: Unknown argument: $1${NC}"
      echo "Run $0 --help for usage."
      exit 1
      ;;
  esac
done

# --- Validate ---
if [[ -z "${SOURCE_PROFILE}" ]]; then
  echo -e "${RED}ERROR: --source-profile is required${NC}"
  exit 1
fi
if [[ -z "${TARGET_PROFILE}" ]]; then
  echo -e "${RED}ERROR: --target-profile is required${NC}"
  exit 1
fi

# --- Verify credentials ---
echo -e "${GREEN}=== DynamoDB Cross-Account Data Copy ===${NC}"
echo ""

echo "Verifying source account (${SOURCE_PROFILE})..."
SOURCE_ACCOUNT=$(aws sts get-caller-identity --profile "${SOURCE_PROFILE}" --query 'Account' --output text 2>/dev/null) || {
  echo -e "${RED}ERROR: Cannot authenticate with source profile '${SOURCE_PROFILE}'${NC}"
  echo "  Run: aws sso login --sso-session diyaccounting"
  exit 1
}
echo -e "  Source account: ${GREEN}${SOURCE_ACCOUNT}${NC}"

echo "Verifying target account (${TARGET_PROFILE})..."
TARGET_ACCOUNT=$(aws sts get-caller-identity --profile "${TARGET_PROFILE}" --query 'Account' --output text 2>/dev/null) || {
  echo -e "${RED}ERROR: Cannot authenticate with target profile '${TARGET_PROFILE}'${NC}"
  echo "  Run: aws sso login --sso-session diyaccounting"
  exit 1
}
echo -e "  Target account: ${GREEN}${TARGET_ACCOUNT}${NC}"

if [[ "${SOURCE_ACCOUNT}" == "${TARGET_ACCOUNT}" ]]; then
  echo -e "${RED}ERROR: Source and target are the same account (${SOURCE_ACCOUNT})${NC}"
  exit 1
fi

echo ""
if [[ "${DRY_RUN}" == "true" ]]; then
  echo -e "${YELLOW}DRY RUN MODE — no data will be written${NC}"
  echo ""
fi

# --- Copy function ---
copy_table() {
  local TABLE_NAME="$1"
  local ITEMS_WRITTEN=0

  # Check source table exists and get item count
  local SOURCE_INFO
  SOURCE_INFO=$(aws dynamodb describe-table \
    --profile "${SOURCE_PROFILE}" \
    --table-name "${TABLE_NAME}" \
    --region "${REGION}" \
    --query 'Table.{ItemCount: ItemCount, SizeBytes: TableSizeBytes}' \
    --output json 2>/dev/null) || {
    echo -e "  ${RED}Source table ${TABLE_NAME} not found in ${SOURCE_ACCOUNT}${NC}"
    return 1
  }

  local ITEM_COUNT SIZE_BYTES SIZE_HUMAN
  ITEM_COUNT=$(echo "${SOURCE_INFO}" | jq -r '.ItemCount')
  SIZE_BYTES=$(echo "${SOURCE_INFO}" | jq -r '.SizeBytes')

  if [[ ${SIZE_BYTES} -gt 1048576 ]]; then
    SIZE_HUMAN="$(echo "scale=1; ${SIZE_BYTES} / 1048576" | bc) MB"
  else
    SIZE_HUMAN="$(echo "scale=1; ${SIZE_BYTES} / 1024" | bc) KB"
  fi

  echo -e "  Source: ${CYAN}${ITEM_COUNT} items${NC} (${SIZE_HUMAN})"

  # Check target table exists
  local TARGET_STATUS
  TARGET_STATUS=$(aws dynamodb describe-table \
    --profile "${TARGET_PROFILE}" \
    --table-name "${TABLE_NAME}" \
    --region "${REGION}" \
    --query 'Table.TableStatus' \
    --output text 2>/dev/null) || {
    echo -e "  ${RED}Target table ${TABLE_NAME} not found in ${TARGET_ACCOUNT}${NC}"
    return 1
  }

  if [[ "${TARGET_STATUS}" != "ACTIVE" ]]; then
    echo -e "  ${RED}Target table status: ${TARGET_STATUS} (must be ACTIVE)${NC}"
    return 1
  fi

  # Check if target table already has data
  local TARGET_SAMPLE
  TARGET_SAMPLE=$(aws dynamodb scan \
    --profile "${TARGET_PROFILE}" \
    --table-name "${TABLE_NAME}" \
    --region "${REGION}" \
    --select COUNT \
    --limit 1 \
    --query 'Count' \
    --output text 2>/dev/null) || TARGET_SAMPLE="0"

  if [[ "${TARGET_SAMPLE}" -gt 0 ]]; then
    echo -e "  ${YELLOW}WARNING: Target table already has data (sampled ${TARGET_SAMPLE}+ items)${NC}"
    echo -e "  ${YELLOW}Skipping to avoid duplicates. Empty the table first to re-copy.${NC}"
    return 0
  fi

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo -e "  ${YELLOW}Would copy ~${ITEM_COUNT} items${NC}"
    return 0
  fi

  # Scan all items from source (AWS CLI v2 auto-paginates)
  # For large tables, stream through jq line-by-line
  local TMPDIR
  TMPDIR=$(mktemp -d)
  local ITEMS_FILE="${TMPDIR}/items.jsonl"

  echo -ne "  Scanning source table..."
  aws dynamodb scan \
    --profile "${SOURCE_PROFILE}" \
    --table-name "${TABLE_NAME}" \
    --region "${REGION}" \
    --output json 2>/dev/null \
    | jq -c '.Items[]' > "${ITEMS_FILE}"

  local TOTAL_ITEMS
  TOTAL_ITEMS=$(wc -l < "${ITEMS_FILE}" | tr -d ' ')
  echo -e " ${GREEN}${TOTAL_ITEMS} items${NC}"

  if [[ "${TOTAL_ITEMS}" -eq 0 ]]; then
    echo -e "  ${YELLOW}No items to copy${NC}"
    rm -rf "${TMPDIR}"
    return 0
  fi

  # Process in batches of 25
  echo -ne "  Writing to target..."
  local BATCH_FILE="${TMPDIR}/batch.json"

  while true; do
    # Read up to BATCH_SIZE lines
    local BATCH_LINES
    BATCH_LINES=$(tail -n "+$((ITEMS_WRITTEN + 1))" "${ITEMS_FILE}" | head -n "${BATCH_SIZE}")

    if [[ -z "${BATCH_LINES}" ]]; then
      break
    fi

    local BATCH_COUNT
    BATCH_COUNT=$(echo "${BATCH_LINES}" | wc -l | tr -d ' ')

    # Build batch-write request
    echo "${BATCH_LINES}" | jq -s --arg table "${TABLE_NAME}" \
      '{($table): [.[] | {PutRequest: {Item: .}}]}' > "${BATCH_FILE}"

    # Retry loop for unprocessed items
    local RETRIES=0
    local MAX_RETRIES=5
    local CURRENT_REQUEST="${BATCH_FILE}"

    while [[ ${RETRIES} -lt ${MAX_RETRIES} ]]; do
      local RESPONSE
      RESPONSE=$(aws dynamodb batch-write-item \
        --profile "${TARGET_PROFILE}" \
        --region "${REGION}" \
        --request-items "file://${CURRENT_REQUEST}" \
        --output json 2>/dev/null) || {
        echo -e "\n  ${RED}Batch write failed at item ${ITEMS_WRITTEN}${NC}"
        rm -rf "${TMPDIR}"
        return 1
      }

      # Check for unprocessed items
      local UNPROCESSED
      UNPROCESSED=$(echo "${RESPONSE}" | jq ".UnprocessedItems.\"${TABLE_NAME}\" // empty | length")

      if [[ -z "${UNPROCESSED}" || "${UNPROCESSED}" -eq 0 ]]; then
        break
      fi

      # Retry unprocessed items after backoff
      echo "${RESPONSE}" | jq ".UnprocessedItems" > "${TMPDIR}/unprocessed.json"
      CURRENT_REQUEST="${TMPDIR}/unprocessed.json"
      RETRIES=$((RETRIES + 1))
      sleep $((RETRIES * 2))
    done

    ITEMS_WRITTEN=$((ITEMS_WRITTEN + BATCH_COUNT))

    # Progress indicator
    if [[ $((ITEMS_WRITTEN % 500)) -lt ${BATCH_SIZE} ]] || [[ ${ITEMS_WRITTEN} -ge ${TOTAL_ITEMS} ]]; then
      echo -ne "\r  Writing to target... ${ITEMS_WRITTEN}/${TOTAL_ITEMS}"
    fi
  done

  echo -e "\r  ${GREEN}Copied ${ITEMS_WRITTEN}/${TOTAL_ITEMS} items${NC}                    "

  rm -rf "${TMPDIR}"
}

# --- Main ---
TOTAL_SUCCESS=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0

for TABLE in "${CRITICAL_TABLES[@]}"; do
  echo ""
  echo -e "${CYAN}--- ${TABLE} ---${NC}"

  if copy_table "${TABLE}"; then
    TOTAL_SUCCESS=$((TOTAL_SUCCESS + 1))
  else
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
  fi
done

# --- Summary ---
echo ""
echo -e "${GREEN}=== Summary ===${NC}"
echo "  Source: ${SOURCE_ACCOUNT} (${SOURCE_PROFILE})"
echo "  Target: ${TARGET_ACCOUNT} (${TARGET_PROFILE})"
echo "  Tables: ${TOTAL_SUCCESS} succeeded, ${TOTAL_FAILED} failed"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo ""
  echo -e "${YELLOW}This was a dry run. Run without --dry-run to copy data.${NC}"
fi

echo ""
echo "Verify with:"
for TABLE in "${CRITICAL_TABLES[@]}"; do
  echo "  aws --profile ${TARGET_PROFILE} dynamodb scan --table-name ${TABLE} --select COUNT --query 'Count'"
done

echo ""
echo "Next steps:"
echo "  1. Run ./scripts/aws-accounts/restore-salt.sh to copy the salt (step 1.4.18)"
echo "  2. Validate prod with behaviour tests (step 1.4.20)"
