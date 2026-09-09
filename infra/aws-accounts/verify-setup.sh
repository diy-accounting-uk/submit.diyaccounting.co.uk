#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Verify AWS Multi-Account Setup
#
# Runs comprehensive checks to verify the multi-account setup is complete and functional.
#
# Usage: ./verify-setup.sh [--verbose]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VERBOSE="${1:-}"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_check() { echo -e "${BLUE}[CHECK]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/../.."
REGION="${AWS_REGION:-eu-west-2}"

# Track results
PASSED=0
FAILED=0
WARNINGS=0

check_pass() {
    log_pass "$1"
    ((PASSED++))
}

check_fail() {
    log_fail "$1"
    ((FAILED++))
}

check_warn() {
    log_warn "$1"
    ((WARNINGS++))
}

# ============================================
# Organization Checks
# ============================================

check_organization() {
    echo ""
    echo "=============================================="
    echo "1. Organization Structure"
    echo "=============================================="

    # Check organization exists
    log_check "Organization exists..."
    if ORG_INFO=$(aws organizations describe-organization 2>/dev/null); then
        ORG_ID=$(echo "$ORG_INFO" | jq -r '.Organization.Id')
        check_pass "Organization: $ORG_ID"
    else
        check_fail "Organization not found"
        return 1
    fi

    # Check OUs exist
    ROOT_ID=$(aws organizations list-roots --query 'Roots[0].Id' --output text)

    log_check "Workloads OU exists..."
    if WORKLOADS_OU=$(aws organizations list-organizational-units-for-parent \
        --parent-id "$ROOT_ID" \
        --query "OrganizationalUnits[?Name=='Workloads'].Id" \
        --output text 2>/dev/null) && [ -n "$WORKLOADS_OU" ] && [ "$WORKLOADS_OU" != "None" ]; then
        check_pass "Workloads OU: $WORKLOADS_OU"
    else
        check_fail "Workloads OU not found"
    fi

    log_check "Backup OU exists..."
    if BACKUP_OU=$(aws organizations list-organizational-units-for-parent \
        --parent-id "$ROOT_ID" \
        --query "OrganizationalUnits[?Name=='Backup'].Id" \
        --output text 2>/dev/null) && [ -n "$BACKUP_OU" ] && [ "$BACKUP_OU" != "None" ]; then
        check_pass "Backup OU: $BACKUP_OU"
    else
        check_fail "Backup OU not found"
    fi

    # Count accounts
    log_check "Account count..."
    ACCOUNT_COUNT=$(aws organizations list-accounts --query 'length(Accounts)' --output text)
    if [ "$ACCOUNT_COUNT" -ge 3 ]; then
        check_pass "Found $ACCOUNT_COUNT accounts (minimum 3 required)"
    else
        check_warn "Only $ACCOUNT_COUNT accounts found (recommend 4: management, ci, prod, backup)"
    fi
}

# ============================================
# IAM Identity Center Checks
# ============================================

check_identity_center() {
    echo ""
    echo "=============================================="
    echo "2. IAM Identity Center"
    echo "=============================================="

    log_check "IAM Identity Center enabled..."

    # This check requires being in the management account
    if SSO_INSTANCE=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text 2>/dev/null) && \
       [ -n "$SSO_INSTANCE" ] && [ "$SSO_INSTANCE" != "None" ]; then
        check_pass "IAM Identity Center enabled"

        # Check permission sets
        log_check "Permission sets configured..."
        PS_COUNT=$(aws sso-admin list-permission-sets \
            --instance-arn "$SSO_INSTANCE" \
            --query 'length(PermissionSets)' \
            --output text 2>/dev/null || echo "0")

        if [ "$PS_COUNT" -ge 3 ]; then
            check_pass "Found $PS_COUNT permission sets"
        else
            check_warn "Only $PS_COUNT permission sets (recommend at least 3)"
        fi
    else
        check_warn "IAM Identity Center not accessible (may need management account)"
    fi
}

# ============================================
# Account-Specific Checks
# ============================================

