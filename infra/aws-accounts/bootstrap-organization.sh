#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Bootstrap AWS Organization Helper
#
# This script assists with AWS Organization setup by:
# - Verifying organization structure
# - Creating organizational units
# - Documenting current state
#
# Prerequisites:
# - AWS CLI configured with management account credentials
# - Organization already created (must be done in console)
#
# Usage: ./bootstrap-organization.sh

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
REGION="${AWS_REGION:-eu-west-2}"
PROFILE="${AWS_PROFILE:-default}"

log_info "Using AWS profile: $PROFILE"
log_info "Using AWS region: $REGION"

# Check AWS CLI is available
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not found. Please install it first."
    exit 1
fi

# Check we can access AWS
log_info "Checking AWS access..."
CALLER_IDENTITY=$(aws sts get-caller-identity --profile "$PROFILE" 2>&1) || {
    log_error "Cannot access AWS. Check your credentials."
    exit 1
}
ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | jq -r '.Account')
log_info "Current account: $ACCOUNT_ID"

# Check if this is an organization management account
log_info "Checking organization status..."
ORG_INFO=$(aws organizations describe-organization --profile "$PROFILE" 2>&1) || {
    log_error "No organization found. Please create one in the AWS Console first:"
    log_error "  1. Sign into AWS Console"
    log_error "  2. Go to AWS Organizations"
    log_error "  3. Click 'Create organization'"
    log_error "  4. Re-run this script"
    exit 1
}

MASTER_ACCOUNT=$(echo "$ORG_INFO" | jq -r '.Organization.MasterAccountId')
ORG_ID=$(echo "$ORG_INFO" | jq -r '.Organization.Id')

if [ "$ACCOUNT_ID" != "$MASTER_ACCOUNT" ]; then
    log_error "This script must be run from the management account."
    log_error "Current account: $ACCOUNT_ID"
    log_error "Management account: $MASTER_ACCOUNT"
    exit 1
fi

log_info "Organization ID: $ORG_ID"
log_info "Management account: $MASTER_ACCOUNT"

# Get root ID
ROOT_ID=$(aws organizations list-roots --profile "$PROFILE" --query 'Roots[0].Id' --output text)
log_info "Root ID: $ROOT_ID"

# Function to create OU if it doesn't exist
create_ou_if_not_exists() {
    local parent_id="$1"
    local ou_name="$2"

    # Check if OU already exists
    existing_ou=$(aws organizations list-organizational-units-for-parent \
        --parent-id "$parent_id" \
        --profile "$PROFILE" \
        --query "OrganizationalUnits[?Name=='$ou_name'].Id" \
        --output text 2>/dev/null || echo "")

    if [ -n "$existing_ou" ] && [ "$existing_ou" != "None" ]; then
        log_info "OU '$ou_name' already exists: $existing_ou"
        echo "$existing_ou"
        return 0
    fi

    # Create OU
    log_info "Creating OU: $ou_name"
    new_ou=$(aws organizations create-organizational-unit \
        --parent-id "$parent_id" \
        --name "$ou_name" \
        --profile "$PROFILE" \
        --query 'OrganizationalUnit.Id' \
        --output text)

    log_info "Created OU '$ou_name': $new_ou"
    echo "$new_ou"
}

# Create Organizational Units
log_info "Setting up Organizational Units..."

WORKLOADS_OU=$(create_ou_if_not_exists "$ROOT_ID" "Workloads")
BACKUP_OU=$(create_ou_if_not_exists "$ROOT_ID" "Backup")

# List current accounts
log_info "Current accounts in organization:"
aws organizations list-accounts \
    --profile "$PROFILE" \
    --query 'Accounts[*].[Id,Name,Status]' \
    --output table

# List OUs
log_info "Organizational Units:"
aws organizations list-organizational-units-for-parent \
    --parent-id "$ROOT_ID" \
    --profile "$PROFILE" \
    --query 'OrganizationalUnits[*].[Id,Name]' \
    --output table

# Save configuration to file
CONFIG_FILE="$(dirname "$0")/../../target/migration/org-config.json"
mkdir -p "$(dirname "$CONFIG_FILE")"

cat > "$CONFIG_FILE" << EOF
{
  "organizationId": "$ORG_ID",
  "managementAccountId": "$MASTER_ACCOUNT",
  "rootId": "$ROOT_ID",
  "organizationalUnits": {
    "workloads": "$WORKLOADS_OU",
    "backup": "$BACKUP_OU"
  },
  "region": "$REGION",
  "createdAt": "$(date -Iseconds)"
}
EOF

log_info "Configuration saved to: $CONFIG_FILE"

# Print next steps
echo ""
echo "=============================================="
echo "Organization bootstrap complete!"
echo "=============================================="
echo ""
echo "Organization ID: $ORG_ID"
echo "Workloads OU: $WORKLOADS_OU"
echo "Backup OU: $BACKUP_OU"
echo ""
echo "Next steps:"
echo "  1. Invite production account (887764105431) to organization"
echo "     Run: ./create-member-account.sh invite 887764105431"
echo ""
echo "  2. Create CI account"
echo "     Run: ./create-member-account.sh create submit-ci aws-ci@diyaccounting.co.uk Workloads"
echo ""
echo "  3. Create Backup account"
echo "     Run: ./create-member-account.sh create submit-backup aws-backup@diyaccounting.co.uk Backup"
echo ""
echo "  4. Enable IAM Identity Center (must be done in console)"
echo "     See: docs/aws-multi-account/IAM_IDENTITY_CENTER.md"
echo ""
