#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# scripts/aws-accounts/copy-secrets-to-account.sh
#
# Copies Secrets Manager secrets from one AWS account to another.
# Dry-run by default. Requires --execute to actually copy.
# Part of Phase 1.4 (PLAN_ACCOUNT_SEPARATION.md step 1.4.10).
#
# Usage:
#   ./scripts/aws-accounts/copy-secrets-to-account.sh --source-profile <profile> --target-profile <profile> [--env <env>] [--execute]
#
# Prerequisites:
#   - AWS CLI configured with named profiles for both accounts
#   - Both profiles must have secretsmanager:GetSecretValue (source) and
#     secretsmanager:CreateSecret (target) permissions
#   - jq installed

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Defaults ---
SOURCE_PROFILE=""
TARGET_PROFILE=""
ENV="prod"
EXECUTE=false
REGION="${AWS_REGION:-eu-west-2}"

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-profile)
      SOURCE_PROFILE="$2"
      shift 2
      ;;
    --target-profile)
      TARGET_PROFILE="$2"
      shift 2
      ;;
    --env)
      ENV="$2"
      shift 2
      ;;
    --execute)
      EXECUTE=true
      shift
      ;;
    --dry-run)
      EXECUTE=false
      shift
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 --source-profile <profile> --target-profile <profile> [options]"
      echo ""
      echo "Copies Secrets Manager secrets from source account to target account."
      echo "DRY-RUN by default. Use --execute to actually copy."
      echo ""
      echo "Required:"
      echo "  --source-profile <profile>  AWS CLI profile for source account"
      echo "  --target-profile <profile>  AWS CLI profile for target account"
      echo ""
      echo "Options:"
      echo "  --env <name>       Environment name filter (default: prod)"
      echo "  --region <region>  AWS region (default: eu-west-2)"
      echo "  --execute          Actually copy secrets (default: dry-run)"
      echo "  --dry-run          Show what would be copied without doing it (default)"
      echo ""
      echo "Expected secrets for submit (from .env files):"
      echo "  {env}/submit/google/client_secret"
      echo "  {env}/submit/hmrc/client_secret"
      echo "  {env}/submit/hmrc/sandbox_client_secret"
      echo "  {env}/submit/stripe/secret_key"
      echo "  {env}/submit/stripe/test_secret_key"
      echo "  {env}/submit/stripe/webhook_secret"
      echo "  {env}/submit/stripe/test_webhook_secret"
      echo "  {env}/submit/telegram/bot_token"
      echo "  {env}/submit/user-sub-hash-salt"
      echo ""
      echo "Example:"
      echo "  $0 --source-profile management --target-profile submit-prod --env prod --dry-run"
      echo "  $0 --source-profile management --target-profile submit-prod --env prod --execute"
      exit 0
      ;;
    *)
      echo -e "${RED}ERROR: Unknown argument: $1${NC}"
      echo "Run $0 --help for usage."
      exit 1
      ;;
  esac
done

# --- Validate required arguments ---
if [[ -z "${SOURCE_PROFILE}" ]]; then
  echo -e "${RED}ERROR: --source-profile is required${NC}"
  echo "Run $0 --help for usage."
  exit 1
fi

if [[ -z "${TARGET_PROFILE}" ]]; then
  echo -e "${RED}ERROR: --target-profile is required${NC}"
  echo "Run $0 --help for usage."
  exit 1
fi

# --- Header ---
if [[ "${EXECUTE}" == "true" ]]; then
  echo -e "${RED}=== Copy Secrets (EXECUTE MODE) ===${NC}"
else
  echo -e "${YELLOW}=== Copy Secrets (DRY-RUN MODE) ===${NC}"
fi
echo "  Source profile:  ${SOURCE_PROFILE}"
echo "  Target profile:  ${TARGET_PROFILE}"
echo "  Environment:     ${ENV}"
echo "  Region:          ${REGION}"
echo ""

# --- Verify both profiles ---
echo "Verifying source credentials..."
SOURCE_ACCOUNT=$(aws sts get-caller-identity --profile "${SOURCE_PROFILE}" --region "${REGION}" --query 'Account' --output text 2>/dev/null) || {
  echo -e "${RED}ERROR: Cannot authenticate with source profile '${SOURCE_PROFILE}'${NC}"
  echo "  Run: aws sso login --sso-session diyaccounting"
  exit 1
}
echo -e "  Source account: ${GREEN}${SOURCE_ACCOUNT}${NC}"

echo "Verifying target credentials..."
TARGET_ACCOUNT=$(aws sts get-caller-identity --profile "${TARGET_PROFILE}" --region "${REGION}" --query 'Account' --output text 2>/dev/null) || {
  echo -e "${RED}ERROR: Cannot authenticate with target profile '${TARGET_PROFILE}'${NC}"
  echo "  Run: aws sso login --sso-session diyaccounting"
  exit 1
}
echo -e "  Target account: ${GREEN}${TARGET_ACCOUNT}${NC}"

if [[ "${SOURCE_ACCOUNT}" == "${TARGET_ACCOUNT}" ]]; then
  echo -e "${RED}ERROR: Source and target are the same account (${SOURCE_ACCOUNT})${NC}"
  exit 1