check_account() {
    local account_name="$1"
    local account_id="$2"
    local profile="$3"

    echo ""
    echo "----------------------------------------------"
    echo "Account: $account_name ($account_id)"
    echo "----------------------------------------------"

    # Verify we can access the account
    log_check "Account access..."
    if CURRENT=$(aws sts get-caller-identity --profile "$profile" --query 'Account' --output text 2>/dev/null); then
        if [ "$CURRENT" = "$account_id" ]; then
            check_pass "Can access account via profile: $profile"
        else
            check_fail "Profile $profile points to different account: $CURRENT"
            return 1
        fi
    else
        check_fail "Cannot access account with profile: $profile"
        return 1
    fi

    # Check OIDC provider
    log_check "GitHub OIDC provider..."
    if aws iam get-open-id-connect-provider \
        --open-id-connect-provider-arn "arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com" \
        --profile "$profile" 2>/dev/null >/dev/null; then
        check_pass "OIDC provider configured"
    else
        check_fail "OIDC provider not found"
    fi

    # Check GitHub Actions role
    log_check "GitHub Actions role..."
    if aws iam get-role --role-name "github-actions-role" --profile "$profile" 2>/dev/null >/dev/null; then
        check_pass "github-actions-role exists"
    else
        check_fail "github-actions-role not found"
    fi

    # Check deployment role
    log_check "Deployment role..."
    if aws iam get-role --role-name "github-deploy-role" --profile "$profile" 2>/dev/null >/dev/null; then
        check_pass "github-deploy-role exists"
    else
        check_fail "github-deploy-role not found"
    fi

    # Check CDK bootstrap
    log_check "CDK bootstrap ($REGION)..."
    if STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name "CDKToolkit" \
        --profile "$profile" \
        --region "$REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null); then
        if [ "$STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$STACK_STATUS" = "UPDATE_COMPLETE" ]; then
            check_pass "CDK bootstrapped in $REGION"
        else
            check_warn "CDK bootstrap in unexpected state: $STACK_STATUS"
        fi
    else
        check_fail "CDK not bootstrapped in $REGION"
    fi

    # Check CDK bootstrap in us-east-1
    log_check "CDK bootstrap (us-east-1 for CloudFront)..."
    if STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name "CDKToolkit" \
        --profile "$profile" \
        --region "us-east-1" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null); then
        if [ "$STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$STACK_STATUS" = "UPDATE_COMPLETE" ]; then
            check_pass "CDK bootstrapped in us-east-1"
        else
            check_warn "CDK bootstrap us-east-1 in unexpected state: $STACK_STATUS"
        fi
    else
        check_warn "CDK not bootstrapped in us-east-1 (needed for CloudFront)"
    fi

    # Check backup role (for production and CI)
    log_check "Backup service role..."
    if aws iam get-role --role-name "AWSBackupDefaultServiceRole" --profile "$profile" 2>/dev/null >/dev/null; then
        check_pass "Backup service role exists"
    else
        check_warn "Backup service role not found (needed for backups)"
    fi
}

# ============================================
# Backup Account Checks
# ============================================

check_backup_account() {
    local account_id="$1"
    local profile="$2"

    echo ""
    echo "----------------------------------------------"
    echo "Backup Account: $account_id"
    echo "----------------------------------------------"

    # Verify access
    log_check "Backup account access..."
    if CURRENT=$(aws sts get-caller-identity --profile "$profile" --query 'Account' --output text 2>/dev/null); then
        check_pass "Can access backup account"
    else
        check_fail "Cannot access backup account"
        return 1
    fi

    # Check cross-account vault
    log_check "Cross-account backup vault..."
    if aws backup describe-backup-vault \
        --backup-vault-name "submit-cross-account-vault" \
        --profile "$profile" \
        --region "$REGION" 2>/dev/null >/dev/null; then
        check_pass "Cross-account vault exists"

        # Check vault policy
        log_check "Vault access policy..."
        if POLICY=$(aws backup get-backup-vault-access-policy \
            --backup-vault-name "submit-cross-account-vault" \
            --profile "$profile" \
            --region "$REGION" \
            --query 'Policy' \
            --output text 2>/dev/null); then
            check_pass "Vault policy configured"
        else
            check_warn "Vault policy not set"
        fi
    else
        check_fail "Cross-account vault not found"
    fi
}

