#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Setup Cross-Account Backup Roles
#
# Creates backup vault in backup account and configures cross-account
# backup permissions in source accounts.
#
# Usage: ./setup-backup-roles.sh <backup-account-id> <source-account-ids...>
#
# Example:
#   ./setup-backup-roles.sh 111111111111 887764105431 222222222222

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

BACKUP_ACCOUNT_ID="${1:-}"
shift || true
SOURCE_ACCOUNT_IDS=("$@")

REGION="${AWS_REGION:-eu-west-2}"
VAULT_NAME="submit-cross-account-vault"

if [ -z "$BACKUP_ACCOUNT_ID" ] || [ ${#SOURCE_ACCOUNT_IDS[@]} -eq 0 ]; then
    log_error "Usage: $0 <backup-account-id> <source-account-id1> [source-account-id2...]"
    log_error "Example: $0 111111111111 887764105431 222222222222"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

log_info "Setting up cross-account backup"
log_info "Backup account: $BACKUP_ACCOUNT_ID"
log_info "Source accounts: ${SOURCE_ACCOUNT_IDS[*]}"

# ============================================
# Step 1: Create Backup Vault in Backup Account
# ============================================

log_info "Step 1: Creating backup vault in backup account..."

# We need to assume a role in the backup account or use SSO profile
BACKUP_PROFILE="${BACKUP_PROFILE:-submit-backup-admin}"

# Check if vault exists
if aws backup describe-backup-vault \
    --backup-vault-name "$VAULT_NAME" \
    --profile "$BACKUP_PROFILE" \
    --region "$REGION" 2>/dev/null; then
    log_info "Backup vault already exists"
else
    log_info "Creating backup vault: $VAULT_NAME"
    aws backup create-backup-vault \
        --backup-vault-name "$VAULT_NAME" \
        --profile "$BACKUP_PROFILE" \
        --region "$REGION"
    log_info "Vault created"
fi

# Build principal ARNs for vault policy
PRINCIPAL_ARNS=""
for account_id in "${SOURCE_ACCOUNT_IDS[@]}"; do
    if [ -n "$PRINCIPAL_ARNS" ]; then
        PRINCIPAL_ARNS="$PRINCIPAL_ARNS,"
    fi
    PRINCIPAL_ARNS="$PRINCIPAL_ARNS\"arn:aws:iam::${account_id}:root\""
done

# Create vault access policy
VAULT_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCrossAccountCopy",
      "Effect": "Allow",
      "Principal": {
        "AWS": [$PRINCIPAL_ARNS]
      },
      "Action": [
        "backup:CopyIntoBackupVault"
      ],
      "Resource": "*"
    }
  ]
}
EOF
)

log_info "Setting backup vault access policy..."
aws backup put-backup-vault-access-policy \
    --backup-vault-name "$VAULT_NAME" \
    --policy "$VAULT_POLICY" \
    --profile "$BACKUP_PROFILE" \
    --region "$REGION"

log_info "Vault policy configured"

# Get vault ARN
VAULT_ARN=$(aws backup describe-backup-vault \
    --backup-vault-name "$VAULT_NAME" \
    --profile "$BACKUP_PROFILE" \
    --region "$REGION" \
    --query 'BackupVaultArn' \
    --output text)

log_info "Vault ARN: $VAULT_ARN"

# ============================================
# Step 2: Configure Source Accounts
# ============================================

