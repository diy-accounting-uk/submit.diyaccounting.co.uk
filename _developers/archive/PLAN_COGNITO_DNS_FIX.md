<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Cognito DNS Hostname Fix (Option 3 - Clean Architecture)

## Executive Summary

The Cognito authentication flow for **prod** is broken because the `prod-auth.submit.diyaccounting.co.uk` DNS record does not exist. The CI environment works correctly (`ci-auth.submit...` exists). The prod IdentityStack needs to be deployed/redeployed to create the missing DNS records.

---

## Current DNS State (from Route53 Zone File)

| Domain | Record Type | Points To | Status |
|--------|-------------|-----------|--------|
| `ci-auth.submit.diyaccounting.co.uk` | A/AAAA | `d8zoqn6hrymt7.cloudfront.net` | Working |
| `prod-auth.submit.diyaccounting.co.uk` | - | - | **MISSING** |
| `auth.submit.diyaccounting.co.uk` | - | - | Never existed (only ACM validation CNAME) |

**Conclusion:** The prod IdentityStack was either never deployed after the October 2025 naming change, or the deployment failed to create the Cognito domain.

---

## Root Cause Analysis

### When the Bug Was Introduced

**Commit:** `9f2487f5` ("Restfinal #241")
**Date:** October 29, 2025

### What Changed

The cognitoDomainName formula in `SubmitSharedNames.java:297` was changed:

```java
// OLD - special case for prod (no env prefix)
// prod → auth.submit.diyaccounting.co.uk
// ci   → ci.auth.submit.diyaccounting.co.uk

// NEW - consistent pattern (always uses env prefix)
"%s-auth.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName)
// prod → prod-auth.submit.diyaccounting.co.uk
// ci   → ci-auth.submit.diyaccounting.co.uk
```

### Why Prod is Broken

1. CI IdentityStack was deployed after the change → `ci-auth.submit...` records exist and work
2. Prod IdentityStack was either:
   - Never redeployed after the change
   - Has the old UserPoolDomain that can't be updated (Cognito domains are immutable)
   - Failed to create Route53 records

---

## Solution: Deploy/Redeploy Prod IdentityStack

### Option A: If Prod IdentityStack Exists with Old Domain

Cognito UserPoolDomain custom domains are immutable. You need to:

1. **Tear down prod IdentityStack**
2. **Redeploy prod IdentityStack** - Creates new domain `prod-auth.submit.diyaccounting.co.uk`

### Option B: If Prod IdentityStack Doesn't Exist or Has No UserPoolDomain

Simply deploy the IdentityStack - it will create everything correctly.

---

## Implementation

### Step 1: Add Certificate Verification Job

Add a `verify-certificate` job to ensure the ACM certificate covers `prod-auth.submit.diyaccounting.co.uk` before attempting deployment.

**File:** `.github/workflows/deploy-environment.yml`

Add this job before `deploy-identity`:

```yaml
  verify-certificate:
    name: 'verify certificate'
    needs:
      - names
      - create-secrets
    runs-on: ubuntu-24.04
    environment: ${{ github.ref == 'refs/heads/main' && 'prod' || 'ci' }}
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Configure AWS role via GitHub OIDC
        uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: ${{ env.ACTIONS_ROLE_ARN }}
          aws-region: us-east-1
          role-chaining: false
          audience: sts.amazonaws.com
          role-skip-session-tagging: true
          output-credentials: true
          retry-max-attempts: 3

      - name: Assume AWS deployment role
        uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: ${{ env.DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
          role-chaining: true
          audience: sts.amazonaws.com
          role-skip-session-tagging: true
          output-credentials: true
          retry-max-attempts: 3

      - name: Verify certificate covers Cognito domain
        run: |
          CERT_ARN="arn:aws:acm:us-east-1:887764105431:certificate/d340de40-96ca-4f5b-ae4c-f66a776e5a75"
          COGNITO_DOMAIN="${{ needs.names.outputs.environment-name }}-auth.submit.diyaccounting.co.uk"

          echo "Verifying certificate $CERT_ARN covers $COGNITO_DOMAIN"

          SANS=$(aws acm describe-certificate \
            --certificate-arn "$CERT_ARN" \
            --query 'Certificate.SubjectAlternativeNames' \
            --output text)

          echo "Certificate SANs: $SANS"

          # Check for exact match or wildcard coverage
          if echo "$SANS" | grep -qE "(^|[[:space:]])(\*\.submit\.diyaccounting\.co\.uk|${COGNITO_DOMAIN})($|[[:space:]])"; then
            echo "Certificate covers $COGNITO_DOMAIN"
          else
            echo "ERROR: Certificate does NOT cover $COGNITO_DOMAIN"
            echo "The certificate needs to include either:"
            echo "  - *.submit.diyaccounting.co.uk (wildcard)"
            echo "  - $COGNITO_DOMAIN (explicit)"
            exit 1
          fi
```

