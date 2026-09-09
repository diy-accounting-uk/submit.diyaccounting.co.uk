#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# scripts/aws-accounts/restore-salt.sh
#
# Restores the user sub hash salt to a new account from a source account.
# Copies both the Secrets Manager secret and the system#config DynamoDB item.
# Part of Phase 1.4 (PLAN_ACCOUNT_SEPARATION.md step 1.4.18).
#
# The salt is the MOST CRITICAL piece of data in the system. Without it, all
# user data (hashed by sub) becomes inaccessible. Three recovery paths exist:
#   Path 1: Secrets Manager (this script copies it)
#   Path 2: Physical card with 8-word passphrase (operator types it)
#   Path 3: KMS-encrypted item in DynamoDB bundles table (this script copies it)
#
# Usage:
#   ./scripts/aws-accounts/restore-salt.sh --source-profile <profile> --target-profile <profile> [--env <env>]
#
# Prerequisites:
#   - AWS CLI configured with named profiles for both accounts
#   - Source account must have the salt in Secrets Manager and/or DynamoDB
#   - Target account must have the bundles table (deployed by DataStack)
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
    --region)
      REGION="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 --source-profile <profile> --target-profile <profile> [--env <env>]"
      echo ""
      echo "Restores the user sub hash salt to a new account."
      echo ""
      echo "Copies:"
      echo "  1. Secrets Manager: {env}/submit/user-sub-hash-salt (JSON registry with v1/v2 versions)"
      echo "  2. DynamoDB: system#config/salt-v2 item from bundles table (KMS-encrypted backup)"
      echo "  3. DynamoDB: system#canary/salt-health-check item (verification canary)"
      echo ""
      echo "Required:"
      echo "  --source-profile <profile>  AWS CLI profile for source account (887764105431)"
      echo "  --target-profile <profile>  AWS CLI profile for target account (new submit-prod)"
      echo ""
      echo "Options:"
      echo "  --env <name>       Environment name (default: prod)"
      echo "  --region <region>  AWS region (default: eu-west-2)"
      echo ""
      echo "IMPORTANT: The KMS-encrypted DynamoDB item (Path 3) will need re-encryption"
      echo "with the target account's KMS key. This script handles that case and prints"
      echo "instructions if cross-account KMS access is needed."
      echo ""
      echo "Example:"
      echo "  $0 --source-profile management --target-profile submit-prod --env prod"
      exit 0
      ;;
    *)
      echo -e "${RED}ERROR: Unknown argument: $1${NC}"
      echo "Run $0 --help for usage."
      exit 1
      ;;
  esac
done

# --- Validate ---
if [[ -z "${SOURCE_PROFILE}" || -z "${TARGET_PROFILE}" ]]; then
  echo -e "${RED}ERROR: Both --source-profile and --target-profile are required${NC}"
  echo "Run $0 --help for usage."
  exit 1
fi

# --- Header ---
echo -e "${GREEN}=== Salt Restoration ===${NC}"
echo "  Source profile: ${SOURCE_PROFILE}"
echo "  Target profile: ${TARGET_PROFILE}"
echo "  Environment:    ${ENV}"
echo "  Region:         ${REGION}"
echo ""

# --- Verify credentials ---
echo "Verifying credentials..."

SOURCE_ACCOUNT=$(aws sts get-caller-identity --profile "${SOURCE_PROFILE}" --region "${REGION}" --query 'Account' --output text 2>/dev/null) || {
  echo -e "${RED}ERROR: Cannot authenticate with source profile '${SOURCE_PROFILE}'${NC}"
  exit 1
}
echo -e "  Source: ${GREEN}${SOURCE_ACCOUNT}${NC}"

TARGET_ACCOUNT=$(aws sts get-caller-identity --profile "${TARGET_PROFILE}" --region "${REGION}" --query 'Account' --output text 2>/dev/null) || {
  echo -e "${RED}ERROR: Cannot authenticate with target profile '${TARGET_PROFILE}'${NC}"
  exit 1
}
echo -e "  Target: ${GREEN}${TARGET_ACCOUNT}${NC}"
echo ""

