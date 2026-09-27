#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Copies the analytics lake's year=Y/month=M/day=D curated objects into dt=Y-M-D prefixes, the
# layout the tables move to for partition projection. Each object is copied with a server-side
# aws s3api copy-object (metadata and content type preserved, the default COPY directive) so a
# rerun overwrites the same destination keys and is safe to repeat. The old year/month/day
# objects are left in place: the operator's choice is to let the 800-day lifecycle rule remove
# them rather than add a delete step here.
#
# After the copy, the registered y/m/d partitions of activity_events and alarm_state_changes
# that match a copied day are removed with glue batch-delete-partition, so Athena and Glue Data
# Quality stop double-counting a day once both the old and new partition would cover it. The
# four dynamo_* tables (bundles, passes, receipts, subscriptions) are not partition-registered
# the same way and are copied only.
#
# Usage:
#   AWS_PROFILE=submit-ci  scripts/analytics-dt-relayout.sh --env ci   --dry-run
#   AWS_PROFILE=submit-ci  scripts/analytics-dt-relayout.sh --env ci   [--before 2026-09-01]
#   AWS_PROFILE=submit-prod scripts/analytics-dt-relayout.sh --env prod [--before 2026-09-01]
set -euo pipefail

USAGE="Usage: $0 --env ci|prod [--dry-run] [--before YYYY-MM-DD]"

ENV_NAME=""
DRY_RUN=false
BEFORE_DATE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      ENV_NAME="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --before)
      BEFORE_DATE="${2:-}"
      shift 2
      ;;
    -h | --help)
      echo "$USAGE"
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      echo "$USAGE" >&2
      exit 1
      ;;
  esac
done

case "$ENV_NAME" in
  ci | prod) ;;
  *)
    echo "error: --env must be ci or prod" >&2
    echo "$USAGE" >&2
    exit 1
    ;;
esac

if [ -n "$BEFORE_DATE" ] && ! echo "$BEFORE_DATE" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
  echo "error: --before must be YYYY-MM-DD, got '${BEFORE_DATE}'" >&2
  exit 1
fi

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
LAKE="${ENV_NAME}-env-analytics-lake-${ACCOUNT}"
DATABASE="${ENV_NAME}_env_analytics"

# AWS caps BatchDeletePartition at 25 partition values per call.
readonly BATCH_DELETE_PARTITION_LIMIT=25

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "Environment:  ${ENV_NAME}"
echo "Account:      ${ACCOUNT}"
echo "Lake bucket:  ${LAKE}"
echo "Database:     ${DATABASE}"
if [ -n "$BEFORE_DATE" ]; then
  echo "Before:       ${BEFORE_DATE} (exclusive)"
fi
if [ "$DRY_RUN" = true ]; then
  echo "Mode:         dry run (mapping and counts only, nothing copied or deleted)"
else
  echo "Mode:         copy and delete registered partitions"
fi
echo ""

# Each line is "<curated prefix> <glue table name, or - when no partition is registered for it>".
DATASETS='curated/activity-events/ activity_events
curated/alarm-state-changes/ alarm_state_changes
curated/tables/bundles/ -
curated/tables/passes/ -
curated/tables/receipts/ -
curated/tables/subscriptions/ -'

# Builds the src -> dst mapping for one curated prefix as a TSV file: src key, dst key, year,
# month, day (zero-padded, as they appear in the S3 path), then year, month, day again unpadded
# (as Glue stores partition Values). Keys that are not already under year=/month=/day= are left
# out, so a rerun after the lake also holds dt= objects does not try to relayout its own output.
build_mapping() {
  local prefix="$1"
  local out_file="$2"

  aws s3api list-objects-v2 --bucket "$LAKE" --prefix "$prefix" --output json \
    | jq -r --arg before "$BEFORE_DATE" '
        .Contents[]?
        | .Key as $k
        | select($k | test("year=[0-9]{4}/month=[0-9]{2}/day=[0-9]{2}/[^/]+$"))
        | ($k | capture("year=(?<y>[0-9]{4})/month=(?<m>[0-9]{2})/day=(?<d>[0-9]{2})/(?<f>[^/]+)$")) as $c
        | ($c.y + "-" + $c.m + "-" + $c.d) as $date
        | select($before == "" or $date < $before)
        | [
            $k,
            ($k | sub("year=[0-9]{4}/month=[0-9]{2}/day=[0-9]{2}/"; "dt=" + $date + "/")),
            $c.y,
            $c.m,
            $c.d,
            ($c.y | tonumber | tostring),
            ($c.m | tonumber | tostring),
            ($c.d | tonumber | tostring)
          ]
        | @tsv
      ' > "$out_file"
}

