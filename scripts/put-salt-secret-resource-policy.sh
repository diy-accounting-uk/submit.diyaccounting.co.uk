#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Applies a resource policy to the user sub hash salt secret: allow the account,
# then deny every principal whose role ARN doesn't match the expected set. Run on
# every deploy (deploy-environment.yml, create-secrets job) so the policy is
# reasserted rather than left to drift.
#
# The salt secret is created before any per-deployment Lambda role exists, so the
# allow-list can't reference literal role ARNs -- it has to be a pattern. CDK
# truncates and hashes long generated role names (e.g. the AuthStack custom
# authorizer role is "<env>-<deployment>-app-AuthStac-<hash>-<suffix>", not
# "...-AuthStack-..."), so this matches on the stable prefix CloudFormation always
# keeps -- "<env>-*-app-*" for per-deployment app-stack roles, "<env>-env-*" for
# environment-stack roles -- rather than trying to name each stack.
#
# Usage: scripts/put-salt-secret-resource-policy.sh <env>
#
# Requires AWS credentials already assumed for the target account, plus
# SUBMIT_DEPLOY_ROLE_ARN and SUBMIT_ACTIONS_ROLE_ARN in the environment
# (deploy-environment.yml passes these from the repo's GitHub Actions variables).

set -euo pipefail

ENV_NAME="${1:?Usage: put-salt-secret-resource-policy.sh <env>}"
REGION="${AWS_REGION:-eu-west-2}"
SECRET_ID="${ENV_NAME}/submit/user-sub-hash-salt"

: "${SUBMIT_DEPLOY_ROLE_ARN:?SUBMIT_DEPLOY_ROLE_ARN must be set}"
: "${SUBMIT_ACTIONS_ROLE_ARN:?SUBMIT_ACTIONS_ROLE_ARN must be set}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"

POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAccountPrincipals",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::${ACCOUNT}:root" },
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "*"
    },
    {
      "Sid": "DenyUnexpectedPrincipals",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": [
            "arn:aws:iam::${ACCOUNT}:role/${ENV_NAME}-*-app-*",
            "arn:aws:iam::${ACCOUNT}:role/${ENV_NAME}-env-*",
            "${SUBMIT_DEPLOY_ROLE_ARN}",
            "${SUBMIT_ACTIONS_ROLE_ARN}",
            "arn:aws:iam::${ACCOUNT}:role/aws-reserved/sso.amazonaws.com/*/AWSReservedSSO_AdministratorAccess_*"
          ]
        }
      }
    }
  ]
}
JSON
)

echo "Applying resource policy to secret ${SECRET_ID} (account ${ACCOUNT}, region ${REGION})"
echo "${POLICY}"

aws secretsmanager put-resource-policy \
  --secret-id "${SECRET_ID}" \
  --resource-policy "${POLICY}" \
  --block-public-policy \
  --region "${REGION}"

echo "Resource policy applied. Re-reading it back:"
aws secretsmanager get-resource-policy \
  --secret-id "${SECRET_ID}" \
  --region "${REGION}"
