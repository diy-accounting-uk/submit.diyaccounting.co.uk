#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# scripts/stripe-setup-secrets.sh
#
# Stores Stripe configuration in AWS Secrets Manager.
# Usage: ./scripts/stripe-setup-secrets.sh <env> <secret_key> <webhook_secret> <price_id>
#   e.g.: ./scripts/stripe-setup-secrets.sh ci sk_test_xxx whsec_xxx price_xxx

set -euo pipefail

ENV="${1:?Usage: $0 <env> <secret_key> <webhook_secret> <price_id>}"
SECRET_KEY="${2:?Missing secret_key}"
WEBHOOK_SECRET="${3:?Missing webhook_secret}"
PRICE_ID="${4:?Missing price_id}"

REGION="${AWS_REGION:-eu-west-2}"

create_or_update_secret() {
  local name="$1"
  local value="$2"

  if aws secretsmanager describe-secret --secret-id "$name" --region "$REGION" >/dev/null 2>&1; then
    echo "Updating secret: $name"
    aws secretsmanager put-secret-value --secret-id "$name" --secret-string "$value" --region "$REGION"
  else
    echo "Creating secret: $name"
    aws secretsmanager create-secret --name "$name" --secret-string "$value" --region "$REGION"
  fi
}

create_or_update_secret "${ENV}/submit/stripe/secret_key" "$SECRET_KEY"
create_or_update_secret "${ENV}/submit/stripe/webhook_secret" "$WEBHOOK_SECRET"
create_or_update_secret "${ENV}/submit/stripe/price_id" "$PRICE_ID"

echo "Stripe secrets stored for environment: ${ENV}"
