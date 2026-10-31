#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# @capability OPS-69 Assume and clear local AWS deployment credentials
# - **Use when:** a local deploy or debug session needs the diya-management SSO profile in the shell.
# - **Does:** aws-use-submit-profile.sh points the current shell at the diya-management SSO profile (checking the session and printing the identity), for local deploy or debug work. aws-unset-iam-session.sh clears any exported AWS_* credentials afterwards.
# - **Run:** `. ./scripts/aws-use-submit-profile.sh`; `./scripts/aws-unset-iam-session.sh`
# - **Entry:** `scripts/aws-use-submit-profile.sh`
# - **Files:** scripts/aws-use-submit-profile.sh, scripts/aws-unset-iam-session.sh
# - **Keywords:** sso profile, diya-management, local aws credentials, unset iam session, aws sso login
# - **Related:** OPS-07
# @end-capability

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
