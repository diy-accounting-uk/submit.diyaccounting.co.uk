#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Bootstrap CDK in AWS Accounts
#
# Bootstraps CDK toolkit stack with cross-account trust relationships.
#
# Usage:
#   ./bootstrap-cdk.sh <account-id> [trust-account-id]
#   ./bootstrap-cdk.sh all
#
# Examples:
#   ./bootstrap-cdk.sh 887764105431                    # Bootstrap prod
#   ./bootstrap-cdk.sh 123456789012 999999999999       # Bootstrap with trust
#   ./bootstrap-cdk.sh all                             # Bootstrap all accounts

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

REGION="${AWS_REGION:-eu-west-2}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/../.."

# Load configuration if available
CONFIG_FILE="$PROJECT_DIR/target/migration/org-config.json"

# Check CDK is available
if ! command -v cdk &> /dev/null; then
    log_error "CDK CLI not found. Install with: npm install -g aws-cdk"
    exit 1
fi

bootstrap_account() {
    local account_id="$1"
    local trust_account_id="${2:-}"
    local profile="${3:-default}"

    log_info "Bootstrapping CDK for account: $account_id"
    log_info "Using profile: $profile"

    # Build trust argument if provided
    local trust_arg=""
    if [ -n "$trust_account_id" ]; then
        trust_arg="--trust $trust_account_id"
        log_info "Trust account: $trust_account_id"
    fi

    # Bootstrap primary region
    log_info "Bootstrapping region: $REGION"
    cdk bootstrap "aws://${account_id}/${REGION}" \
        --profile "$profile" \
        $trust_arg \
        --cloudformation-execution-policies "arn:aws:iam::aws:policy/AdministratorAccess" \
        --toolkit-stack-name "CDKToolkit" \
        --qualifier "hnb659fds" || {
            log_error "Failed to bootstrap $REGION"
            return 1
        }

    # Bootstrap us-east-1 for CloudFront/Edge Lambda
    log_info "Bootstrapping region: us-east-1 (for CloudFront)"
    cdk bootstrap "aws://${account_id}/us-east-1" \
        --profile "$profile" \
        $trust_arg \
        --cloudformation-execution-policies "arn:aws:iam::aws:policy/AdministratorAccess" \
        --toolkit-stack-name "CDKToolkit" \
        --qualifier "hnb659fds" || {
            log_warn "Failed to bootstrap us-east-1 - CloudFront functions may not work"
        }

    log_info "CDK bootstrap complete for account $account_id"
}

get_profile_for_account() {
    local account_id="$1"

    case "$account_id" in
        "887764105431")
            echo "submit-prod-admin"
            ;;
        *)
            # Try to find a matching profile
            if aws sts get-caller-identity --profile "submit-ci-admin" --query 'Account' --output text 2>/dev/null | grep -q "$account_id"; then
                echo "submit-ci-admin"
            elif aws sts get-caller-identity --profile "submit-backup-admin" --query 'Account' --output text 2>/dev/null | grep -q "$account_id"; then
                echo "submit-backup-admin"
            else
                echo "default"
            fi
            ;;
    esac
}

bootstrap_all() {
    log_info "Bootstrapping all accounts..."

    # Load account IDs from configuration
    if [ -f "$CONFIG_FILE" ]; then
        MANAGEMENT_ACCOUNT=$(jq -r '.managementAccountId' "$CONFIG_FILE")
    else
        log_warn "No org-config.json found. Using defaults."
        MANAGEMENT_ACCOUNT=""
    fi

    # Load role configs for account IDs
    PROD_ACCOUNT="887764105431"

    # Try to get CI account from config
    CI_CONFIG="$PROJECT_DIR/target/migration/submit-ci-roles.json"
    if [ -f "$CI_CONFIG" ]; then
        CI_ACCOUNT=$(jq -r '.accountId' "$CI_CONFIG")
    else
        log_warn "CI account config not found. Skipping CI bootstrap."
        CI_ACCOUNT=""
    fi

    # Bootstrap prod
    log_info "Bootstrapping production account..."
    PROD_PROFILE=$(get_profile_for_account "$PROD_ACCOUNT")
    bootstrap_account "$PROD_ACCOUNT" "$MANAGEMENT_ACCOUNT" "$PROD_PROFILE"

    # Bootstrap CI if configured
    if [ -n "$CI_ACCOUNT" ]; then
        log_info "Bootstrapping CI account..."
        CI_PROFILE=$(get_profile_for_account "$CI_ACCOUNT")
        bootstrap_account "$CI_ACCOUNT" "$MANAGEMENT_ACCOUNT" "$CI_PROFILE"
    fi

    log_info "All accounts bootstrapped"
}

verify_bootstrap() {
    local account_id="$1"
    local profile="${2:-default}"

    log_info "Verifying CDK bootstrap for account: $account_id"

    # Check CloudFormation stack exists
    STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name "CDKToolkit" \
        --profile "$profile" \
        --region "$REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")

    if [ "$STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$STACK_STATUS" = "UPDATE_COMPLETE" ]; then
        log_info "CDK bootstrap verified: $STACK_STATUS"
        return 0
    else
        log_error "CDK bootstrap not found or in unexpected state: $STACK_STATUS"
        return 1
    fi
}

# Main
case "${1:-}" in
    "all")
        bootstrap_all
        ;;
    "verify")
        if [ -z "${2:-}" ]; then
            log_error "Usage: $0 verify <account-id>"
            exit 1
        fi
        PROFILE=$(get_profile_for_account "$2")
        verify_bootstrap "$2" "$PROFILE"
        ;;
    "")
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  <account-id> [trust-account-id]  Bootstrap specific account"
        echo "  all                              Bootstrap all configured accounts"
        echo "  verify <account-id>              Verify CDK bootstrap status"
        echo ""
        echo "Examples:"
        echo "  $0 887764105431                  Bootstrap production account"
        echo "  $0 123456789012 999999999999     Bootstrap with cross-account trust"
        echo "  $0 all                           Bootstrap all accounts"
        echo "  $0 verify 887764105431           Check bootstrap status"
        exit 1
        ;;
    *)
        ACCOUNT_ID="$1"
        TRUST_ACCOUNT="${2:-}"
        PROFILE=$(get_profile_for_account "$ACCOUNT_ID")
        bootstrap_account "$ACCOUNT_ID" "$TRUST_ACCOUNT" "$PROFILE"
        ;;
esac

echo ""
echo "=============================================="
echo "CDK Bootstrap Complete!"
echo "=============================================="
echo ""
echo "Verify with:"
echo "  $0 verify <account-id>"
echo ""
echo "Deploy with:"
echo "  npm run deploy:ci   # Deploy to CI account"
echo "  npm run deploy:prod # Deploy to production"
echo ""
