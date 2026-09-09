#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Add a bundle to DynamoDB for a user (identified by hashed sub)
# Usage: ./add-bundle.sh <hashed-sub> <bundle-id> [environment]

set -e

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <hashed-sub> <bundle-id> [environment]"
    echo "Example: $0 da4609210dfd123eb14520a79f533244e0411058911fc4508656056e2b3282ec test ci"
    exit 1
fi

HASHED_SUB="$1"
BUNDLE_ID="$2"
ENVIRONMENT="${3:-ci}"  # Default to ci if not specified
AWS_REGION="${AWS_REGION:-eu-west-2}"

# Load product catalog to get bundle timeout
CATALOG_FILE="web/public/submit.catalogue.toml"
if [ ! -f "$CATALOG_FILE" ]; then
    echo "Error: web/public/submit.catalogue.toml not found"
    exit 1
fi

# Extract timeout for the bundle using grep and awk
TIMEOUT=$(awk -v bundle="$BUNDLE_ID" '
    /^\[\[bundles\]\]/ { in_bundle=0 }
    /^id = / { if ($3 == "\"" bundle "\"") in_bundle=1 }
    in_bundle && /^timeout = / { gsub(/"/, "", $3); print $3; exit }
' "$CATALOG_FILE")

if [ -z "$TIMEOUT" ]; then
    echo "Warning: No timeout found for bundle $BUNDLE_ID, using default P1D"
    TIMEOUT="P1D"
fi

echo "Adding bundle: $BUNDLE_ID with timeout $TIMEOUT for hashed sub: $HASHED_SUB"

# Parse ISO 8601 duration to calculate expiry
# This is a simple parser for PnD, PnM, PnY format
calculate_expiry() {
    local duration="$1"
    local now_timestamp=$(date -u +%s)

    # Extract components using regex
    years=$(echo "$duration" | grep -oP 'P(\d+)Y' | grep -oP '\d+' || echo "0")
    months=$(echo "$duration" | grep -oP '(\d+)M' | grep -oP '\d+' || echo "0")
    days=$(echo "$duration" | grep -oP '(\d+)D' | grep -oP '\d+' || echo "0")

    # Calculate future timestamp using date command
    local expiry_date=$(date -u -d "now + ${years} years + ${months} months + ${days} days" +%Y-%m-%dT%H:%M:%S.%3NZ)
    echo "$expiry_date"
}

EXPIRY=$(calculate_expiry "$TIMEOUT")
echo "Calculated expiry: $EXPIRY"

# Calculate TTL (1 month after expiry) in Unix timestamp
# Use date's ability to add 1 month from the expiry date
EXPIRY_UNIX=$(date -u -d "$EXPIRY" +%s)
TTL_DATESTAMP_ISO=$(date -u -d "$EXPIRY + 1 month" +%Y-%m-%dT%H:%M:%S.%3NZ)
TTL_UNIX=$(date -u -d "$TTL_DATESTAMP_ISO" +%s)

echo "TTL Unix timestamp: $TTL_UNIX"
echo "TTL datestamp: $TTL_DATESTAMP_ISO"

# Get the DynamoDB table name
TABLE_NAME="${ENVIRONMENT}-submit-bundles"
echo "Using table: $TABLE_NAME"

# Create the item JSON
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
ITEM_JSON=$(cat <<EOF
{
  "hashedSub": {"S": "$HASHED_SUB"},
  "bundleId": {"S": "$BUNDLE_ID"},
  "createdAt": {"S": "$CREATED_AT"},
  "expiry": {"S": "$EXPIRY"},
  "ttl": {"N": "$TTL_UNIX"},
  "ttl_datestamp": {"S": "$TTL_DATESTAMP_ISO"}
}
EOF
)

echo "Item to insert:"
echo "$ITEM_JSON"

# Insert into DynamoDB
aws dynamodb put-item \
    --table-name "$TABLE_NAME" \
    --item "$ITEM_JSON" \
    --region "$AWS_REGION"

echo "Bundle added successfully!"
