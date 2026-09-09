#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Create or Invite Member Account
#
# Usage:
#   ./create-member-account.sh create <account-name> <email> <ou-name>
#   ./create-member-account.sh invite <account-id>
#   ./create-member-account.sh move <account-id> <ou-name>
#   ./create-member-account.sh status
#
# Examples:
#   ./create-member-account.sh create submit-ci aws-ci@diyaccounting.co.uk Workloads
#   ./create-member-account.sh invite 887764105431
#   ./create-member-account.sh move 887764105431 Workloads
#   ./create-member-account.sh status

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

PROFILE="${AWS_PROFILE:-default}"
REGION="${AWS_REGION:-eu-west-2}"

# Load org config if available
CONFIG_FILE="$(dirname "$0")/../../target/migration/org-config.json"
if [ -f "$CONFIG_FILE" ]; then
    ROOT_ID=$(jq -r '.rootId' "$CONFIG_FILE")
    WORKLOADS_OU=$(jq -r '.organizationalUnits.workloads' "$CONFIG_FILE")
    BACKUP_OU=$(jq -r '.organizationalUnits.backup' "$CONFIG_FILE")
else
    # Get from AWS
    ROOT_ID=$(aws organizations list-roots --profile "$PROFILE" --query 'Roots[0].Id' --output text)
fi

get_ou_id() {
    local ou_name="$1"
    case "$ou_name" in
        "Workloads")
            if [ -n "${WORKLOADS_OU:-}" ]; then
                echo "$WORKLOADS_OU"
            else
                aws organizations list-organizational-units-for-parent \
                    --parent-id "$ROOT_ID" \
                    --profile "$PROFILE" \
                    --query "OrganizationalUnits[?Name=='Workloads'].Id" \
                    --output text
            fi
            ;;
        "Backup")
            if [ -n "${BACKUP_OU:-}" ]; then
                echo "$BACKUP_OU"
            else
                aws organizations list-organizational-units-for-parent \
                    --parent-id "$ROOT_ID" \
                    --profile "$PROFILE" \
                    --query "OrganizationalUnits[?Name=='Backup'].Id" \
                    --output text
            fi
            ;;
        *)
            aws organizations list-organizational-units-for-parent \
                --parent-id "$ROOT_ID" \
                --profile "$PROFILE" \
                --query "OrganizationalUnits[?Name=='$ou_name'].Id" \
                --output text
            ;;
    esac
}

create_account() {
    local account_name="$1"
    local email="$2"
    local ou_name="$3"

    log_info "Creating account: $account_name ($email)"

    # Create the account
    request_id=$(aws organizations create-account \
        --email "$email" \
        --account-name "$account_name" \
        --iam-user-access-to-billing DENY \
        --profile "$PROFILE" \
        --query 'CreateAccountStatus.Id' \
        --output text)

    log_info "Account creation request: $request_id"
    log_info "Waiting for account creation..."

    # Poll for completion
    while true; do
        status=$(aws organizations describe-create-account-status \
            --create-account-request-id "$request_id" \
            --profile "$PROFILE" \
            --query 'CreateAccountStatus.[State,AccountId]' \
            --output text)

        state=$(echo "$status" | awk '{print $1}')
        account_id=$(echo "$status" | awk '{print $2}')

        case "$state" in
            "IN_PROGRESS")
                log_info "Still creating..."
                sleep 10
                ;;
            "SUCCEEDED")
                log_info "Account created successfully!"
                log_info "Account ID: $account_id"
                break
                ;;
            "FAILED")
                failure_reason=$(aws organizations describe-create-account-status \
                    --create-account-request-id "$request_id" \
                    --profile "$PROFILE" \
                    --query 'CreateAccountStatus.FailureReason' \
                    --output text)
                log_error "Account creation failed: $failure_reason"
                exit 1
                ;;
        esac
    done

    # Move to OU
    if [ -n "$ou_name" ]; then
        ou_id=$(get_ou_id "$ou_name")
        if [ -n "$ou_id" ] && [ "$ou_id" != "None" ]; then
            log_info "Moving account to OU: $ou_name ($ou_id)"
            aws organizations move-account \
                --account-id "$account_id" \
                --source-parent-id "$ROOT_ID" \
                --destination-parent-id "$ou_id" \
                --profile "$PROFILE"
            log_info "Account moved successfully"
        else
            log_warn "OU '$ou_name' not found. Account remains in root."
        fi
    fi

    # Save account info
    echo "$account_id" >> "$(dirname "$0")/../../target/migration/created-accounts.txt"

    echo ""
    echo "=============================================="
    echo "Account created!"
    echo "=============================================="
    echo "Account Name: $account_name"
    echo "Account ID: $account_id"
    echo "Email: $email"
    echo "OU: $ou_name"
    echo ""
    echo "Next steps:"
    echo "  1. Set up root credentials for break-glass access"
    echo "  2. Run: ./setup-oidc-roles.sh $account_name $account_id"
    echo "  3. Run: ./bootstrap-cdk.sh $account_id"
    echo ""
}

