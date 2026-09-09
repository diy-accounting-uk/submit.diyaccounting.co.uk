#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

set -euo pipefail

# Export DynamoDB data for test users after behaviour tests complete
#
# This script:
# 1. Reads user sub(s) from test results (userSub.txt files)
# 2. Exports DynamoDB data for those users in JSON Lines format
# 3. Saves the export to the test results directory
#
# Usage:
#   export-test-dynamodb.sh <deployment-name>
#
# Environment variables:
#   AWS_REGION - AWS region (default: eu-west-2)
#   RESULTS_DIR - Test results directory (default: target/behaviour-test-results)

DEPLOYMENT_NAME="${1:-}"
AWS_REGION="${AWS_REGION:-eu-west-2}"
RESULTS_DIR="${RESULTS_DIR:-target/behaviour-test-results}"

if [ -z "$DEPLOYMENT_NAME" ]; then
  echo "❌ Error: deployment name required"
  echo "Usage: $0 <deployment-name>"
  exit 1
fi

echo "=== Exporting DynamoDB data for test users ==="
echo "Deployment: $DEPLOYMENT_NAME"
echo "Region: $AWS_REGION"
echo "Results directory: $RESULTS_DIR"
echo ""

# Find all userSub.txt files in the test results
find "$RESULTS_DIR" -type f -name 'userSub.txt' | while read -r file; do
  echo "$file:"
  cat "$file"
  echo
done
USER_SUB_FILES=$(find "$RESULTS_DIR" -type f -name "userSub.txt" 2>/dev/null || true)

if [ -z "$USER_SUB_FILES" ]; then
  echo "⚠️  No userSub.txt files found in $RESULTS_DIR"
  echo "   This may be normal if tests failed before user authentication"
  echo "   Skipping DynamoDB export"
  exit 0
fi

# Collect unique user subs
USER_SUBS=()
while IFS= read -r file; do
  if [ -f "$file" ]; then
    SUB=$(tr -d '[:space:]' < "$file")
    if [ -n "$SUB" ]; then
      # Check if already in array
      FOUND=0
      if [ ${#USER_SUBS[@]} -gt 0 ]; then
        for existing in "${USER_SUBS[@]}"; do
          if [ "$existing" = "$SUB" ]; then
            FOUND=1
            break
          fi
        done
      fi
      if [ $FOUND -eq 0 ]; then
        USER_SUBS+=("$SUB")
      fi
    fi
  fi
done <<< "$USER_SUB_FILES"

if [ ${#USER_SUBS[@]} -eq 0 ]; then
  echo "⚠️  No valid user subs found in userSub.txt files"
  echo "   Skipping DynamoDB export"
  exit 0
fi

echo "Found ${#USER_SUBS[@]} unique user sub(s)"
echo ""

# Call the Node.js export script
export OUTPUT_DIR="$RESULTS_DIR"
export AWS_REGION="$AWS_REGION"

node scripts/export-dynamodb-for-test-users.js "$DEPLOYMENT_NAME" "${USER_SUBS[@]}"

echo ""
echo "✅ DynamoDB export completed"
