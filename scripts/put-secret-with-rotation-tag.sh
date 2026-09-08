#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 DIY Accounting Ltd
#
# Creates or updates a Secrets Manager secret and stamps it with a rotated-at tag,
# so the tag reflects the last time the value actually changed rather than the last
# time deploy-environment.yml ran. Every environment deploy rewrites every secret
# from the GitHub Environment regardless of whether the value changed, so Secrets
# Manager's own LastChangedDate always reads as "the last deploy" and never tells
# you when a secret was genuinely rotated. Never prints the secret value.
#
# Usage: scripts/put-secret-with-rotation-tag.sh <secret-name> <secret-value> [create-arg ...]
#   <secret-name>   e.g. ci/submit/hmrc/client_secret
#   <secret-value>  the value to write
#   [create-arg ...] extra arguments passed to `aws secretsmanager create-secret`
#                     only, when the secret does not exist yet (e.g. --description,
#                     --tags for purpose/criticality tags beyond rotated-at)
#
# Requires AWS credentials already assumed for the target account.

set -euo pipefail

SECRET_NAME="${1:?Usage: put-secret-with-rotation-tag.sh <secret-name> <secret-value> [create-arg ...]}"
NEW_VALUE="${2:?Usage: put-secret-with-rotation-tag.sh <secret-name> <secret-value> [create-arg ...]}"
shift 2
REGION="${AWS_REGION:-eu-west-2}"
ROTATED_AT="$(date -u +%Y-%m-%d)"

if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
  CURRENT_VALUE=$(aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" \
    --query 'SecretString' --output text --region "$REGION" 2>/dev/null || echo "")

  echo "Secret $SECRET_NAME already exists, updating"
  aws secretsmanager update-secret --secret-id "$SECRET_NAME" --secret-string "$NEW_VALUE" \
    --region "$REGION" >/dev/null

  if [ "$CURRENT_VALUE" != "$NEW_VALUE" ]; then
    echo "Secret $SECRET_NAME value changed, stamping rotated-at=$ROTATED_AT"
    aws secretsmanager tag-resource --secret-id "$SECRET_NAME" \
      --tags "Key=rotated-at,Value=$ROTATED_AT" --region "$REGION"
  else
    echo "Secret $SECRET_NAME value unchanged, leaving rotated-at alone"
  fi
else
  echo "Creating secret $SECRET_NAME"
  aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "$NEW_VALUE" \
    --region "$REGION" "$@" >/dev/null
  echo "Secret $SECRET_NAME created, stamping rotated-at=$ROTATED_AT"
  aws secretsmanager tag-resource --secret-id "$SECRET_NAME" \
    --tags "Key=rotated-at,Value=$ROTATED_AT" --region "$REGION"
fi
