#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# End-to-end check of the activity event pipeline: EventBridge to Firehose to S3 to Athena.
#
# Publishes one synthetic activity event, waits out the Firehose buffer, confirms an object
# landed in today's partition and queries it back through the Athena workgroup. Read-only
# apart from that one event.
#
# Usage: scripts/verify-analytics-pipeline.sh [environment-name]
#
#   AWS_PROFILE=submit-ci scripts/verify-analytics-pipeline.sh ci
#   AWS_PROFILE=submit-prod scripts/verify-analytics-pipeline.sh prod

set -euo pipefail

ENV_NAME="${1:-ci}"
REGION="${AWS_REGION:-eu-west-2}"
# Firehose buffers for 300s; the extra 30s covers delivery and the S3 write.
BUFFER_WAIT_SECONDS="${BUFFER_WAIT_SECONDS:-930}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUS="${ENV_NAME}-env-activity-bus"
LAKE="${ENV_NAME}-env-analytics-lake-${ACCOUNT}"
WORKGROUP="${ENV_NAME}-env-analytics"
DATABASE="${ENV_NAME}_env_analytics"
STREAM="${ENV_NAME}-env-activity-events"

echo "Environment:    ${ENV_NAME}"
echo "Account:        ${ACCOUNT}"
echo "Activity bus:   ${BUS}"
echo "Lake bucket:    ${LAKE}"
echo "Athena:         ${WORKGROUP} / ${DATABASE}"
echo ""

# Step 1: publish one event through the same bus the app publishes to.
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ENTRIES="$(node -e '
const [bus, now] = process.argv.slice(1);
const detail = {
  event: "pipeline-verification",
  site: "submit",
  summary: "pipeline verification",
  actor: "synthetic",
  flow: "operational",
  timestamp: now,
};
console.log(
  JSON.stringify([
    { EventBusName: bus, Source: "diy.submit", DetailType: "ActivityEvent", Detail: JSON.stringify(detail) },
  ]),
);
' "${BUS}" "${NOW}")"

echo "Step 1: publishing a pipeline-verification event at ${NOW}"
aws events put-events --region "${REGION}" --entries "${ENTRIES}"

# Step 2: wait out the buffer, then look for an object in today's partition.
echo ""
echo "Step 2: waiting ${BUFFER_WAIT_SECONDS}s for the Firehose buffer to flush"
sleep "${BUFFER_WAIT_SECONDS}"

PARTITION="year=$(date -u +%Y)/month=$(date -u +%m)/day=$(date -u +%d)"
echo "Listing s3://${LAKE}/curated/activity-events/${PARTITION}/"
if ! aws s3 ls "s3://${LAKE}/curated/activity-events/${PARTITION}/" --recursive | tee /dev/stderr | grep -q .; then
  echo ""
  echo "FAIL: nothing landed in today's partition."
  echo "Check the Firehose log group first, a transform Lambda that returns a malformed"
  echo "response shows up there and nowhere else:"
  echo "  aws logs tail /aws/kinesisfirehose/${STREAM} --since 30m"
  exit 1
fi

# Step 3: query it back. The projection columns are integers while the S3 path is zero-padded,
# so the predicate uses unpadded numbers.
echo ""
echo "Step 3: querying the event back through Athena"
QUERY="SELECT event, count(*) AS c FROM ${DATABASE}.activity_events_all WHERE year=$(date -u +%Y) AND month=$(date -u +%-m) AND day=$(date -u +%-d) GROUP BY 1"
QUERY_ID="$(aws athena start-query-execution \
  --region "${REGION}" \
  --work-group "${WORKGROUP}" \
  --query-string "${QUERY}" \
  --query QueryExecutionId --output text)"

STATE="RUNNING"
for _ in $(seq 1 60); do
  STATE="$(aws athena get-query-execution --region "${REGION}" --query-execution-id "${QUERY_ID}" \
    --query 'QueryExecution.Status.State' --output text)"
  case "${STATE}" in
    SUCCEEDED|FAILED|CANCELLED) break ;;
  esac
  sleep 2
done

if [ "${STATE}" != "SUCCEEDED" ]; then
  echo "FAIL: Athena query ${QUERY_ID} ended in state ${STATE}"
  aws athena get-query-execution --region "${REGION}" --query-execution-id "${QUERY_ID}" \
    --query 'QueryExecution.Status.StateChangeReason' --output text
  exit 1
fi

RESULTS="$(aws athena get-query-results --region "${REGION}" --query-execution-id "${QUERY_ID}")"
echo "${RESULTS}"

if ! printf '%s' "${RESULTS}" | grep -q "pipeline-verification"; then
  echo ""
  echo "FAIL: the query succeeded but returned no pipeline-verification row."
  exit 1
fi

echo ""
echo "PASS: the pipeline-verification event went from EventBridge to Athena."
