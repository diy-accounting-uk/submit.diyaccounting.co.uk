#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Copies the Google client secret in Secrets Manager into the Cognito Google identity provider.
# Cognito keeps its own copy, so it keeps the old value until this runs.
#
# Usage: scripts/refresh-google-identity-provider.sh <environment-name> [user-pool-id]
#   <environment-name>  ci or prod
#   [user-pool-id]      the Cognito user pool; read from the IdentityStack output when absent
#
# Requires AWS credentials already assumed for the target account. Never prints the secret value.

set -euo pipefail

ENV_NAME="${1:?Usage: refresh-google-identity-provider.sh <environment-name> [user-pool-id]}"
REGION="${AWS_REGION:-eu-west-2}"
USER_POOL_ID="${2:-}"

if [ -z "$USER_POOL_ID" ]; then
  USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "${ENV_NAME}-env-IdentityStack" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue | [0]" --output text)
fi

echo "Refreshing the Google identity provider of user pool $USER_POOL_ID"

CURRENT_CONFIG=$(aws cognito-idp describe-identity-provider \
  --user-pool-id "$USER_POOL_ID" \
  --provider-name Google \
  --region "$REGION" \
  --query 'IdentityProvider.ProviderDetails' \
  --output json)

CURRENT_ATTRS=$(aws cognito-idp describe-identity-provider \
  --user-pool-id "$USER_POOL_ID" \
  --provider-name Google \
  --region "$REGION" \
  --query 'IdentityProvider.AttributeMapping' \
  --output json)

NEW_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "${ENV_NAME}/submit/google/client_secret" \
  --region "$REGION" \
  --query 'SecretString' \
  --output text)
echo "::add-mask::$NEW_SECRET"

CLIENT_ID=$(echo "$CURRENT_CONFIG" | jq -r '.client_id')

aws cognito-idp update-identity-provider \
  --user-pool-id "$USER_POOL_ID" \
  --provider-name Google \
  --region "$REGION" \
  --provider-details "client_id=$CLIENT_ID,client_secret=$NEW_SECRET,authorize_scopes=email openid profile" \
  --attribute-mapping "$CURRENT_ATTRS" >/dev/null

echo "Google identity provider updated with the current secret"
