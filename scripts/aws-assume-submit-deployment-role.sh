#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/aws-assume-submit-deployment-role.sh
# Usage: . ./scripts/aws-assume-submit-deployment-role.sh
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN
unset AWS_REGION
roleArn="arn:aws:iam::887764105431:role/submit-deployment-role"
sessionName="submit-deployment-session-local"
assumeRoleOutput=$(aws sts assume-role --role-arn "${roleArn?}" --role-session-name "${sessionName?}" --output json)
if [ $? -ne 0 ]; then
  echo "Error: Failed to assume role."
  exit 1
fi
export AWS_ACCESS_KEY_ID=$(echo "${assumeRoleOutput?}" | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo "${assumeRoleOutput?}" | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo "${assumeRoleOutput?}" | jq -r '.Credentials.SessionToken')
export AWS_REGION="eu-west-2"
expirationTimestamp=$(echo "${assumeRoleOutput?}" | jq -r '.Credentials.Expiration')
echo "Assumed ${roleArn?} successfully, expires: ${expirationTimestamp?}. Identity is now:"
aws sts get-caller-identity
