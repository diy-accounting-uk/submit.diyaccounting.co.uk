#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/backup-salts.sh - Export user sub hash salts for disaster recovery
#
# Usage:
#   ./scripts/backup-salts.sh
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Access to Secrets Manager in eu-west-2
#
# Output:
#   Creates salt-backup-YYYYMMDD-HHMMSS.json with salt values
#   Store this file securely (e.g., 1Password) - DO NOT commit to Git

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="salt-backup-${TIMESTAMP}.json"
REGION="${AWS_REGION:-eu-west-2}"

echo "Backing up user sub hash salts from AWS Secrets Manager"
echo "   Region: $REGION"
echo ""

# Function to get salt or return NOT_FOUND
get_salt() {
  local secret_id=$1
  aws secretsmanager get-secret-value \
    --secret-id "$secret_id" \
    --region "$REGION" \
    --query SecretString \
    --output text 2>/dev/null || echo "NOT_FOUND"
}

# Get salts for each environment
CI_SALT=$(get_salt "ci/submit/user-sub-hash-salt")
PROD_SALT=$(get_salt "prod/submit/user-sub-hash-salt")

# Check if any salts were found
if [ "$CI_SALT" = "NOT_FOUND" ] && [ "$PROD_SALT" = "NOT_FOUND" ]; then
  echo "No salts found. This is expected if environments haven't been deployed yet."
  exit 0
fi

# Create JSON backup
cat > "$OUTPUT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "region": "$REGION",
  "salts": {
    "ci": "$CI_SALT",
    "prod": "$PROD_SALT"
  },
  "restore_instructions": {
    "command": "aws secretsmanager update-secret --secret-id <env>/submit/user-sub-hash-salt --secret-string <value> --region $REGION",
    "warning": "Only restore if salt was lost. Using wrong salt makes all data inaccessible."
  }
}
EOF

echo "Backup complete: $OUTPUT_FILE"
echo ""
echo "Found salts:"
[ "$CI_SALT" != "NOT_FOUND" ] && echo "   CI environment"
[ "$PROD_SALT" != "NOT_FOUND" ] && echo "   Prod environment"
echo ""
echo "IMPORTANT: Store this file securely"
echo "   - Add to 1Password or other secure storage"
echo "   - DO NOT commit to Git"
echo "   - Keep multiple dated backups"
echo ""
echo "Schedule: Run this script quarterly"