### Step 2: Update deploy-identity Dependencies

Modify `deploy-identity` to depend on `verify-certificate`:

```yaml
  deploy-identity:
    name: 'deploy identity'
    needs:
      - names
      - create-secrets
      - deploy-apex
      - verify-certificate  # ADD THIS
    # ... rest unchanged
```

---

## Files to Modify

| File | Change |
|------|--------|
| `.github/workflows/deploy-environment.yml` | Add `verify-certificate` job |
| `.github/workflows/deploy-environment.yml` | Update `deploy-identity` dependencies |
| `scripts/create-submit-intermediate-domains.sh` | Delete (never needed - Route53AliasUpsert handles DNS) |

---

## Execution Order

### For Full Teardown (If Prod IdentityStack Exists)

1. **Check if IdentityStack exists and has a UserPoolDomain:**
   ```bash
   aws cloudformation describe-stacks --stack-name prod-env-IdentityStack --region eu-west-2
   ```

2. **If it exists, tear it down:**
   ```bash
   aws cloudformation delete-stack --stack-name prod-env-IdentityStack --region eu-west-2
   aws cloudformation wait stack-delete-complete --stack-name prod-env-IdentityStack --region eu-west-2
   ```

3. **Trigger deploy-environment.yml** on main branch (or manual dispatch with `environment-name: prod`)

4. The workflow will:
   - Verify certificate coverage
   - Deploy fresh IdentityStack with new domain (`prod-auth.submit.diyaccounting.co.uk`)
   - Create Route53 A/AAAA alias records pointing to Cognito's CloudFront

### For Fresh Deploy (If No IdentityStack Exists)

Simply trigger `deploy-environment.yml` - it will create everything correctly.

---

## No CDK Code Changes Required

The current CDK code is already correct:

**`SubmitSharedNames.java:297`:**
```java
this.cognitoDomainName = "%s-auth.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
// prod → prod-auth.submit.diyaccounting.co.uk
// ci   → ci-auth.submit.diyaccounting.co.uk
```

**`IdentityStack.java:251-256`:**
```java
Route53AliasUpsert.upsertAliasToCloudFront(
    this,
    props.resourceNamePrefix() + "-UserPoolDomainAlias",
    hostedZone,
    props.sharedNames().cognitoDomainName,  // prod-auth.submit.diyaccounting.co.uk
    this.userPoolDomain.getCloudFrontEndpoint());
```

This creates A/AAAA alias records automatically - no manual DNS setup needed.

---

## Certificate Note

The ACM validation CNAME `_3b16987868d92703f70c5032464a8c47.auth.submit.diyaccounting.co.uk` indicates `auth.submit.diyaccounting.co.uk` is in the certificate. However, since `ci-auth.submit.diyaccounting.co.uk` works, the certificate likely includes either:
- `*.submit.diyaccounting.co.uk` (wildcard covering all subdomains)
- Or explicit entries for `ci-auth.submit...` and `prod-auth.submit...`

The `verify-certificate` job will confirm this before deployment.

---

## Verification After Fix

1. **DNS resolution:**
   ```bash
   dig prod-auth.submit.diyaccounting.co.uk
   # Should return A/AAAA records pointing to CloudFront (like ci-auth does)
   ```

2. **HTTPS connectivity:**
   ```bash
   curl -I https://prod-auth.submit.diyaccounting.co.uk/
   # Should return 400 (Cognito expects OAuth params)
   ```

3. **End-to-end test:**
   - Visit `https://submit.diyaccounting.co.uk/auth/login.html`
   - Click "Login with Google"
   - Should redirect to Cognito hosted UI at `prod-auth.submit.diyaccounting.co.uk`
   - After Google auth, should redirect back to app

---

## Questions Answered

1. **What needs to be done (shortest path)?**
   - Add `verify-certificate` job to deploy-environment.yml
   - Tear down prod IdentityStack (if it exists with old domain)
   - Run deploy-environment.yml to create fresh IdentityStack
   - No CDK code changes needed

2. **When was this bug introduced?**
   - Commit `9f2487f5` on October 29, 2025 changed the domain formula
   - Prod IdentityStack was never successfully redeployed with the new domain

3. **Better way with full teardown?**
   - Yes - the current code is correct and consistent
   - CI already works with `ci-auth.submit...`
   - Just need to teardown/redeploy prod to match
   - Delete the unused `scripts/create-submit-intermediate-domains.sh`
