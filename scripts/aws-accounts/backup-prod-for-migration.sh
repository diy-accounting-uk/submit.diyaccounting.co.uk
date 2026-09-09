#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# scripts/aws-accounts/backup-prod-for-migration.sh
#
# Creates on-demand DynamoDB backups and exports salt metadata for account migration.
# Part of Phase 1.4 preparation (PLAN_ACCOUNT_SEPARATION.md step 1.4.1).
#
# Usage:
#   ./scripts/aws-accounts/backup-prod-for-migration.sh --profile <profile> [--env <environment>]
#
# Arguments:
#   --profile    - AWS CLI SSO profile for the source account (e.g., management)
#   --env        - Environment name (default: prod). Used to find tables like {env}-env-*
#
# Prerequisites:
#   - AWS CLI configured with SSO profiles (aws sso login --sso-session diyaccounting)
#   - jq installed

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Defaults ---
PROFILE=""
ENV="prod"

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --env)
      ENV="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 --profile <profile> [--env <environment>]"
      echo ""
      echo "Creates on-demand DynamoDB backups and exports salt metadata for account migration."
      echo ""
      echo "Required:"
      echo "  --profile <profile>  AWS CLI SSO profile for the source account (e.g., management)"
      echo ""
      echo "Options:"
      echo "  --env <name>  Environment name (default: prod)"
      echo ""
      echo "What it does:"
      echo "  1. Lists all DynamoDB tables matching {env}-env-* and {env}-submit-*"
      echo "  2. Creates on-demand backup of each with name pre-migration-{date}-{table}"
      echo "  3. Exports salt secret metadata from Secrets Manager (not the value)"
      echo "  4. Exports the system#config salt backup item from the bundles table"
      echo "  5. Verifies all backups show AVAILABLE status"
      echo ""
      echo "Prerequisites:"
      echo "  aws sso login --sso-session diyaccounting"
      echo ""
      echo "Example:"
      echo "  $0 --profile management --env prod"
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
if [[ -z "${PROFILE}" ]]; then
  echo -e "${RED}ERROR: --profile is required${NC}"
  echo "Run $0 --help for usage."
  exit 1
fi

# --- Configuration ---
REGION="${AWS_REGION:-eu-west-2}"
DATE=$(date +%Y%m%d)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PREFIX="pre-migration-${DATE}"

echo -e "${GREEN}=== DynamoDB Backup for Migration ===${NC}"
echo "  Environment: ${ENV}"
echo "  Region:      ${REGION}"
echo "  Date:        ${DATE}"
echo "  Backup prefix: ${BACKUP_PREFIX}"
echo ""

# --- Verify AWS credentials ---
echo "Verifying AWS credentials..."
CALLER_IDENTITY=$(aws sts get-caller-identity --profile "${PROFILE}" --output json 2>/dev/null) || {
  echo -e "${RED}ERROR: Cannot authenticate with profile '${PROFILE}'${NC}"
  echo "  Run: aws sso login --sso-session diyaccounting"
  exit 1
}
ACCOUNT_ID=$(echo "${CALLER_IDENTITY}" | jq -r '.Account')
echo -e "  Account: ${GREEN}${ACCOUNT_ID}${NC}"
echo ""

# --- Step 1: Find all matching DynamoDB tables ---
echo "Step 1: Finding DynamoDB tables matching ${ENV}-env-* and ${ENV}-submit-*..."

ALL_TABLES=$(aws dynamodb list-tables --profile "${PROFILE}" --region "${REGION}" --output json | jq -r '.TableNames[]')

MATCHING_TABLES=()
while IFS= read -r table; do
  if [[ "${table}" == "${ENV}-env-"* ]] || [[ "${table}" == "${ENV}-submit-"* ]]; then
    MATCHING_TABLES+=("${table}")
  fi
done <<< "${ALL_TABLES}"

