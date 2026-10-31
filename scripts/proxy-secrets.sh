#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# @capability DEV-15 Fetch and publish proxy-variant secrets
# - **Use when:** a local proxy-variant run needs HMRC/Stripe secrets, or a renewed local TLS certificate needs publishing.
# - **Does:** proxy-secrets.sh checks the AWS SSO session, then fetches the proxy variant's HMRC and Stripe secrets from Secrets Manager. It execs a given command with those secrets set in its environment. local-tls-publish.sh is a certbot deploy-hook that publishes a renewed local TLS certificate to Secrets Manager for CI.
# - **Run:** `scripts/proxy-secrets.sh npm run test:submitVatBehaviour-proxy`; `scripts/local-tls-publish.sh`
# - **Entry:** `scripts/proxy-secrets.sh`; `scripts/local-tls-publish.sh`
# - **Files:** scripts/proxy-secrets.sh, scripts/local-tls-publish.sh
# - **Keywords:** proxy secrets, secrets manager, hmrc secrets, stripe secrets, local tls, certbot deploy hook, certificate publish
# - **Related:** DEV-14
# @end-capability

#
# scripts/proxy-secrets.sh
#
# Fetches the proxy variant's HMRC and Stripe secrets from AWS Secrets Manager
# and execs the given command with them set in its environment.
# Usage: scripts/proxy-secrets.sh npm run test:submitVatBehaviour-proxy

set -euo pipefail

PROFILE="${AWS_PROFILE:-diya-submit-ci}"
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