SALT_SECRET_NAME="${ENV}/submit/user-sub-hash-salt"
BUNDLES_TABLE="${ENV}-env-bundles"

# ============================================================================
# Step 1: Copy salt from Secrets Manager (Path 1)
# ============================================================================
echo -e "${CYAN}Step 1: Copying salt secret from Secrets Manager...${NC}"

# Read from source
SALT_VALUE=$(aws secretsmanager get-secret-value \
  --profile "${SOURCE_PROFILE}" \
  --region "${REGION}" \
  --secret-id "${SALT_SECRET_NAME}" \
  --query 'SecretString' \
  --output text 2>/dev/null) || {
  echo -e "${RED}ERROR: Could not read salt secret '${SALT_SECRET_NAME}' from source${NC}"
  echo ""
  echo "Alternative: If you have the 8-word passphrase (Path 2), you can manually create the secret:"
  echo "  aws secretsmanager create-secret \\"
  echo "    --profile ${TARGET_PROFILE} \\"
  echo "    --region ${REGION} \\"
  echo "    --name '${SALT_SECRET_NAME}' \\"
  echo "    --secret-string '<JSON registry value>'"
  exit 1
}

# Validate it looks like a salt registry
if echo "${SALT_VALUE}" | jq -e '.versions' >/dev/null 2>&1; then
  CURRENT_VERSION=$(echo "${SALT_VALUE}" | jq -r '.current // "unknown"')
  VERSION_COUNT=$(echo "${SALT_VALUE}" | jq '.versions | keys | length')
  echo -e "  Source salt: ${GREEN}valid registry${NC} (current: ${CURRENT_VERSION}, ${VERSION_COUNT} version(s))"
else
  echo -e "  ${YELLOW}WARNING: Salt value does not look like a versioned registry${NC}"
  echo "  Proceeding anyway (it may be a legacy single-value format)."
fi

# Check if already exists in target
TARGET_EXISTS=$(aws secretsmanager describe-secret \
  --profile "${TARGET_PROFILE}" \
  --region "${REGION}" \
  --secret-id "${SALT_SECRET_NAME}" \
  --query 'Name' \
  --output text 2>/dev/null) || TARGET_EXISTS=""

if [[ -n "${TARGET_EXISTS}" ]]; then
  echo -e "  ${YELLOW}Salt secret already exists in target. Updating...${NC}"
  aws secretsmanager put-secret-value \
    --profile "${TARGET_PROFILE}" \
    --region "${REGION}" \
    --secret-id "${SALT_SECRET_NAME}" \
    --secret-string "${SALT_VALUE}" >/dev/null
  echo -e "  ${GREEN}Updated${NC} ${SALT_SECRET_NAME} in target"
else
  aws secretsmanager create-secret \
    --profile "${TARGET_PROFILE}" \
    --region "${REGION}" \
    --name "${SALT_SECRET_NAME}" \
    --secret-string "${SALT_VALUE}" \
    --description "User sub hash salt registry - multi-version JSON (migrated from ${SOURCE_ACCOUNT})" >/dev/null
  echo -e "  ${GREEN}Created${NC} ${SALT_SECRET_NAME} in target"
fi
echo ""

# ============================================================================
# Step 2: Copy system#config/salt-v2 item from DynamoDB (Path 3)
# ============================================================================
echo -e "${CYAN}Step 2: Copying system#config/salt-v2 DynamoDB item...${NC}"

SALT_ITEM=$(aws dynamodb get-item \
  --profile "${SOURCE_PROFILE}" \
  --region "${REGION}" \
  --table-name "${BUNDLES_TABLE}" \
  --key '{"hashedSub": {"S": "system#config"}, "bundleId": {"S": "salt-v2"}}' \
  --output json 2>/dev/null) || SALT_ITEM=""

