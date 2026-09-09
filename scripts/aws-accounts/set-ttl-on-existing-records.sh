#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Set TTL on all existing records in a DynamoDB table
# Usage: ./scripts/aws-accounts/set-ttl-on-existing-records.sh --profile submit-prod --table prod-env-hmrc-api-requests --ttl-days 1 [--dry-run]
#
# This script:
# 1. Scans all items in the table
# 2. Updates each item's 'ttl' attribute to (now + ttl-days) as Unix epoch seconds
# 3. Updates 'ttl_datestamp' to the corresponding ISO date string
#
# Then separately enable TTL on the table:
#   aws --profile submit-prod dynamodb update-time-to-live --table-name prod-env-hmrc-api-requests --time-to-live-specification 'Enabled=true,AttributeName=ttl'

set -euo pipefail

PROFILE=""
TABLE=""
TTL_DAYS=""
DRY_RUN=false
PARTITION_KEY="hashedSub"
SORT_KEY="id"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2;;
    --table) TABLE="$2"; shift 2;;
    --ttl-days) TTL_DAYS="$2"; shift 2;;
    --partition-key) PARTITION_KEY="$2"; shift 2;;
    --sort-key) SORT_KEY="$2"; shift 2;;
    --dry-run) DRY_RUN=true; shift;;
    *) echo "Unknown option: $1"; exit 1;;
  esac
done

if [[ -z "$PROFILE" || -z "$TABLE" || -z "$TTL_DAYS" ]]; then
  echo "Usage: $0 --profile PROFILE --table TABLE --ttl-days DAYS [--partition-key PK] [--sort-key SK] [--dry-run]"
  exit 1
fi

# Calculate TTL as Unix epoch seconds
TTL_EPOCH=$(( $(date +%s) + TTL_DAYS * 86400 ))
TTL_ISO=$(date -u -r "$TTL_EPOCH" '+%Y-%m-%dT%H:%M:%S.000Z' 2>/dev/null || date -u -d "@$TTL_EPOCH" '+%Y-%m-%dT%H:%M:%S.000Z')

echo -e "\033[0;32m=== Set TTL on existing DynamoDB records ===\033[0m"
echo "  Profile: $PROFILE"
echo "  Table: $TABLE"
echo "  TTL: $TTL_DAYS day(s) from now"
echo "  TTL epoch: $TTL_EPOCH"
echo "  TTL datestamp: $TTL_ISO"
echo "  Partition key: $PARTITION_KEY"
echo "  Sort key: $SORT_KEY"
echo "  Dry run: $DRY_RUN"
echo ""

# Get total item count
# Get total item count (paginate through all pages)
TOTAL=0
COUNT_KEY=""
while true; do
  if [[ -n "$COUNT_KEY" ]]; then
    COUNT_RESULT=$(aws --profile "$PROFILE" dynamodb scan --table-name "$TABLE" --select COUNT --exclusive-start-key "$COUNT_KEY" --output json)
  else
    COUNT_RESULT=$(aws --profile "$PROFILE" dynamodb scan --table-name "$TABLE" --select COUNT --output json)
  fi
  PAGE_COUNT=$(echo "$COUNT_RESULT" | jq '.Count')
  TOTAL=$((TOTAL + PAGE_COUNT))
  COUNT_KEY=$(echo "$COUNT_RESULT" | jq -r '.LastEvaluatedKey // empty')
  [[ -z "$COUNT_KEY" ]] && break
done
echo "Total items: $TOTAL"

if $DRY_RUN; then
  echo ""
  echo "DRY RUN — would update $TOTAL items with ttl=$TTL_EPOCH ($TTL_ISO)"
  echo "Example update command:"
  echo "  aws --profile $PROFILE dynamodb update-item --table-name $TABLE \\"
  echo "    --key '{\"$PARTITION_KEY\":{\"S\":\"xxx\"},\"$SORT_KEY\":{\"S\":\"yyy\"}}' \\"
  echo "    --update-expression 'SET #ttl = :ttl, #ttl_datestamp = :ttl_datestamp' \\"
  echo "    --expression-attribute-names '{\"#ttl\":\"ttl\",\"#ttl_datestamp\":\"ttl_datestamp\"}' \\"
  echo "    --expression-attribute-values '{\":ttl\":{\"N\":\"$TTL_EPOCH\"},\":ttl_datestamp\":{\"S\":\"$TTL_ISO\"}}'"
  exit 0
fi

# Scan all items and update TTL in batches
UPDATED=0
LAST_KEY=""
SCAN_ARGS="--profile $PROFILE --table-name $TABLE --projection-expression $PARTITION_KEY,$SORT_KEY"

while true; do
  if [[ -n "$LAST_KEY" ]]; then
    SCAN_RESULT=$(aws dynamodb scan $SCAN_ARGS --exclusive-start-key "$LAST_KEY" --output json)
  else
    SCAN_RESULT=$(aws dynamodb scan $SCAN_ARGS --output json)
  fi

  ITEMS=$(echo "$SCAN_RESULT" | jq -c '.Items[]')
  LAST_KEY=$(echo "$SCAN_RESULT" | jq -r '.LastEvaluatedKey // empty')

  while IFS= read -r ITEM; do
    [[ -z "$ITEM" ]] && continue

    PK_VAL=$(echo "$ITEM" | jq -r ".$PARTITION_KEY.S")
    KEY="{\"$PARTITION_KEY\":{\"S\":\"$PK_VAL\"}"

    if [[ -n "$SORT_KEY" ]]; then
      SK_VAL=$(echo "$ITEM" | jq -r ".$SORT_KEY.S")
      KEY="$KEY,\"$SORT_KEY\":{\"S\":\"$SK_VAL\"}"
    fi
    KEY="$KEY}"

    aws --profile "$PROFILE" dynamodb update-item \
      --table-name "$TABLE" \
      --key "$KEY" \
      --update-expression 'SET #ttl = :ttl, #ttl_datestamp = :ttl_datestamp' \
      --expression-attribute-names '{"#ttl":"ttl","#ttl_datestamp":"ttl_datestamp"}' \
      --expression-attribute-values "{\":ttl\":{\"N\":\"$TTL_EPOCH\"},\":ttl_datestamp\":{\"S\":\"$TTL_ISO\"}}"

    UPDATED=$((UPDATED + 1))
    if (( UPDATED % 500 == 0 )); then
      printf "\r  Updated %d/%d items" "$UPDATED" "$TOTAL"
    fi
  done <<< "$ITEMS"

  [[ -z "$LAST_KEY" ]] && break
done

printf "\r  \033[0;32mUpdated %d/%d items\033[0m                    \n" "$UPDATED" "$TOTAL"
echo ""
echo "Next: enable TTL on the table:"
echo "  aws --profile $PROFILE dynamodb update-time-to-live --table-name $TABLE --time-to-live-specification 'Enabled=true,AttributeName=ttl'"
