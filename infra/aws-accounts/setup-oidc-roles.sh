#!/bin/bash
#
# Setup GitHub OIDC Roles
#
# Creates OIDC identity provider and GitHub Actions roles for deployments.
#
# Usage: ./setup-oidc-roles.sh <environment-name> <account-id>
#
# Examples:
#   ./setup-oidc-roles.sh submit-ci 123456789012
#   ./setup-oidc-roles.sh submit-prod 887764105431

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
ENV_NAME="${1:-}"
ACCOUNT_ID="${2:-}"
PROFILE="${AWS_PROFILE:-default}"
REGION="${AWS_REGION:-eu-west-2}"

# GitHub configuration - update these for your repository
GITHUB_ORG="${GITHUB_ORG:-diy-accounting-uk}"
GITHUB_REPO="${GITHUB_REPO:-submit.diyaccounting.co.uk}"
# Repositories allowed to assume the actions role. The root repo is always included:
# its deploy workflow reads CloudFormation outputs from every service account.
GITHUB_REPOS="${GITHUB_REPOS:-$GITHUB_REPO,root.diyaccounting.co.uk}"

if [ -z "$ENV_NAME" ] || [ -z "$ACCOUNT_ID" ]; then
    log_error "Usage: $0 <environment-name> <account-id>"
    log_error "Example: $0 submit-ci 123456789012"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRUST_POLICIES_DIR="$SCRIPT_DIR/trust-policies"

log_info "Setting up OIDC roles for $ENV_NAME (Account: $ACCOUNT_ID)"
log_info "GitHub repository: $GITHUB_ORG/$GITHUB_REPO"
log_info "Using profile: $PROFILE"

# Check we're operating on the correct account
CURRENT_ACCOUNT=$(aws sts get-caller-identity --profile "$PROFILE" --query 'Account' --output text)
if [ "$CURRENT_ACCOUNT" != "$ACCOUNT_ID" ]; then
    log_warn "Current profile account ($CURRENT_ACCOUNT) differs from target ($ACCOUNT_ID)"
    log_warn "Make sure you're using the correct AWS profile"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# GitHub OIDC thumbprint (as of 2023, GitHub uses intermediate certificates)
# This is the certificate thumbprint for token.actions.githubusercontent.com
GITHUB_OIDC_THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"

# Step 1: Create OIDC Provider
log_info "Creating OIDC identity provider..."

OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

# Check if provider already exists
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_PROVIDER_ARN" --profile "$PROFILE" 2>/dev/null; then
    log_info "OIDC provider already exists"
else
    log_info "Creating new OIDC provider..."
    aws iam create-open-id-connect-provider \
        --url "https://token.actions.githubusercontent.com" \
        --client-id-list "sts.amazonaws.com" \
        --thumbprint-list "$GITHUB_OIDC_THUMBPRINT" \
        --profile "$PROFILE"
    log_info "OIDC provider created"
fi

# Step 2: Create GitHub Actions Role
log_info "Creating GitHub Actions role..."

ACTIONS_ROLE_NAME="github-actions-role"
ACTIONS_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ACTIONS_ROLE_NAME}"

# Generate trust policy
# Render the sub list as a JSON array so several repositories can assume the role
GITHUB_REPO_SUBS=$(printf '%s\n' "$GITHUB_REPOS" | tr ',' '\n' | while IFS= read -r r; do
    [ -n "$r" ] && printf '"repo:%s/%s:*",' "$GITHUB_ORG" "$r"
done | sed 's/,$//')
GITHUB_REPO_SUBS="[$GITHUB_REPO_SUBS]"

ACTIONS_TRUST_POLICY=$(cat "$TRUST_POLICIES_DIR/github-actions-trust.json" | \
    sed "s|\${ACCOUNT_ID}|$ACCOUNT_ID|g" | \
    sed "s|\${GITHUB_REPO_SUBS}|$GITHUB_REPO_SUBS|g")

# Check if role exists
if aws iam get-role --role-name "$ACTIONS_ROLE_NAME" --profile "$PROFILE" 2>/dev/null; then
    log_info "Updating existing GitHub Actions role trust policy..."
    aws iam update-assume-role-policy \
        --role-name "$ACTIONS_ROLE_NAME" \
        --policy-document "$ACTIONS_TRUST_POLICY" \
        --profile "$PROFILE"
