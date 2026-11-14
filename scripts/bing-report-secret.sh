#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# scripts/bing-report-secret.sh
#
# Runs the given command with BING_WEBMASTER_API_KEY set in its environment. A value already in
# the environment is kept. Otherwise the value is read from AWS Secrets Manager with the prod SSO
# profile and goes to the child process environment only.
# Usage: scripts/bing-report-secret.sh node infra/bing/webmaster-report.js --out target/bing-webmaster-report.json

set -euo pipefail

PROFILE="${AWS_PROFILE:-diya-submit-prod}"
REGION="eu-west-2"
SECRET_ID="prod/submit/bing/webmaster_api_key"

if [ -z "${BING_WEBMASTER_API_KEY:-}" ]; then
  if ! aws --profile "$PROFILE" sts get-caller-identity >/dev/null 2>&1; then
    echo "AWS SSO session for profile '$PROFILE' has expired. Run: aws sso login --sso-session diyaccounting" >&2
    exit 1
  fi
  BING_WEBMASTER_API_KEY="$(aws --profile "$PROFILE" secretsmanager get-secret-value \
    --secret-id "$SECRET_ID" --region "$REGION" --query SecretString --output text)"
  export BING_WEBMASTER_API_KEY
fi

exec "$@"