for SOURCE_ACCOUNT_ID in "${SOURCE_ACCOUNT_IDS[@]}"; do
    log_info "Step 2: Configuring source account: $SOURCE_ACCOUNT_ID"

    # Determine profile for this account
    if [ "$SOURCE_ACCOUNT_ID" = "887764105431" ]; then
        SOURCE_PROFILE="${SOURCE_PROFILE:-submit-prod-admin}"
    else
        SOURCE_PROFILE="submit-ci-admin"
    fi

    # Create backup service role if it doesn't exist
    BACKUP_ROLE_NAME="AWSBackupDefaultServiceRole"

    if aws iam get-role --role-name "$BACKUP_ROLE_NAME" --profile "$SOURCE_PROFILE" 2>/dev/null; then
        log_info "Backup service role exists in $SOURCE_ACCOUNT_ID"
    else
        log_info "Creating backup service role in $SOURCE_ACCOUNT_ID..."

        BACKUP_TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "backup.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
)

        aws iam create-role \
            --role-name "$BACKUP_ROLE_NAME" \
            --assume-role-policy-document "$BACKUP_TRUST_POLICY" \
            --description "Default role for AWS Backup service" \
            --profile "$SOURCE_PROFILE"

        # Attach required policies
        aws iam attach-role-policy \
            --role-name "$BACKUP_ROLE_NAME" \
            --policy-arn "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup" \
            --profile "$SOURCE_PROFILE"

        aws iam attach-role-policy \
            --role-name "$BACKUP_ROLE_NAME" \
            --policy-arn "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores" \
            --profile "$SOURCE_PROFILE"

        log_info "Backup service role created"
    fi

    # Add cross-account copy permissions to the role
    log_info "Adding cross-account copy permissions..."

    CROSS_ACCOUNT_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "backup:CopyIntoBackupVault",
        "backup:StartCopyJob"
      ],
      "Resource": "$VAULT_ARN"
    }
  ]
}
EOF
)

    aws iam put-role-policy \
        --role-name "$BACKUP_ROLE_NAME" \
        --policy-name "CrossAccountBackupCopy" \
        --policy-document "$CROSS_ACCOUNT_POLICY" \
        --profile "$SOURCE_PROFILE"

    log_info "Source account $SOURCE_ACCOUNT_ID configured"
done

# ============================================
# Step 3: Create Sample Backup Plan with Cross-Account Copy
# ============================================

log_info "Step 3: Creating backup plan template..."

# Create backup plan JSON
BACKUP_PLAN_FILE="$SCRIPT_DIR/backup-plan-cross-account.json"
cat > "$BACKUP_PLAN_FILE" << EOF
{
  "BackupPlanName": "submit-cross-account-backup",
  "Rules": [
    {
      "RuleName": "DailyBackupWithCrossAccountCopy",
      "TargetBackupVaultName": "Default",
      "ScheduleExpression": "cron(0 5 ? * * *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 180,
      "Lifecycle": {
        "DeleteAfterDays": 35
      },
      "CopyActions": [
        {
          "DestinationBackupVaultArn": "$VAULT_ARN",
          "Lifecycle": {
            "DeleteAfterDays": 90
          }
        }
      ]
    }
  ]
}
EOF

log_info "Backup plan template saved to: $BACKUP_PLAN_FILE"

# Save configuration
OUTPUT_FILE="$SCRIPT_DIR/../../target/migration/backup-config.json"
mkdir -p "$(dirname "$OUTPUT_FILE")"
cat > "$OUTPUT_FILE" << EOF
{
  "backupAccountId": "$BACKUP_ACCOUNT_ID",
  "vaultName": "$VAULT_NAME",
  "vaultArn": "$VAULT_ARN",
  "sourceAccounts": [$(printf '"%s",' "${SOURCE_ACCOUNT_IDS[@]}" | sed 's/,$//')],
  "region": "$REGION",
  "createdAt": "$(date -Iseconds)"
}
EOF

log_info "Configuration saved to: $OUTPUT_FILE"

echo ""
echo "=============================================="
echo "Cross-Account Backup Setup Complete!"
echo "=============================================="
echo ""
echo "Backup Vault:"
echo "  Account: $BACKUP_ACCOUNT_ID"
echo "  Name: $VAULT_NAME"
echo "  ARN: $VAULT_ARN"
echo ""
echo "Source Accounts Configured:"
for account_id in "${SOURCE_ACCOUNT_IDS[@]}"; do
    echo "  - $account_id"
done
echo ""
echo "Next steps:"
echo "  1. Create backup plan in each source account using:"
echo "     $BACKUP_PLAN_FILE"
echo ""
echo "  2. Test with manual backup job:"
echo "     aws backup start-backup-job \\"
echo "       --backup-vault-name Default \\"
echo "       --resource-arn arn:aws:dynamodb:$REGION:ACCOUNT:table/TABLE \\"
echo "       --iam-role-arn arn:aws:iam::ACCOUNT:role/AWSBackupDefaultServiceRole"
echo ""
echo "  3. Verify copy appears in backup account vault"
echo ""
