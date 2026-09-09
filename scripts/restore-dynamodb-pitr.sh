#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Restore DynamoDB table using Point-in-Time Recovery
#
# Use this for quick recovery from accidental data deletion.
#
# See BACKUP_STRATEGY_PLAN.md for full architecture documentation.

set -e

TABLE_NAME="$1"
RESTORE_DATETIME="$2"
TARGET_TABLE="${3:-${TABLE_NAME}-restored}"

if [ -z "$TABLE_NAME" ] || [ -z "$RESTORE_DATETIME" ]; then
    echo "Usage: $0 <table-name> <restore-datetime> [target-table-name]"
    echo ""
    echo "Example: $0 prod-submit-receipts '2026-01-08T12:00:00Z'"
    exit 1
fi

echo "Restoring $TABLE_NAME to $TARGET_TABLE at $RESTORE_DATETIME..."

# Check PITR status
PITR_STATUS=$(aws dynamodb describe-continuous-backups \
    --table-name "$TABLE_NAME" \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
    --output text)

if [ "$PITR_STATUS" != "ENABLED" ]; then
    echo "ERROR: PITR is not enabled on $TABLE_NAME"
    exit 1
fi

# Get earliest restore time
EARLIEST=$(aws dynamodb describe-continuous-backups \
    --table-name "$TABLE_NAME" \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.EarliestRestorableDateTime' \
    --output text)

echo "Earliest restorable time: $EARLIEST"
echo "Requested restore time:   $RESTORE_DATETIME"

# Restore table
aws dynamodb restore-table-to-point-in-time \
    --source-table-name "$TABLE_NAME" \
    --target-table-name "$TARGET_TABLE" \
    --restore-date-time "$RESTORE_DATETIME"

echo "Restore initiated. Monitor with:"
echo "  aws dynamodb describe-table --table-name $TARGET_TABLE --query 'Table.TableStatus'"
echo ""
echo "After restore completes:"
echo "1. Verify data in $TARGET_TABLE"
echo "2. If correct, rename tables:"
echo "   - Rename $TABLE_NAME to ${TABLE_NAME}-old"
echo "   - Rename $TARGET_TABLE to $TABLE_NAME"
echo "3. Delete old table after verification"
