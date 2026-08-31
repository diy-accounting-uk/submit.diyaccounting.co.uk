#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Seven-day row counts per scheduled ingestion source: activity events, DynamoDB table
# changes, Stripe reconciliation, GA4 traffic and CloudFront access logs.
#
# Read-only. Every check is an Athena SELECT against the {env}-env-analytics workgroup (which
# already has its own query-result output location configured, so this script names none) or
# an S3 listing against objects the jobs already wrote.
#
# A missing partition (no object under that day's prefix: the job did not run or did not
# write) and a present-but-empty partition (an object exists, the query found zero rows: the
# job ran and found nothing) are different failures and are reported separately.
#
# Usage: scripts/verify-ingestion-jobs.sh [environment-name]
#
#   AWS_PROFILE=submit-ci scripts/verify-ingestion-jobs.sh ci
#   AWS_PROFILE=submit-prod scripts/verify-ingestion-jobs.sh prod

set -euo pipefail

ENV_NAME="${1:-ci}"
REGION="${AWS_REGION:-eu-west-2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
LAKE="${ENV_NAME}-env-analytics-lake-${ACCOUNT}"
WORKGROUP="${ENV_NAME}-env-analytics"
DATABASE="${ENV_NAME}_env_analytics"

echo "Environment:    ${ENV_NAME}"
echo "Account:        ${ACCOUNT}"
echo "Lake bucket:    ${LAKE}"
echo "Athena:         ${WORKGROUP} / ${DATABASE}"
echo ""

# The last 7 UTC calendar days, oldest first. Computed in node rather than `date -d`/`date -v`
# so this runs the same on macOS and on a GitHub Actions Linux runner. Built with a plain
# while-read loop rather than `readarray`, and looked up below with a linear scan rather than
# an associative array, because macOS ships bash 3.2 and this script's shebang is /bin/bash.
DATES=()
while IFS= read -r line; do
  DATES+=("${line}")
done < <(node -e '
for (let i = 6; i >= 0; i--) {
  const d = new Date(Date.now() - i * 86400000);
  console.log(d.toISOString().slice(0, 10));
}
')

# --- resolve the CloudFront distribution id -------------------------------------------------
# cloudfront_requests partitions on distribution_id as "injected" (see CloudFrontAccessLogs.java),
# which means the Glue catalog never lists a value: a query has to name the distribution it
# wants. Same resolution deploy-app.js uses for CloudFront invalidation: SSM
# last-known-good-deployment, then the deployment's EdgeStack DistributionId output. Falls back
# to the newest live EdgeStack in this environment if the SSM pointer names a deployment whose
# stack no longer exists.
resolve_distribution_id() {
  local deployment origin edge_stack dist_id

  deployment="$(aws ssm get-parameter --name "/submit/${ENV_NAME}/last-known-good-deployment" \
    --query 'Parameter.Value' --output text 2>/dev/null || echo "")"

  if [ -n "${deployment}" ] && [ "${deployment}" != "None" ]; then
    origin="${deployment}.submit.diyaccounting.co.uk"
    edge_stack="${deployment}-app-EdgeStack"
    dist_id="$("${SCRIPT_DIR}/lookup-cloudfront-distribution.sh" "${origin}" "${edge_stack}" 2>/dev/null || echo "")"
    if [ -n "${dist_id}" ]; then
      echo "${dist_id}"
      return 0
    fi
    echo "WARN: SSM /submit/${ENV_NAME}/last-known-good-deployment names '${deployment}', but stack ${edge_stack} does not exist (or has no live distribution). Falling back to a live EdgeStack scan." >&2
  else
    echo "WARN: no SSM parameter /submit/${ENV_NAME}/last-known-good-deployment. Falling back to a live EdgeStack scan." >&2
  fi

  edge_stack="$(aws cloudformation list-stacks --region us-east-1 \
    --query "StackSummaries[?starts_with(StackName, '${ENV_NAME}-') && ends_with(StackName, '-app-EdgeStack') && StackStatus != 'DELETE_COMPLETE'] | [0].StackName" \
    --output text 2>/dev/null || echo "")"
  if [ -z "${edge_stack}" ] || [ "${edge_stack}" = "None" ]; then
    return 1
  fi
  deployment="${edge_stack%-app-EdgeStack}"
  origin="${deployment}.submit.diyaccounting.co.uk"
  echo "Using live EdgeStack ${edge_stack} (deployment ${deployment}) instead" >&2
  "${SCRIPT_DIR}/lookup-cloudfront-distribution.sh" "${origin}" "${edge_stack}"
}

DISTRIBUTION_ID="$(resolve_distribution_id || echo "")"
if [ -n "${DISTRIBUTION_ID}" ]; then
  echo "CloudFront distribution: ${DISTRIBUTION_ID}"
else
  echo "WARN: could not resolve a CloudFront distribution id; cloudfront_requests will be skipped."
fi
echo ""

# Runs one query to a terminal state and prints its result rows as TSV (no header). Exits
# non-zero, with the state change reason, on anything other than SUCCEEDED.
run_athena_query() {
  local query="$1"
  local query_id state

  query_id="$(aws athena start-query-execution \
    --region "${REGION}" \
    --work-group "${WORKGROUP}" \
    --query-string "${query}" \
    --query QueryExecutionId --output text 2>&1)"
  if [ -z "${query_id}" ] || [[ "${query_id}" == *"error"* ]] || [[ "${query_id}" == *"Error"* ]]; then
    echo "FAIL: could not start Athena query: ${query_id}" >&2
    return 1
  fi

  state="RUNNING"
  for _ in $(seq 1 60); do
    state="$(aws athena get-query-execution --region "${REGION}" --query-execution-id "${query_id}" \
      --query 'QueryExecution.Status.State' --output text)"
    case "${state}" in
      SUCCEEDED|FAILED|CANCELLED) break ;;
    esac
    sleep 2
  done

  if [ "${state}" != "SUCCEEDED" ]; then
    echo "FAIL: Athena query ${query_id} ended in state ${state}" >&2
    aws athena get-query-execution --region "${REGION}" --query-execution-id "${query_id}" \
      --query 'QueryExecution.Status.StateChangeReason' --output text >&2
    return 1
  fi

  aws athena get-query-results --region "${REGION}" --query-execution-id "${query_id}" --output json \
    | jq -r '.ResultSet.Rows[1:][] | [.Data[].VarCharValue] | @tsv'
}

