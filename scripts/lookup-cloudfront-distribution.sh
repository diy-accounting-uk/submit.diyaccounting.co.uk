#!/usr/bin/env bash
# Print the ID of the live CloudFront distribution serving an origin domain.
#
# Usage: scripts/lookup-cloudfront-distribution.sh <origin-domain> [edge-stack-name]
#
# Reads the DistributionId output of the EdgeStack first when a stack name is
# given. Falls back to the OriginFor tag via the Resource Groups Tagging API,
# whose index is eventually consistent and can still list a distribution that
# has been deleted, so every candidate is checked with get-distribution and
# only an ID CloudFront confirms is printed.
set -euo pipefail

ORIGIN_DOMAIN="${1:?origin domain required}"
EDGE_STACK_NAME="${2:-}"

distribution_exists() {
  aws cloudfront get-distribution --id "$1" --query 'Distribution.Id' --output text >/dev/null 2>&1
}

if [ -n "$EDGE_STACK_NAME" ]; then
  echo "Reading DistributionId output from stack ${EDGE_STACK_NAME}" >&2
  STACK_DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name "${EDGE_STACK_NAME}" --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
    --output text 2>/dev/null || echo "")
  if [ -n "$STACK_DISTRIBUTION_ID" ] && [ "$STACK_DISTRIBUTION_ID" != "None" ]; then
    if distribution_exists "$STACK_DISTRIBUTION_ID"; then
      echo "Found CloudFront Distribution ID from stack output: ${STACK_DISTRIBUTION_ID}" >&2
      echo "$STACK_DISTRIBUTION_ID"
      exit 0
    fi
    echo "Stack output names distribution ${STACK_DISTRIBUTION_ID} but CloudFront reports it does not exist" >&2
  else
    echo "No DistributionId output on stack ${EDGE_STACK_NAME}" >&2
  fi
fi

echo "Looking up CloudFront distribution with OriginFor tag: ${ORIGIN_DOMAIN}" >&2
CANDIDATE_ARNS=$(aws resourcegroupstaggingapi get-resources \
  --resource-type-filters cloudfront:distribution \
  --region us-east-1 \
  --tag-filters "Key=OriginFor,Values=${ORIGIN_DOMAIN}" \
  --query 'ResourceTagMappingList[].ResourceARN' \
  --output text 2>/dev/null || echo "")

for ARN in $CANDIDATE_ARNS; do
  [ "$ARN" = "None" ] && continue
  CANDIDATE_ID="${ARN##*/}"
  if distribution_exists "$CANDIDATE_ID"; then
    echo "Found CloudFront Distribution ID from OriginFor tag: ${CANDIDATE_ID}" >&2
    echo "$CANDIDATE_ID"
    exit 0
  fi
  echo "Tag index lists distribution ${CANDIDATE_ID} but CloudFront reports it does not exist; skipping" >&2
done

echo "ERROR: No live CloudFront distribution found for ${ORIGIN_DOMAIN}" >&2
exit 1
