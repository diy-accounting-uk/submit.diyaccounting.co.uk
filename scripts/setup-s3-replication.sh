#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Configure S3 cross-account replication for backup exports
#
# See BACKUP_STRATEGY_PLAN.md for full architecture documentation.

set -e

SOURCE_BUCKET="$1"
DEST_BUCKET="$2"
DEST_ACCOUNT_ID="$3"
ROLE_ARN="$4"

if [ -z "$SOURCE_BUCKET" ] || [ -z "$DEST_BUCKET" ] || [ -z "$DEST_ACCOUNT_ID" ] || [ -z "$ROLE_ARN" ]; then
    echo "Usage: $0 <source-bucket> <dest-bucket> <dest-account-id> <replication-role-arn>"
    exit 1
fi

echo "Configuring S3 replication from $SOURCE_BUCKET to $DEST_BUCKET..."

# Create replication configuration
cat > /tmp/replication-config.json << EOF
{
    "Role": "$ROLE_ARN",
    "Rules": [
        {
            "ID": "BackupReplication",
            "Status": "Enabled",
            "Priority": 1,
            "DeleteMarkerReplication": {
                "Status": "Disabled"
            },
            "Filter": {
                "Prefix": "exports/"
            },
            "Destination": {
                "Bucket": "arn:aws:s3:::$DEST_BUCKET",
                "Account": "$DEST_ACCOUNT_ID",
                "AccessControlTranslation": {
                    "Owner": "Destination"
                },
                "ReplicationTime": {
                    "Status": "Enabled",
                    "Time": {
                        "Minutes": 15
                    }
                },
                "Metrics": {
                    "Status": "Enabled",
                    "EventThreshold": {
                        "Minutes": 15
                    }
                }
            }
        }
    ]
}
EOF

aws s3api put-bucket-replication \
    --bucket "$SOURCE_BUCKET" \
    --replication-configuration file:///tmp/replication-config.json

echo "S3 replication configured successfully"