if [[ -z "${SALT_ITEM}" ]] || ! echo "${SALT_ITEM}" | jq -e '.Item' >/dev/null 2>&1; then
  echo -e "  ${YELLOW}No system#config/salt-v2 item found in source (Path 3 may not be configured yet)${NC}"
  echo "  Skipping DynamoDB salt backup item."
  echo ""
else
  # Extract the item
  ITEM_JSON=$(echo "${SALT_ITEM}" | jq '.Item')

  # Check if the item has a KMS key ARN (indicating cross-account KMS issue)
  KMS_KEY_ARN=$(echo "${ITEM_JSON}" | jq -r '.kmsKeyArn.S // empty')

  if [[ -n "${KMS_KEY_ARN}" ]]; then
    echo -e "  Source item uses KMS key: ${KMS_KEY_ARN}"
    echo ""

    # Check if the KMS key is from the source account
    KMS_ACCOUNT=$(echo "${KMS_KEY_ARN}" | cut -d: -f5)
    if [[ "${KMS_ACCOUNT}" == "${SOURCE_ACCOUNT}" ]]; then
      echo -e "  ${YELLOW}NOTE: The encrypted salt uses a KMS key from the source account.${NC}"
      echo -e "  ${YELLOW}The target account's DataStack will create its own KMS key.${NC}"
      echo ""
      echo "  Options for Path 3 re-encryption:"
      echo "    a) Grant the target account kms:Decrypt on the source key:"
      echo "       aws kms create-grant \\"
      echo "         --profile ${SOURCE_PROFILE} \\"
      echo "         --key-id ${KMS_KEY_ARN} \\"
      echo "         --grantee-principal arn:aws:iam::${TARGET_ACCOUNT}:root \\"
      echo "         --operations Decrypt"
      echo ""
      echo "    b) Decrypt in source, re-encrypt with target key:"
      echo "       1. Decrypt: aws kms decrypt --profile ${SOURCE_PROFILE} --ciphertext-blob <blob> --key-id ${KMS_KEY_ARN}"
      echo "       2. Re-encrypt: aws kms encrypt --profile ${TARGET_PROFILE} --plaintext <plaintext> --key-id <target-key>"
      echo "       3. Update the item with new ciphertext and new kmsKeyArn"
      echo ""
      echo "    c) Regenerate Path 3 backup after deployment:"
      echo "       Run migration 003 in the new account to re-create the encrypted backup"
      echo "       using the new account's KMS key."
      echo ""
    fi
  fi

  # Write the item to target (even if KMS key won't work cross-account,
  # the structure is preserved for future re-encryption)
  echo -n "  Writing system#config/salt-v2 to target bundles table..."

  # Check if target table exists
  TARGET_TABLE_STATUS=$(aws dynamodb describe-table \
    --profile "${TARGET_PROFILE}" \
    --region "${REGION}" \
    --table-name "${BUNDLES_TABLE}" \
    --query 'Table.TableStatus' \
    --output text 2>/dev/null) || TARGET_TABLE_STATUS=""

  if [[ -z "${TARGET_TABLE_STATUS}" ]]; then
    echo -e " ${RED}FAILED (table ${BUNDLES_TABLE} does not exist in target)${NC}"
    echo "  Deploy DataStack to target first, then re-run this script."
  elif [[ "${TARGET_TABLE_STATUS}" != "ACTIVE" ]]; then
    echo -e " ${RED}FAILED (table status: ${TARGET_TABLE_STATUS})${NC}"
  else
    aws dynamodb put-item \
      --profile "${TARGET_PROFILE}" \
      --region "${REGION}" \
      --table-name "${BUNDLES_TABLE}" \
      --item "${ITEM_JSON}" >/dev/null 2>&1 && {
      echo -e " ${GREEN}OK${NC}"
    } || {
      echo -e " ${RED}FAILED${NC}"
    }
  fi
fi
echo ""

# ============================================================================
# Step 3: Copy salt health canary item
# ============================================================================
echo -e "${CYAN}Step 3: Copying salt health canary item...${NC}"