fi
echo ""

# --- List secrets in source account ---
echo "Listing secrets in source account matching '${ENV}/'..."

SOURCE_SECRETS=$(aws secretsmanager list-secrets \
  --profile "${SOURCE_PROFILE}" \
  --region "${REGION}" \
  --output json \
  --query 'SecretList[*].{Name:Name,Description:Description}')

FILTERED_SECRETS=$(echo "${SOURCE_SECRETS}" | jq --arg env "${ENV}" '[.[] | select(.Name | startswith($env + "/"))]')
SECRET_COUNT=$(echo "${FILTERED_SECRETS}" | jq 'length')

if [[ "${SECRET_COUNT}" -eq 0 ]]; then
  echo -e "${YELLOW}No secrets found matching '${ENV}/' in source account${NC}"
  echo "  All secrets:"
  echo "${SOURCE_SECRETS}" | jq -r '.[].Name' | sort
  exit 0
fi

echo -e "  Found ${GREEN}${SECRET_COUNT}${NC} secret(s) to copy:"
echo "${FILTERED_SECRETS}" | jq -r '.[].Name' | sort | while IFS= read -r name; do
  echo "    - ${name}"
done
echo ""

# --- Check target for existing secrets ---
echo "Checking target account for existing secrets..."

TARGET_SECRETS=$(aws secretsmanager list-secrets \
  --profile "${TARGET_PROFILE}" \
  --region "${REGION}" \
  --output json \
  --query 'SecretList[*].Name')

# --- Copy each secret ---
COPIED=0
SKIPPED=0
FAILED=0

echo ""
echo "${FILTERED_SECRETS}" | jq -r '.[].Name' | sort | while IFS= read -r SECRET_NAME; do
  [[ -z "${SECRET_NAME}" ]] && continue

  # Check if secret already exists in target
  TARGET_EXISTS=$(echo "${TARGET_SECRETS}" | jq -r --arg name "${SECRET_NAME}" 'if . | index($name) then "yes" else "no" end')

  if [[ "${TARGET_EXISTS}" == "yes" ]]; then
    echo -e "  ${YELLOW}SKIP${NC} ${SECRET_NAME} (already exists in target)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [[ "${EXECUTE}" == "true" ]]; then
    # Get secret value from source
    echo -n "  Copying ${SECRET_NAME}..."
    SECRET_VALUE=$(aws secretsmanager get-secret-value \
      --profile "${SOURCE_PROFILE}" \
      --region "${REGION}" \
      --secret-id "${SECRET_NAME}" \
      --query 'SecretString' \
      --output text 2>/dev/null) || {
      echo -e " ${RED}FAILED (could not read from source)${NC}"
      FAILED=$((FAILED + 1))
      continue
    }

    # Get description from source
    SECRET_DESC=$(echo "${FILTERED_SECRETS}" | jq -r --arg name "${SECRET_NAME}" '.[] | select(.Name == $name) | .Description // empty')

    # Create in target
    CREATE_ARGS=(
      --profile "${TARGET_PROFILE}"
      --region "${REGION}"
      --name "${SECRET_NAME}"
      --secret-string "${SECRET_VALUE}"
    )
    if [[ -n "${SECRET_DESC}" ]]; then
      CREATE_ARGS+=(--description "${SECRET_DESC}")
    fi

    aws secretsmanager create-secret "${CREATE_ARGS[@]}" >/dev/null 2>&1 && {
      echo -e " ${GREEN}OK${NC}"
      COPIED=$((COPIED + 1))
    } || {
      echo -e " ${RED}FAILED (could not create in target)${NC}"
      FAILED=$((FAILED + 1))
    }
  else
    echo -e "  ${CYAN}WOULD COPY${NC} ${SECRET_NAME}"
    COPIED=$((COPIED + 1))
  fi
done

echo ""

# --- Summary ---
if [[ "${EXECUTE}" == "true" ]]; then
  echo -e "${GREEN}=== Copy Complete ===${NC}"
else
  echo -e "${YELLOW}=== Dry-Run Complete ===${NC}"
fi
echo "  Source: ${SOURCE_ACCOUNT} (${SOURCE_PROFILE})"
echo "  Target: ${TARGET_ACCOUNT} (${TARGET_PROFILE})"
echo "  Secrets found:   ${SECRET_COUNT}"
echo ""

if [[ "${EXECUTE}" != "true" ]]; then
  echo -e "${YELLOW}This was a dry run. To actually copy secrets, add --execute:${NC}"
  echo ""
  echo "  $0 --source-profile ${SOURCE_PROFILE} --target-profile ${TARGET_PROFILE} --env ${ENV} --execute"
  echo ""
  echo -e "${YELLOW}IMPORTANT: Some secrets may need updating after copy:${NC}"
  echo "  - Stripe webhook secrets: Will need new webhook endpoints for new URLs"
  echo "  - Google client secret: May need new OAuth redirect URIs in Google Console"
  echo "  - HMRC client secret: May need new redirect URIs in HMRC Developer Hub"
fi
