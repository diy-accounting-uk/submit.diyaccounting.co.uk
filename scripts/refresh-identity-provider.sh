#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Copies a client secret in Secrets Manager into the matching Cognito identity provider.
# Cognito keeps its own copy, so it keeps the old value until this runs.
# The script reads the provider details back from Cognito and changes only client_secret.
#
# Usage: scripts/refresh-identity-provider.sh <environment-name> <provider> [user-pool-id]
#   <environment-name>  ci or prod
#   <provider>          Google, Microsoft, or all (every provider the user pool has)
#   [user-pool-id]      the Cognito user pool; read from the IdentityStack output when absent
#
# Requires AWS credentials already assumed for the target account. Never prints the secret value.

set -euo pipefail

ENV_NAME="${1:?Usage: refresh-identity-provider.sh <environment-name> <provider> [user-pool-id]}"
PROVIDER="${2:?Usage: refresh-identity-provider.sh <environment-name> <provider> [user-pool-id]}"
REGION="${AWS_REGION:-eu-west-2}"
USER_POOL_ID="${3:-}"

if [ -z "$USER_POOL_ID" ]; then
  USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "${ENV_NAME}-env-IdentityStack" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue | [0]" --output text)
fi

refresh_one() {
  local provider_name="$1"
  local secret_suffix

  case "$provider_name" in
    Google) secret_suffix="google/client_secret" ;;
    Microsoft) secret_suffix="microsoft/client_secret" ;;
    *)
      echo "::error::No client secret is known for the identity provider: $provider_name" >&2
      return 1
      ;;
  esac

  echo "Refreshing the $provider_name identity provider of user pool $USER_POOL_ID"

  local current_details current_attrs new_secret new_details
  current_details=$(aws cognito-idp describe-identity-provider \
    --user-pool-id "$USER_POOL_ID" \
    --provider-name "$provider_name" \
    --region "$REGION" \
    --query 'IdentityProvider.ProviderDetails' \
    --output json)

  current_attrs=$(aws cognito-idp describe-identity-provider \
    --user-pool-id "$USER_POOL_ID" \
    --provider-name "$provider_name" \
    --region "$REGION" \
    --query 'IdentityProvider.AttributeMapping' \
    --output json)

  new_secret=$(aws secretsmanager get-secret-value \
    --secret-id "${ENV_NAME}/submit/${secret_suffix}" \
    --region "$REGION" \
    --query 'SecretString' \
    --output text)
  echo "::add-mask::$new_secret"

  new_details=$(echo "$current_details" | jq -c --arg secret "$new_secret" '. + {client_secret: $secret}')

  aws cognito-idp update-identity-provider \
    --user-pool-id "$USER_POOL_ID" \
    --provider-name "$provider_name" \
    --region "$REGION" \
    --provider-details "$new_details" \
    --attribute-mapping "$current_attrs" >/dev/null

  echo "$provider_name identity provider updated with the current secret"
}

if [ "$PROVIDER" = "all" ]; then
  PROVIDER_NAMES=$(aws cognito-idp list-identity-providers \
    --user-pool-id "$USER_POOL_ID" \
    --region "$REGION" \
    --query 'Providers[].ProviderName' \
    --output text)
  for name in $PROVIDER_NAMES; do
    refresh_one "$name"
  done
else
  refresh_one "$PROVIDER"
fi