CANARY_ITEM=$(aws dynamodb get-item \
  --profile "${SOURCE_PROFILE}" \
  --region "${REGION}" \
  --table-name "${BUNDLES_TABLE}" \
  --key '{"hashedSub": {"S": "system#canary"}, "bundleId": {"S": "salt-health-check"}}' \
  --output json 2>/dev/null) || CANARY_ITEM=""

if [[ -z "${CANARY_ITEM}" ]] || ! echo "${CANARY_ITEM}" | jq -e '.Item' >/dev/null 2>&1; then
  echo -e "  ${YELLOW}No salt health canary item found in source${NC}"
else
  CANARY_JSON=$(echo "${CANARY_ITEM}" | jq '.Item')

  if [[ -n "${TARGET_TABLE_STATUS:-}" && "${TARGET_TABLE_STATUS:-}" == "ACTIVE" ]]; then
    echo -n "  Writing system#canary/salt-health-check to target..."
    aws dynamodb put-item \
      --profile "${TARGET_PROFILE}" \
      --region "${REGION}" \
      --table-name "${BUNDLES_TABLE}" \
      --item "${CANARY_JSON}" >/dev/null 2>&1 && {
      echo -e " ${GREEN}OK${NC}"
    } || {
      echo -e " ${RED}FAILED${NC}"
    }
  else
    echo -e "  ${YELLOW}Skipping (target table not available)${NC}"
  fi
fi
echo ""

# ============================================================================
# Step 4: Verify
# ============================================================================
echo -e "${CYAN}Step 4: Verification...${NC}"

# Verify Secrets Manager
echo -n "  Secrets Manager (${SALT_SECRET_NAME})... "
TARGET_SALT=$(aws secretsmanager get-secret-value \
  --profile "${TARGET_PROFILE}" \
  --region "${REGION}" \
  --secret-id "${SALT_SECRET_NAME}" \
  --query 'SecretString' \
  --output text 2>/dev/null) || TARGET_SALT=""

if [[ -n "${TARGET_SALT}" ]]; then
  if [[ "${TARGET_SALT}" == "${SALT_VALUE}" ]]; then
    echo -e "${GREEN}MATCH${NC}"
  else
    echo -e "${RED}MISMATCH (values differ!)${NC}"
  fi
else
  echo -e "${RED}NOT FOUND${NC}"
fi

# Verify DynamoDB item
echo -n "  DynamoDB (system#config/salt-v2)... "
TARGET_DDB_ITEM=$(aws dynamodb get-item \
  --profile "${TARGET_PROFILE}" \
  --region "${REGION}" \
  --table-name "${BUNDLES_TABLE}" \
  --key '{"hashedSub": {"S": "system#config"}, "bundleId": {"S": "salt-v2"}}' \
  --query 'Item' \
  --output json 2>/dev/null) || TARGET_DDB_ITEM=""

if [[ -n "${TARGET_DDB_ITEM}" ]] && echo "${TARGET_DDB_ITEM}" | jq -e '.' >/dev/null 2>&1; then
  echo -e "${GREEN}PRESENT${NC}"
else
  echo -e "${YELLOW}NOT PRESENT (Path 3 backup not available)${NC}"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
echo -e "${GREEN}=== Salt Restoration Summary ===${NC}"
echo "  Source: ${SOURCE_ACCOUNT} (${SOURCE_PROFILE})"
echo "  Target: ${TARGET_ACCOUNT} (${TARGET_PROFILE})"
echo "  Environment: ${ENV}"
echo ""
echo "  Path 1 (Secrets Manager):  Copied"
echo "  Path 2 (Physical card):    Operator responsibility (not automated)"
echo "  Path 3 (DynamoDB + KMS):   See notes above"
echo ""
echo "Next steps:"
echo "  1. Deploy application stacks to target account"
echo "  2. Verify salt works: check Lambda cold start for salt loading errors"
echo "  3. If Path 3 KMS re-encryption needed, use the instructions above"
echo "  4. Run behaviour tests: npm run test:submitVatBehaviour-prod"