# ============================================
# Configuration File Checks
# ============================================

check_config_files() {
    echo ""
    echo "=============================================="
    echo "3. Configuration Files"
    echo "=============================================="

    log_check "Organization config..."
    if [ -f "$PROJECT_DIR/target/migration/org-config.json" ]; then
        check_pass "org-config.json exists"
    else
        check_warn "org-config.json not found (run bootstrap-organization.sh)"
    fi

    log_check "Production roles config..."
    if [ -f "$PROJECT_DIR/target/migration/submit-prod-roles.json" ]; then
        check_pass "submit-prod-roles.json exists"
    else
        check_warn "submit-prod-roles.json not found (run setup-oidc-roles.sh)"
    fi

    log_check "CI roles config..."
    if [ -f "$PROJECT_DIR/target/migration/submit-ci-roles.json" ]; then
        check_pass "submit-ci-roles.json exists"
    else
        check_warn "submit-ci-roles.json not found (run setup-oidc-roles.sh)"
    fi

    log_check "Backup config..."
    if [ -f "$PROJECT_DIR/target/migration/backup-config.json" ]; then
        check_pass "backup-config.json exists"
    else
        check_warn "backup-config.json not found (run setup-backup-roles.sh)"
    fi
}

# ============================================
# Main
# ============================================

echo "=============================================="
echo "AWS Multi-Account Setup Verification"
echo "=============================================="
echo ""
echo "Region: $REGION"
echo "Time: $(date)"

# Run organization checks (requires management account access)
check_organization 2>/dev/null || log_warn "Skipping organization checks (need management account)"

# Check IAM Identity Center
check_identity_center 2>/dev/null || log_warn "Skipping Identity Center checks"

# Check each account if accessible
echo ""
echo "=============================================="
echo "4. Account-Specific Checks"
echo "=============================================="

# Production account
PROD_PROFILE="${PROD_PROFILE:-submit-prod-admin}"
check_account "submit-prod" "887764105431" "$PROD_PROFILE" 2>/dev/null || \
    log_warn "Could not check production account (profile: $PROD_PROFILE)"

# CI account - get ID from config if available
CI_CONFIG="$PROJECT_DIR/target/migration/submit-ci-roles.json"
if [ -f "$CI_CONFIG" ]; then
    CI_ACCOUNT=$(jq -r '.accountId' "$CI_CONFIG")
    CI_PROFILE="${CI_PROFILE:-submit-ci-admin}"
    check_account "submit-ci" "$CI_ACCOUNT" "$CI_PROFILE" 2>/dev/null || \
        log_warn "Could not check CI account (profile: $CI_PROFILE)"
else
    log_warn "CI account not configured yet"
fi

# Backup account - get ID from config if available
BACKUP_CONFIG="$PROJECT_DIR/target/migration/backup-config.json"
if [ -f "$BACKUP_CONFIG" ]; then
    BACKUP_ACCOUNT=$(jq -r '.backupAccountId' "$BACKUP_CONFIG")
    BACKUP_PROFILE="${BACKUP_PROFILE:-submit-backup-admin}"
    check_backup_account "$BACKUP_ACCOUNT" "$BACKUP_PROFILE" 2>/dev/null || \
        log_warn "Could not check backup account (profile: $BACKUP_PROFILE)"
else
    log_warn "Backup account not configured yet"
fi

# Check config files
check_config_files

# Summary
echo ""
echo "=============================================="
echo "Summary"
echo "=============================================="
echo ""
echo -e "${GREEN}Passed:${NC}   $PASSED"
echo -e "${RED}Failed:${NC}   $FAILED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All critical checks passed!${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Review warnings above for optional improvements.${NC}"
    fi
    exit 0
else
    echo -e "${RED}Some checks failed. Review output above.${NC}"
    exit 1
fi
