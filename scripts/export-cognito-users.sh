#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Export Cognito User Pool users (metadata only, passwords cannot be exported)
#
# AWS Cognito does not allow password export due to security constraints.
# This script exports user metadata for DR purposes.
#
# See BACKUP_STRATEGY_PLAN.md for full architecture documentation.

set -e

USER_POOL_ID="${1:-}"
OUTPUT_DIR="${2:-./target/cognito-backup}"

if [ -z "$USER_POOL_ID" ]; then
    echo "Usage: $0 <user-pool-id> [output-directory]"
    echo ""
    echo "Example: $0 eu-west-2_abc123xyz ./backups"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="${OUTPUT_DIR}/cognito-users-${TIMESTAMP}.json"
GROUPS_FILE="${OUTPUT_DIR}/cognito-groups-${TIMESTAMP}.json"

echo "=== Cognito User Pool Export ==="
echo "User Pool ID: $USER_POOL_ID"
echo "Output: $OUTPUT_DIR"
echo ""

# Export users
echo "1. Exporting users..."
aws cognito-idp list-users \
    --user-pool-id "$USER_POOL_ID" \
    --output json > "$OUTPUT_FILE"

USER_COUNT=$(jq '.Users | length' "$OUTPUT_FILE")
echo "   Exported $USER_COUNT users to $OUTPUT_FILE"

# Export groups
echo "2. Exporting groups..."
aws cognito-idp list-groups \
    --user-pool-id "$USER_POOL_ID" \
    --output json > "$GROUPS_FILE"

GROUP_COUNT=$(jq '.Groups | length' "$GROUPS_FILE")
echo "   Exported $GROUP_COUNT groups to $GROUPS_FILE"

# Export group memberships
echo "3. Exporting group memberships..."
MEMBERSHIP_FILE="${OUTPUT_DIR}/cognito-memberships-${TIMESTAMP}.json"
echo '{"memberships":[]}' > "$MEMBERSHIP_FILE"

for GROUP in $(jq -r '.Groups[].GroupName' "$GROUPS_FILE"); do
    echo "   Processing group: $GROUP"
    MEMBERS=$(aws cognito-idp list-users-in-group \
        --user-pool-id "$USER_POOL_ID" \
        --group-name "$GROUP" \
        --output json)

    # Append to memberships file
    jq --arg group "$GROUP" --argjson members "$MEMBERS" \
        '.memberships += [{"group": $group, "users": $members.Users}]' \
        "$MEMBERSHIP_FILE" > "${MEMBERSHIP_FILE}.tmp" && mv "${MEMBERSHIP_FILE}.tmp" "$MEMBERSHIP_FILE"
done

echo ""
echo "=== Export Complete ==="
echo "Files created:"
echo "  - $OUTPUT_FILE (users)"
echo "  - $GROUPS_FILE (groups)"
echo "  - $MEMBERSHIP_FILE (group memberships)"
echo ""
echo "NOTE: Passwords are NOT exported (AWS security constraint)."
echo "In DR scenario, users will need to reset their passwords."
