#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/aws-use-submit-profile.sh
# Usage: . ./scripts/aws-use-submit-profile.sh
# Points the current shell at the diya-management SSO profile (account 887764105431).
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN
export AWS_PROFILE="diya-management"
export AWS_REGION="eu-west-2"
export AWS_DEFAULT_REGION="eu-west-2"
if ! identity=$(aws sts get-caller-identity --output json 2>&1); then
  echo "Error: profile ${AWS_PROFILE} has no valid session. Run: aws sso login --sso-session diyaccounting"
  # shellcheck disable=SC2317
  return 1 2>/dev/null || exit 1
fi
echo "Using profile ${AWS_PROFILE}. Identity is now:"
echo "${identity}"
