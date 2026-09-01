#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Read-only check that the scan-detection WAF rules did not block real traffic. Run it straight
# after a behaviour suite: a block during a synthetic run is a false positive by definition.
#
# Usage: scripts/verify-waf-false-positives.sh [environment-name] [minutes]
#
#   AWS_PROFILE=submit-ci scripts/verify-waf-false-positives.sh ci 30
#   AWS_PROFILE=submit-prod scripts/verify-waf-false-positives.sh prod

set -euo pipefail

ENV_NAME="${1:-ci}"
MINUTES="${2:-30}"
# WAF metrics for CloudFront are always in us-east-1, regardless of where the CLI's own region
# defaults to.
REGION="us-east-1"
WEB_ACL="${ENV_NAME}-app-waf"

END_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_TIME="$(date -u -v-"${MINUTES}"M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "-${MINUTES} minutes" +%Y-%m-%dT%H:%M:%SZ)"

echo "Environment:  ${ENV_NAME}"
echo "Web ACL:      ${WEB_ACL}"
echo "Window:       ${START_TIME} to ${END_TIME}"
echo ""

# Rules that must never block a genuine request. WafManualBlock and RateLimitRule are
# deliberately excluded: a manual block is a human decision, and the rate limit only trips under
# load no ordinary behaviour suite should generate.
RULES=(
  SensitivePathScan
  AWSManagedRulesCommonRuleSet
  AWSManagedRulesKnownBadInputsRuleSet
)

FAILED=0
for RULE in "${RULES[@]}"; do
  SUM="$(aws cloudwatch get-metric-statistics \
    --region "${REGION}" \
    --namespace AWS/WAFV2 \
    --metric-name BlockedRequests \
    --dimensions Name=WebACL,Value="${WEB_ACL}" Name=Region,Value=Global Name=Rule,Value="${RULE}" \
    --start-time "${START_TIME}" \
    --end-time "${END_TIME}" \
    --period "$((MINUTES * 60))" \
    --statistics Sum \
    --query 'Datapoints[0].Sum' \
    --output text)"

  if [ "${SUM}" = "None" ] || [ -z "${SUM}" ]; then
    SUM=0
  fi

  echo "${RULE}: ${SUM} blocked"
  if [ "$(printf '%.0f' "${SUM}")" -gt 0 ]; then
    FAILED=1
  fi
done

echo ""
if [ "${FAILED}" -eq 1 ]; then
  echo "FAIL: at least one rule blocked a request in the last ${MINUTES} minutes."
  echo "If a behaviour suite just ran, this is a false positive worth investigating before the"
  echo "next deploy: check AWS Console > WAF > ${WEB_ACL} > Sampled requests for the blocked URI."
  exit 1
fi

echo "PASS: none of ${RULES[*]} blocked anything in the last ${MINUTES} minutes."