else
    log_info "Creating new GitHub Actions role..."
    aws iam create-role \
        --role-name "$ACTIONS_ROLE_NAME" \
        --assume-role-policy-document "$ACTIONS_TRUST_POLICY" \
        --description "Role assumed by GitHub Actions via OIDC" \
        --profile "$PROFILE"
fi

# Attach policies to actions role
log_info "Attaching policies to GitHub Actions role..."

# Policy to allow assuming the deployment role
ASSUME_DEPLOY_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::${ACCOUNT_ID}:role/github-deploy-role"
    }
  ]
}
EOF
)

aws iam put-role-policy \
    --role-name "$ACTIONS_ROLE_NAME" \
    --policy-name "AssumeDeployRole" \
    --policy-document "$ASSUME_DEPLOY_POLICY" \
    --profile "$PROFILE"

log_info "GitHub Actions role configured"

# Step 3: Create Deployment Role
log_info "Creating deployment role..."

DEPLOY_ROLE_NAME="github-deploy-role"
DEPLOY_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${DEPLOY_ROLE_NAME}"

# Generate trust policy
DEPLOY_TRUST_POLICY=$(cat "$TRUST_POLICIES_DIR/deployment-trust.json" | \
    sed "s/\${ACCOUNT_ID}/$ACCOUNT_ID/g")

# Check if role exists
if aws iam get-role --role-name "$DEPLOY_ROLE_NAME" --profile "$PROFILE" 2>/dev/null; then
    log_info "Updating existing deployment role trust policy..."
    aws iam update-assume-role-policy \
        --role-name "$DEPLOY_ROLE_NAME" \
        --policy-document "$DEPLOY_TRUST_POLICY" \
        --profile "$PROFILE"
else
    log_info "Creating new deployment role..."
    aws iam create-role \
        --role-name "$DEPLOY_ROLE_NAME" \
        --assume-role-policy-document "$DEPLOY_TRUST_POLICY" \
        --description "Role used by CDK for deployments" \
        --profile "$PROFILE"
fi

# Attach admin policy (required for CDK deployments)
log_info "Attaching AdministratorAccess to deployment role..."
aws iam attach-role-policy \
    --role-name "$DEPLOY_ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess" \
    --profile "$PROFILE" 2>/dev/null || log_info "Policy already attached"

log_info "Deployment role configured"

# Save role ARNs
OUTPUT_FILE="$SCRIPT_DIR/../../target/migration/${ENV_NAME}-roles.json"
mkdir -p "$(dirname "$OUTPUT_FILE")"
cat > "$OUTPUT_FILE" << EOF
{
  "environment": "$ENV_NAME",
  "accountId": "$ACCOUNT_ID",
  "oidcProviderArn": "$OIDC_PROVIDER_ARN",
  "actionsRoleArn": "$ACTIONS_ROLE_ARN",
  "deployRoleArn": "$DEPLOY_ROLE_ARN",
  "githubRepo": "$GITHUB_ORG/$GITHUB_REPO",
  "createdAt": "$(date -Iseconds)"
}
EOF

log_info "Role information saved to: $OUTPUT_FILE"

echo ""
echo "=============================================="
echo "OIDC Roles Setup Complete!"
echo "=============================================="
echo ""
echo "Environment: $ENV_NAME"
echo "Account ID: $ACCOUNT_ID"
echo ""
echo "Roles created:"
echo "  OIDC Provider: $OIDC_PROVIDER_ARN"
echo "  Actions Role:  $ACTIONS_ROLE_ARN"
echo "  Deploy Role:   $DEPLOY_ROLE_ARN"
echo ""
echo "GitHub Secrets to configure:"
echo "  AWS_${ENV_NAME^^}_ACCOUNT_ID: $ACCOUNT_ID"
echo "  AWS_${ENV_NAME^^}_ACTIONS_ROLE_ARN: $ACTIONS_ROLE_ARN"
echo ""
echo "Next steps:"
echo "  1. Add the secrets above to GitHub repository settings"
echo "  2. Run: ./bootstrap-cdk.sh $ACCOUNT_ID"
echo "  3. Test deployment with a feature branch push"
echo ""