# Builds the OR-of-tuples predicate for a year/month/day-partitioned table over DATES.
build_ymd_predicate() {
  local out="" d rest y m dd
  for d in "${DATES[@]}"; do
    y="${d%%-*}"
    rest="${d#*-}"
    m="${rest%%-*}"
    dd="${rest#*-}"
    m=$((10#${m}))
    dd=$((10#${dd}))
    if [ -n "${out}" ]; then out="${out} OR "; fi
    out="${out}(year=${y} AND month=${m} AND day=${dd})"
  done
  printf '%s' "${out}"
}

# Builds the dt IN (...) list for a dt-partitioned table over DATES.
build_dt_list() {
  local out="" d
  for d in "${DATES[@]}"; do
    if [ -n "${out}" ]; then out="${out},"; fi
    out="${out}date '${d}'"
  done
  printf '%s' "${out}"
}

OVERALL_STATUS=0

# Checks one Glue table. Arguments:
#   $1 label            display name for the report
#   $2 table            Glue table name to query
#   $3 style             "dt" or "ymd"
#   $4 s3_prefix_prefix  s3 key prefix up to and including the partition, e.g.
#                        "curated/stripe/stripe_charges/dt=" (style dt) or
#                        "curated/activity-events/" (style ymd, day appended as year=Y/month=M/day=D/)
#   $5 required          "required" if the phase-1 verification criterion needs this non-zero
check_source() {
  local label="$1" table="$2" style="$3" s3_prefix_prefix="$4" required="$5"
  local query counts_tsv
  local COUNT_DAYS=() COUNT_VALS=()

  echo "--- ${label} (${table}) ---"

  if [ "${style}" = "dt" ]; then
    query="SELECT cast(dt AS varchar), count(*) FROM ${DATABASE}.${table} WHERE dt IN ($(build_dt_list)) GROUP BY dt ORDER BY dt"
  else
    local where
    where="$(build_ymd_predicate)"
    if [ "${table}" = "cloudfront_requests" ]; then
      if [ -z "${DISTRIBUTION_ID}" ]; then
        echo "SKIPPED: no CloudFront distribution id resolved."
        echo ""
        return 0
      fi
      where="distribution_id = '${DISTRIBUTION_ID}' AND (${where})"
    fi
    query="SELECT year, month, day, count(*) FROM ${DATABASE}.${table} WHERE ${where} GROUP BY year, month, day ORDER BY year, month, day"
  fi

  if ! counts_tsv="$(run_athena_query "${query}")"; then
    echo "FAIL: Athena query against ${table} did not succeed."
    OVERALL_STATUS=1
    echo ""
    return 0
  fi

  if [ "${style}" = "dt" ]; then
    while IFS=$'\t' read -r day count; do
      [ -z "${day}" ] && continue
      COUNT_DAYS+=("${day}")
      COUNT_VALS+=("${count}")
    done <<< "${counts_tsv}"
  else
    while IFS=$'\t' read -r y m d count; do
      [ -z "${y}" ] && continue
      printf -v day '%04d-%02d-%02d' "${y}" "${m}" "${d}"
      COUNT_DAYS+=("${day}")
      COUNT_VALS+=("${count}")
    done <<< "${counts_tsv}"
  fi

  local any_partition=false
  local any_nonzero=false
  for d in "${DATES[@]}"; do
    local prefix count exists rest
    if [ "${style}" = "dt" ]; then
      prefix="${s3_prefix_prefix}${d}/"
    else
      local y m dd
      y="${d%%-*}"
      rest="${d#*-}"
      m="${rest%%-*}"
      dd="${rest#*-}"
      prefix="${s3_prefix_prefix}year=${y}/month=${m}/day=${dd}/"
    fi

    count=""
    local idx
    for idx in "${!COUNT_DAYS[@]}"; do
      if [ "${COUNT_DAYS[${idx}]}" = "${d}" ]; then
        count="${COUNT_VALS[${idx}]}"
        break
      fi
    done
    if aws s3api list-objects-v2 --bucket "${LAKE}" --prefix "${prefix}" --max-items 1 \
        --query 'Contents[0].Key' --output text 2>/dev/null | grep -qv '^None$'; then
      exists=true
    else
      exists=false
    fi

    if [ "${exists}" = true ]; then
      any_partition=true
      if [ -n "${count}" ] && [ "${count}" != "0" ]; then
        any_nonzero=true
        printf '  %s  OK       rows=%s\n' "${d}" "${count}"
      else
        printf '  %s  EMPTY    ran, wrote 0 rows\n' "${d}"
      fi
    else
      printf '  %s  MISSING  job did not run or did not write\n' "${d}"
    fi
  done

  if [ "${any_partition}" = false ]; then
    echo "FAIL: ${label} has no partition at all in the last seven days."
    OVERALL_STATUS=1
  elif [ "${required}" = "required" ] && [ "${any_nonzero}" = false ]; then
    echo "FAIL: ${label} is required to show a non-zero day and every day is empty or missing."
    OVERALL_STATUS=1
  fi
  echo ""
}

check_source "Activity events"        "activity_events_all"  "ymd" "curated/activity-events/"        "required"
check_source "Table changes: receipts"      "dynamo_receipts"      "ymd" "curated/tables/receipts/"        "optional"
check_source "Table changes: bundles"       "dynamo_bundles"       "ymd" "curated/tables/bundles/"         "optional"
check_source "Table changes: subscriptions" "dynamo_subscriptions" "ymd" "curated/tables/subscriptions/"   "optional"
check_source "Table changes: passes"        "dynamo_passes"        "ymd" "curated/tables/passes/"          "optional"
check_source "Stripe charges"         "stripe_charges"       "dt"  "curated/stripe/stripe_charges/dt="        "optional"
check_source "Stripe subscriptions"   "stripe_subscriptions" "dt"  "curated/stripe/stripe_subscriptions/dt="  "required"
check_source "GA4 traffic"            "ga4_traffic"           "dt"  "curated/ga4/report=traffic/dt="           "required"
check_source "CloudFront requests"    "cloudfront_requests"  "ymd" "raw/cloudfront/distributionid=${DISTRIBUTION_ID}/" "required"

if [ "${OVERALL_STATUS}" -eq 0 ]; then
  echo "PASS: every source has at least one partition in the last seven days, and every required source shows a non-zero day."
else
  echo "FAIL: see above."
fi
exit "${OVERALL_STATUS}"