invite_account() {
    local account_id="$1"

    log_info "Inviting account: $account_id"

    # Send invitation
    handshake_id=$(aws organizations invite-account-to-organization \
        --target "Id=$account_id,Type=ACCOUNT" \
        --notes "Joining DIY Accounting AWS Organization" \
        --profile "$PROFILE" \
        --query 'Handshake.Id' \
        --output text)

    log_info "Invitation sent: $handshake_id"

    echo ""
    echo "=============================================="
    echo "Invitation sent!"
    echo "=============================================="
    echo "Account ID: $account_id"
    echo "Handshake ID: $handshake_id"
    echo ""
    echo "Next steps:"
    echo "  1. Sign into account $account_id"
    echo "  2. Go to AWS Organizations"
    echo "  3. Accept the invitation"
    echo "  4. Run: ./create-member-account.sh status"
    echo "  5. Once accepted, run: ./create-member-account.sh move $account_id Workloads"
    echo ""
}

move_account() {
    local account_id="$1"
    local ou_name="$2"

    # Get current parent
    current_parent=$(aws organizations list-parents \
        --child-id "$account_id" \
        --profile "$PROFILE" \
        --query 'Parents[0].Id' \
        --output text)

    # Get target OU
    target_ou=$(get_ou_id "$ou_name")

    if [ -z "$target_ou" ] || [ "$target_ou" = "None" ]; then
        log_error "OU '$ou_name' not found"
        exit 1
    fi

    if [ "$current_parent" = "$target_ou" ]; then
        log_info "Account $account_id is already in OU $ou_name"
        return 0
    fi

    log_info "Moving account $account_id from $current_parent to $target_ou ($ou_name)"

    aws organizations move-account \
        --account-id "$account_id" \
        --source-parent-id "$current_parent" \
        --destination-parent-id "$target_ou" \
        --profile "$PROFILE"

    log_info "Account moved successfully"
}

show_status() {
    echo "=============================================="
    echo "Organization Status"
    echo "=============================================="
    echo ""

    log_info "Accounts:"
    aws organizations list-accounts \
        --profile "$PROFILE" \
        --query 'Accounts[*].[Id,Name,Email,Status]' \
        --output table

    echo ""
    log_info "Pending invitations:"
    aws organizations list-handshakes-for-organization \
        --filter ActionType=INVITE \
        --profile "$PROFILE" \
        --query 'Handshakes[?State==`OPEN`].[Id,Parties[0].Id,State]' \
        --output table 2>/dev/null || echo "  (none)"

    echo ""
    log_info "Organizational Units:"
    aws organizations list-organizational-units-for-parent \
        --parent-id "$ROOT_ID" \
        --profile "$PROFILE" \
        --query 'OrganizationalUnits[*].[Id,Name]' \
        --output table

    echo ""
    log_info "Accounts in Workloads OU:"
    WORKLOADS_OU_ID=$(get_ou_id "Workloads")
    if [ -n "$WORKLOADS_OU_ID" ] && [ "$WORKLOADS_OU_ID" != "None" ]; then
        aws organizations list-accounts-for-parent \
            --parent-id "$WORKLOADS_OU_ID" \
            --profile "$PROFILE" \
            --query 'Accounts[*].[Id,Name]' \
            --output table 2>/dev/null || echo "  (none)"
    fi

    echo ""
    log_info "Accounts in Backup OU:"
    BACKUP_OU_ID=$(get_ou_id "Backup")
    if [ -n "$BACKUP_OU_ID" ] && [ "$BACKUP_OU_ID" != "None" ]; then
        aws organizations list-accounts-for-parent \
            --parent-id "$BACKUP_OU_ID" \
            --profile "$PROFILE" \
            --query 'Accounts[*].[Id,Name]' \
            --output table 2>/dev/null || echo "  (none)"
    fi
}

# Main
case "${1:-}" in
    "create")
        if [ $# -lt 4 ]; then
            log_error "Usage: $0 create <account-name> <email> <ou-name>"
            exit 1
        fi
        create_account "$2" "$3" "$4"
        ;;
    "invite")
        if [ $# -lt 2 ]; then
            log_error "Usage: $0 invite <account-id>"
            exit 1
        fi
        invite_account "$2"
        ;;
    "move")
        if [ $# -lt 3 ]; then
            log_error "Usage: $0 move <account-id> <ou-name>"
            exit 1
        fi
        move_account "$2" "$3"
        ;;
    "status")
        show_status
        ;;
    *)
        echo "Usage: $0 <command> [args]"
        echo ""
        echo "Commands:"
        echo "  create <name> <email> <ou>  Create new account in organization"
        echo "  invite <account-id>         Invite existing account to organization"
        echo "  move <account-id> <ou>      Move account to organizational unit"
        echo "  status                      Show organization status"
        echo ""
        echo "OU names: Workloads, Backup"
        exit 1
        ;;
esac
