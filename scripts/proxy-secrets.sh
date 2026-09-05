#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# scripts/proxy-secrets.sh
#
# Fetches the proxy variant's HMRC and Stripe secrets from AWS Secrets Manager
# and execs the given command with them set in its environment.
# Usage: scripts/proxy-secrets.sh npm run test:submitVatBehaviour-proxy

set -euo pipefail

PROFILE="${AWS_PROFILE:-submit-ci}"
REGION="eu-west-2"

if ! aws --profile "$PROFILE" sts get-caller-identity >/dev/null 2>&1; then
  echo "AWS SSO session for profile '$PROFILE' has expired. Run: aws sso login --sso-session diyaccounting" >&2
  exit 1
fi

get_secret() {
  aws --profile "$PROFILE" secretsmanager get-secret-value \
    --secret-id "$1" --region "$REGION" --query SecretString --output text
}

HMRC_SANDBOX_CLIENT_SECRET="$(get_secret ci/submit/hmrc/sandbox_client_secret)"
STRIPE_TEST_SECRET_KEY="$(get_secret ci/submit/stripe/test_secret_key)"

export HMRC_ACCOUNT=synthetic
export HMRC_SANDBOX_CLIENT_SECRET
export STRIPE_TEST_SECRET_KEY
export STRIPE_SECRET_KEY="$STRIPE_TEST_SECRET_KEY"
export STRIPE_API_KEY="$STRIPE_TEST_SECRET_KEY"

exec "$@"
