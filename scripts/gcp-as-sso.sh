#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/gcp-as-sso.sh
#
# Runs a command with Google Cloud credentials federated through the operator's AWS SSO role,
# so a read-only Google script (BigQuery, IAM, GA4) runs from a local session with no
# service-account key ever written to disk. infra/google/gcp/identity.toml's submit-prod
# provider accepts the assumed role AWSReservedSSO_AdministratorAccess alongside the analytics
# Lambdas' roles; google-auth-library's AwsClient reads AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
# AWS_SESSION_TOKEN and AWS_REGION from the environment before it falls back to the EC2 metadata
# service (node_modules/google-auth-library/build/src/auth/defaultawssecuritycredentialssupplier.js),
# so the same committed credential config in infra/google/gcp/credentials/ serves this session too.
#
# The AWS SSO session's credentials come from `aws configure export-credentials` and are exported
# only into the command's own process; nothing is written to a file and nothing is echoed.
#
# Usage: scripts/gcp-as-sso.sh [--profile <aws-profile>] <command> [args...]
#   scripts/gcp-as-sso.sh node scripts/some-read-only-bigquery-script.js
#   scripts/gcp-as-sso.sh --profile submit-ci node scripts/some-read-only-bigquery-script.js

set -euo pipefail

profile="submit-prod"

while [ $# -gt 0 ]; do
  case "$1" in
    --profile)
      if [ $# -lt 2 ]; then
        echo "gcp-as-sso.sh: --profile needs a value" >&2
        exit 1
      fi
      profile="$2"
      shift 2
      ;;
    --profile=*)
      profile="${1#--profile=}"
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [ $# -eq 0 ]; then
  echo "Usage: $0 [--profile <aws-profile>] <command> [args...]" >&2
  exit 1
fi

# The credential config is named after the workload identity provider, one per AWS account
# (infra/google/gcp/identity.toml: aws-prod for submit-prod, aws-ci for submit-ci).
providerId="${profile#submit-}"
repoRoot="$(cd "$(dirname "$0")/.." && pwd)"
credentialConfig="${repoRoot}/infra/google/gcp/credentials/aws-${providerId}.json"

if [ ! -f "$credentialConfig" ]; then
  echo "gcp-as-sso.sh: no credential config for profile ${profile} (expected ${credentialConfig})" >&2
  exit 1
fi

credentialsJson="$(aws configure export-credentials --profile "$profile" --format process)"
accessKeyId="$(printf '%s' "$credentialsJson" | jq -r '.AccessKeyId')"
secretAccessKey="$(printf '%s' "$credentialsJson" | jq -r '.SecretAccessKey')"
sessionToken="$(printf '%s' "$credentialsJson" | jq -r '.SessionToken')"

if [ -z "$accessKeyId" ] || [ -z "$secretAccessKey" ] || [ "$accessKeyId" = "null" ] || [ "$secretAccessKey" = "null" ]; then
  echo "gcp-as-sso.sh: aws configure export-credentials returned no credentials for profile ${profile}" >&2
  exit 1
fi

exec env \
  AWS_ACCESS_KEY_ID="$accessKeyId" \
  AWS_SECRET_ACCESS_KEY="$secretAccessKey" \
  AWS_SESSION_TOKEN="$sessionToken" \
  AWS_REGION="eu-west-2" \
  GOOGLE_APPLICATION_CREDENTIALS="$credentialConfig" \
  "$@"
