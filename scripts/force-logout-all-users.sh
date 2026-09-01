#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Force every user in an environment's Cognito user pool to sign out immediately,
# for the cross-account hold in RUNBOOK_INFORMATION_SECURITY.md section 6.6.
#
# Calls admin-user-global-sign-out per user. Every refresh token dies immediately;
# an access token already issued stays valid until its own exp, up to an hour later
# (Cognito access tokens are short-lived by default). Say that plainly in the
# incident record -- it decides whether the salt rotation in section 6.6 step 5
# can wait.
#
# Usage: scripts/force-logout-all-users.sh <env>
#
# Prerequisites: AWS credentials already assumed for the target account, e.g.
#   . ./scripts/aws-assume-submit-deployment-role.sh

set -euo pipefail

ENV_NAME="${1:?Usage: force-logout-all-users.sh <env>}"
REGION="${AWS_REGION:-eu-west-2}"
STACK_NAME="${ENV_NAME}-env-IdentityStack"

echo "Looking up user pool from stack ${STACK_NAME}"
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)

if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "None" ]; then
  echo "ERROR: Could not find UserPoolId output on stack ${STACK_NAME}"
  exit 1
fi

echo "User pool: ${USER_POOL_ID}"
echo ""

SIGNED_OUT=0
FAILED=0
PAGINATION_TOKEN=""

while :; do
  if [ -n "$PAGINATION_TOKEN" ]; then
    PAGE=$(aws cognito-idp list-users --user-pool-id "$USER_POOL_ID" --region "$REGION" \
      --pagination-token "$PAGINATION_TOKEN" --output json)
  else
    PAGE=$(aws cognito-idp list-users --user-pool-id "$USER_POOL_ID" --region "$REGION" --output json)
  fi

  USERNAMES=$(echo "$PAGE" | jq -r '.Users[].Username')
  while IFS= read -r USERNAME; do
    [ -z "$USERNAME" ] && continue
    if aws cognito-idp admin-user-global-sign-out \
      --user-pool-id "$USER_POOL_ID" --username "$USERNAME" --region "$REGION" >/dev/null 2>&1; then
      SIGNED_OUT=$((SIGNED_OUT + 1))
    else
      echo "  Failed to sign out: ${USERNAME}"
      FAILED=$((FAILED + 1))
    fi
  done <<<"$USERNAMES"

  PAGINATION_TOKEN=$(echo "$PAGE" | jq -r '.PaginationToken // empty')
  [ -z "$PAGINATION_TOKEN" ] && break
done

echo ""
echo "Signed out ${SIGNED_OUT} user(s) in ${ENV_NAME}. Failures: ${FAILED}."
echo "Refresh tokens are dead now. Access tokens issued before this run stay valid until their own exp."

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
