#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Disaster Recovery: Restore from backup account to new PROD account
#
# Prerequisites:
# - New AWS account created
# - AWS credentials configured for new account
# - Access to backup account
#
# See BACKUP_STRATEGY_PLAN.md for full architecture documentation.

set -e

NEW_ACCOUNT_ID="${1:-}"
BACKUP_ACCOUNT_ID="${2:-}"
RESTORE_POINT="${3:-latest}"
REGION="${4:-eu-west-2}"

if [ -z "$NEW_ACCOUNT_ID" ] || [ -z "$BACKUP_ACCOUNT_ID" ]; then
    echo "Usage: $0 <new-account-id> <backup-account-id> [restore-point] [region]"
    echo ""
    echo "restore-point: 'latest' or specific recovery point ARN"
    exit 1
fi

echo "=============================================="
echo "DISASTER RECOVERY: Restore to New Account"
echo "=============================================="
echo "New Account:    $NEW_ACCOUNT_ID"
echo "Backup Account: $BACKUP_ACCOUNT_ID"
echo "Restore Point:  $RESTORE_POINT"
echo "Region:         $REGION"
echo "=============================================="
echo ""

# Step 1: List available recovery points
echo "Step 1: Listing available recovery points in backup account..."
aws backup list-recovery-points-by-backup-vault \
    --backup-vault-name "central-backup-vault" \
    --region "$REGION" \
    --max-results 10 \
    --query 'RecoveryPoints[*].[RecoveryPointArn,CreationDate,ResourceType]' \
    --output table

if [ "$RESTORE_POINT" = "latest" ]; then
    echo ""
    echo "Getting latest recovery point..."
    RECOVERY_POINT_ARN=$(aws backup list-recovery-points-by-backup-vault \
        --backup-vault-name "central-backup-vault" \
        --region "$REGION" \
        --max-results 1 \
        --query 'RecoveryPoints[0].RecoveryPointArn' \
        --output text)
    echo "Using recovery point: $RECOVERY_POINT_ARN"
else
    RECOVERY_POINT_ARN="$RESTORE_POINT"
fi

# Step 2: Create IAM role for restore in new account
echo ""
echo "Step 2: Creating restore IAM role in new account..."
cat > /tmp/restore-role-trust.json << 'EOF'
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

RESTORE_ROLE_ARN=$(aws iam create-role \
    --role-name "BackupRestoreRole" \
    --assume-role-policy-document file:///tmp/restore-role-trust.json \
    --query 'Role.Arn' \
    --output text 2>/dev/null || \
    aws iam get-role --role-name "BackupRestoreRole" --query 'Role.Arn' --output text)

aws iam attach-role-policy \
    --role-name "BackupRestoreRole" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores" || true

echo "Restore role: $RESTORE_ROLE_ARN"

# Step 3: Create local backup vault in new account
echo ""
echo "Step 3: Creating backup vault in new account..."
aws backup create-backup-vault \
    --backup-vault-name "prod-submit-primary-vault" \
    --region "$REGION" \
    --backup-vault-tags Environment=prod,Purpose=primary || true

# Step 4: Copy recovery point to new account
echo ""
echo "Step 4: Copying recovery point to new account..."
COPY_JOB_ID=$(aws backup start-copy-job \
    --recovery-point-arn "$RECOVERY_POINT_ARN" \
    --source-backup-vault-name "central-backup-vault" \
    --destination-backup-vault-arn "arn:aws:backup:${REGION}:${NEW_ACCOUNT_ID}:backup-vault:prod-submit-primary-vault" \
    --iam-role-arn "$RESTORE_ROLE_ARN" \
    --region "$REGION" \
    --query 'CopyJobId' \
    --output text)

echo "Copy job started: $COPY_JOB_ID"
echo "Waiting for copy to complete..."

# Wait for copy to complete
while true; do
    STATUS=$(aws backup describe-copy-job \
        --copy-job-id "$COPY_JOB_ID" \
        --region "$REGION" \
        --query 'CopyJob.State' \
        --output text)
    echo "  Status: $STATUS"
    if [ "$STATUS" = "COMPLETED" ]; then
        break
    elif [ "$STATUS" = "FAILED" ]; then
        echo "ERROR: Copy job failed!"
        exit 1
    fi
    sleep 30
done

# Step 5: Get the copied recovery point ARN
echo ""
echo "Step 5: Getting copied recovery point..."
COPIED_RECOVERY_POINT=$(aws backup describe-copy-job \
    --copy-job-id "$COPY_JOB_ID" \
    --region "$REGION" \
    --query 'CopyJob.DestinationRecoveryPointArn' \
    --output text)

echo "Copied recovery point: $COPIED_RECOVERY_POINT"

# Step 6: Restore DynamoDB tables
echo ""
echo "Step 6: Restoring DynamoDB tables..."

# Extract table name from recovery point
RESOURCE_ARN=$(aws backup describe-recovery-point \
    --backup-vault-name "prod-submit-primary-vault" \
    --recovery-point-arn "$COPIED_RECOVERY_POINT" \
    --region "$REGION" \
    --query 'ResourceArn' \
    --output text)

TABLE_NAME=$(echo "$RESOURCE_ARN" | sed 's/.*table\///')
RESTORE_TABLE_NAME="${TABLE_NAME}"

echo "Restoring table: $RESTORE_TABLE_NAME"

RESTORE_JOB_ID=$(aws backup start-restore-job \
    --recovery-point-arn "$COPIED_RECOVERY_POINT" \
    --iam-role-arn "$RESTORE_ROLE_ARN" \
    --metadata "{\"targetTableName\":\"$RESTORE_TABLE_NAME\"}" \
    --region "$REGION" \
    --query 'RestoreJobId' \
    --output text)

echo "Restore job started: $RESTORE_JOB_ID"
echo ""
echo "=============================================="
echo "DISASTER RECOVERY INITIATED"
echo "=============================================="
echo "Monitor restore job: aws backup describe-restore-job --restore-job-id $RESTORE_JOB_ID --region $REGION"
echo ""
echo "Next steps after restore completes:"
echo "1. Verify data in restored table"
echo "2. Run CDK deployment to recreate infrastructure"
echo "3. Update DNS records"
echo "4. Verify application functionality"