# Deletes the registered partitions of $1 (a Glue table name) whose "year month day" (unpadded,
# one per line, from $2) was among the days copied. Skips cleanly when the table has no
# registered partitions, or none of them match a copied day.
delete_relayouted_partitions() {
  local table="$1"
  local touched_file="$2"

  local registered
  registered="$(aws glue get-partitions --database-name "$DATABASE" --table-name "$table" \
    --query 'Partitions[].Values' --output text 2> /dev/null || true)"

  if [ -z "$registered" ]; then
    echo "  ${table}: no partitions registered, nothing to delete"
    return 0
  fi

  local batch_file="$WORKDIR/${table}-batch.json"
  echo '[]' > "$batch_file"

  local y m d
  while IFS=$'\t' read -r y m d; do
    [ -z "$y" ] && continue
    if grep -qxF "${y} ${m} ${d}" "$touched_file"; then
      jq --arg y "$y" --arg m "$m" --arg d "$d" '. + [{"Values": [$y, $m, $d]}]' \
        "$batch_file" > "$batch_file.tmp"
      mv "$batch_file.tmp" "$batch_file"
    fi
  done <<< "$registered"

  local to_delete
  to_delete="$(jq 'length' "$batch_file")"
  if [ "$to_delete" -eq 0 ]; then
    echo "  ${table}: registered partitions exist, none match a copied day"
    return 0
  fi

  echo "  ${table}: deleting ${to_delete} registered partition(s)"
  local offset=0
  local result_file="$WORKDIR/${table}-batch-delete-result.json"
  while [ "$offset" -lt "$to_delete" ]; do
    jq --argjson offset "$offset" --argjson size "$BATCH_DELETE_PARTITION_LIMIT" \
      '.[$offset:($offset + $size)]' "$batch_file" > "$batch_file.chunk"
    aws glue batch-delete-partition \
      --database-name "$DATABASE" \
      --table-name "$table" \
      --partitions-to-delete "file://$batch_file.chunk" > "$result_file"
    if jq -e '(.Errors // []) | length > 0' "$result_file" > /dev/null; then
      echo "error: glue batch-delete-partition reported errors for ${table}:" >&2
      cat "$result_file" >&2
      exit 1
    fi
    offset=$((offset + BATCH_DELETE_PARTITION_LIMIT))
  done
}

TOTAL_OBJECTS=0

while read -r prefix glue_table; do
  [ -z "$prefix" ] && continue
  echo "=== ${prefix} ==="

  mapping_file="$WORKDIR/$(echo "$prefix" | tr '/' '-')mapping.tsv"
  build_mapping "$prefix" "$mapping_file"

  count="$(wc -l < "$mapping_file" | tr -d ' ')"
  days="$(cut -f3,4,5 "$mapping_file" | sort -u | wc -l | tr -d ' ')"
  echo "  ${count} object(s) across ${days} day(s)"

  while IFS=$'\t' read -r src dst; do
    [ -z "$src" ] && continue
    echo "  ${src} -> ${dst}"
  done < <(cut -f1,2 "$mapping_file")

  if [ "$DRY_RUN" != true ] && [ "$count" -gt 0 ]; then
    while IFS=$'\t' read -r src dst; do
      [ -z "$src" ] && continue
      aws s3api copy-object \
        --bucket "$LAKE" \
        --copy-source "${LAKE}/${src}" \
        --key "$dst" \
        --metadata-directive COPY > /dev/null
    done < <(cut -f1,2 "$mapping_file")
    echo "  copied ${count} object(s)"

    if [ "$glue_table" != "-" ]; then
      touched_file="$WORKDIR/$(echo "$prefix" | tr '/' '-')touched.txt"
      cut -f6,7,8 "$mapping_file" | tr '\t' ' ' | sort -u > "$touched_file"
      delete_relayouted_partitions "$glue_table" "$touched_file"
    fi
  fi

  TOTAL_OBJECTS=$((TOTAL_OBJECTS + count))
  echo ""
done <<< "$DATASETS"

echo "=== summary ==="
echo "total objects mapped: ${TOTAL_OBJECTS}"
if [ "$DRY_RUN" = true ]; then
  echo "dry run: nothing copied, no partitions deleted"
else
  echo "copied ${TOTAL_OBJECTS} object(s) into dt= prefixes"
fi