if [[ ${#MATCHING_TABLES[@]} -eq 0 ]]; then
  echo -e "${YELLOW}WARNING: No tables found matching ${ENV}-env-* or ${ENV}-submit-*${NC}"
  echo "  Available tables:"
  echo "${ALL_TABLES}" | head -20
  exit 1
fi

echo -e "  Found ${GREEN}${#MATCHING_TABLES[@]}${NC} tables:"
for table in "${MATCHING_TABLES[@]}"; do
  echo "    - ${table}"
done
echo ""

# --- Step 2: Create on-demand backups ---
echo "Step 2: Creating on-demand backups..."

BACKUP_ARNS=()
FAILED_TABLES=()

for table in "${MATCHING_TABLES[@]}"; do
  BACKUP_NAME="${BACKUP_PREFIX}-${table}"
  echo -n "  Backing up ${table}..."

  BACKUP_ARN=$(aws dynamodb create-backup \
    --profile "${PROFILE}" \
    --table-name "${table}" \
    --backup-name "${BACKUP_NAME}" \
    --region "${REGION}" \
    --query 'BackupDetails.BackupArn' \
    --output text 2>/dev/null) || {
    echo -e " ${RED}FAILED${NC}"
    FAILED_TABLES+=("${table}")
    continue
  }

  BACKUP_ARNS+=("${BACKUP_ARN}")
  echo -e " ${GREEN}OK${NC} (${BACKUP_ARN})"
done
echo ""

if [[ ${#FAILED_TABLES[@]} -gt 0 ]]; then
  echo -e "${RED}WARNING: Failed to backup ${#FAILED_TABLES[@]} table(s):${NC}"
  for table in "${FAILED_TABLES[@]}"; do
    echo -e "  ${RED}- ${table}${NC}"
  done
  echo ""
fi

# --- Step 3: Export salt secret metadata ---
echo "Step 3: Exporting salt secret metadata..."

SALT_SECRET_NAME="${ENV}/submit/user-sub-hash-salt"
SALT_METADATA_FILE="salt-metadata-${TIMESTAMP}.json"

SALT_METADATA=$(aws secretsmanager describe-secret \
  --profile "${PROFILE}" \
  --secret-id "${SALT_SECRET_NAME}" \
  --region "${REGION}" \
  --output json 2>/dev/null) || {
  echo -e "${YELLOW}WARNING: Salt secret '${SALT_SECRET_NAME}' not found${NC}"
  SALT_METADATA=""
}

if [[ -n "${SALT_METADATA}" ]]; then
  echo "${SALT_METADATA}" | jq '{
    Name: .Name,
    ARN: .ARN,
    Description: .Description,
    KmsKeyId: .KmsKeyId,
    LastChangedDate: .LastChangedDate,
    LastAccessedDate: .LastAccessedDate,
    Tags: .Tags,
    VersionIdsToStages: .VersionIdsToStages
  }' > "${SALT_METADATA_FILE}"
  echo -e "  Metadata saved to: ${GREEN}${SALT_METADATA_FILE}${NC}"
  echo ""
  echo -e "  ${YELLOW}IMPORTANT: To export the actual salt VALUE, run manually:${NC}"
  echo "    aws secretsmanager get-secret-value \\"
  echo "      --profile '${PROFILE}' \\"
  echo "      --secret-id '${SALT_SECRET_NAME}' \\"
  echo "      --region '${REGION}' \\"
  echo "      --query SecretString --output text"
  echo ""
  echo -e "  ${YELLOW}Store the value securely (1Password, physical card). DO NOT commit to git.${NC}"
else
  echo "  Skipping salt metadata export."
fi
echo ""

# --- Step 4: Export system#config salt backup item from bundles table ---
echo "Step 4: Exporting system#config salt backup item from bundles table..."

BUNDLES_TABLE="${ENV}-env-bundles"
SALT_ITEM_FILE="salt-backup-item-${TIMESTAMP}.json"

SALT_ITEM=$(aws dynamodb get-item \
  --profile "${PROFILE}" \
  --table-name "${BUNDLES_TABLE}" \
  --key '{"hashedSub": {"S": "system#config"}, "bundleId": {"S": "salt-v2"}}' \
  --region "${REGION}" \
  --output json 2>/dev/null) || {
  echo -e "${YELLOW}WARNING: system#config/salt-v2 item not found in ${BUNDLES_TABLE}${NC}"
  SALT_ITEM=""
}

if [[ -n "${SALT_ITEM}" ]] && echo "${SALT_ITEM}" | jq -e '.Item' >/dev/null 2>&1; then
  echo "${SALT_ITEM}" > "${SALT_ITEM_FILE}"
  echo -e "  Salt backup item saved to: ${GREEN}${SALT_ITEM_FILE}${NC}"
  echo "  Item contains KMS-encrypted salt ciphertext and key ARN."
else
  echo -e "${YELLOW}  No system#config/salt-v2 item found (Path 3 backup may not be configured yet)${NC}"
fi

# Also export the canary item
CANARY_ITEM=$(aws dynamodb get-item \
  --profile "${PROFILE}" \
  --table-name "${BUNDLES_TABLE}" \
  --key '{"hashedSub": {"S": "system#canary"}, "bundleId": {"S": "salt-health-check"}}' \
  --region "${REGION}" \
  --output json 2>/dev/null) || true

if [[ -n "${CANARY_ITEM}" ]] && echo "${CANARY_ITEM}" | jq -e '.Item' >/dev/null 2>&1; then
  CANARY_FILE="salt-canary-item-${TIMESTAMP}.json"
  echo "${CANARY_ITEM}" > "${CANARY_FILE}"
  echo -e "  Salt canary item saved to: ${GREEN}${CANARY_FILE}${NC}"
fi
echo ""

# --- Step 5: Verify all backups ---
echo "Step 5: Verifying backup status..."

ALL_OK=true
for arn in "${BACKUP_ARNS[@]}"; do
  STATUS=$(aws dynamodb describe-backup \
    --profile "${PROFILE}" \
    --backup-arn "${arn}" \
    --region "${REGION}" \
    --query 'BackupDescription.BackupDetails.BackupStatus' \
    --output text 2>/dev/null) || STATUS="UNKNOWN"

  TABLE_NAME=$(echo "${arn}" | sed 's|.*/table/||' | sed 's|/backup/.*||')

  if [[ "${STATUS}" == "AVAILABLE" ]]; then
    echo -e "  ${GREEN}AVAILABLE${NC} - ${TABLE_NAME}"
  elif [[ "${STATUS}" == "CREATING" ]]; then
    echo -e "  ${YELLOW}CREATING${NC}  - ${TABLE_NAME} (will become AVAILABLE shortly)"
  else
    echo -e "  ${RED}${STATUS}${NC}     - ${TABLE_NAME}"
    ALL_OK=false
  fi
done
echo ""

# --- Summary ---
echo -e "${GREEN}=== Backup Summary ===${NC}"
echo "  Environment:     ${ENV}"
echo "  Account:         ${ACCOUNT_ID}"
echo "  Tables backed up: ${#BACKUP_ARNS[@]}/${#MATCHING_TABLES[@]}"
echo "  Backup prefix:   ${BACKUP_PREFIX}"
echo ""

if [[ ${#BACKUP_ARNS[@]} -gt 0 ]]; then
  echo "  Backup ARNs (save these for restore-tables-from-backup.sh):"
  for arn in "${BACKUP_ARNS[@]}"; do
    echo "    ${arn}"
  done
  echo ""
fi

if [[ -f "${SALT_METADATA_FILE}" ]]; then
  echo "  Salt metadata:  ${SALT_METADATA_FILE}"
fi
if [[ -f "${SALT_ITEM_FILE:-}" ]]; then
  echo "  Salt backup:    ${SALT_ITEM_FILE}"
fi

echo ""
if [[ "${ALL_OK}" == "true" && ${#FAILED_TABLES[@]} -eq 0 ]]; then
  echo -e "${GREEN}All backups created successfully.${NC}"
else
  echo -e "${YELLOW}Some issues detected. Review warnings above.${NC}"
fi

echo ""
echo "Next steps:"
echo "  1. Verify backups are AVAILABLE: aws dynamodb list-backups --profile ${PROFILE} --table-name ${ENV}-env-bundles --region ${REGION}"
echo "  2. Export the salt value securely (see Step 3 instructions above)"
echo "  3. Run ./scripts/aws-accounts/list-prod-secrets.sh to document all secrets"
echo "  4. Proceed with account creation (PLAN_ACCOUNT_SEPARATION.md Phase 1.4)"
