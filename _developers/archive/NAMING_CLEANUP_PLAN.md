<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Naming Cleanup Plan

## Overview

This document outlines a comprehensive cleanup of resource naming to achieve consistency across the codebase. The goal is to minimize domain-derived names and use simple `ci-`/`prod-` prefixes consistently.

**Status:** Ready for implementation (can tear down all stacks and delete data)

---

## Current Naming Flow

### GitHub Actions (get-names action)

**File:** `.github/actions/get-names/action.yml`

| Variable | CI (branch `testabc`) | Prod (main) |
|----------|----------------------|-------------|
| `ENVIRONMENT_NAME` | `ci` | `prod` |
| `DEPLOYMENT_NAME` | `ci-testabc` | `prod-ea373de` |
| `DIY_SUBMIT_BASE_DOMAIN` | `ci-testabc.submit.diyaccounting.co.uk` | `prod-ea373de.submit.diyaccounting.co.uk` |
| `DIY_SUBMIT_APEX_DOMAIN` | `ci.submit.diyaccounting.co.uk` | `submit.diyaccounting.co.uk` |

### SubmitSharedNames.java Props

**File:** `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`

| Prop | CI Example | Prod Example |
|------|------------|--------------|
| `hostedZoneName` | `diyaccounting.co.uk` | `diyaccounting.co.uk` |
| `envName` | `ci` | `prod` |
| `subDomainName` | `submit` | `submit` |
| `deploymentName` | `ci-testabc` | `prod-ea373de` |
| `regionName` | `eu-west-2` | `eu-west-2` |
| `awsAccount` | `887764105431` | `887764105431` |

### Helper Function: generateResourceNamePrefix

**File:** `infra/main/java/co/uk/diyaccounting/submit/utils/ResourceNameUtils.java` (lines 38-40)

```java
public static String generateResourceNamePrefix(String domainName) {
    return domainName.replace(".diyaccounting.co.uk", "").replace(".", "-");
}
```

For domain `ci-testabc.submit.diyaccounting.co.uk`:
1. Remove `.diyaccounting.co.uk` → `ci-testabc.submit`
2. Replace `.` with `-` → `ci-testabc-submit`

### Current Derived Names

| Field | Source | CI Example | Issue |
|-------|--------|------------|-------|
| `envResourceNamePrefix` | `props.envName + "-env"` (line 313) | `ci-env` | ✅ Already fixed |
| `envDashedDomainName` | `buildDashedDomainName(envDomainName)` (line 311) | `ci-submit-diyaccounting-co-uk` | ❌ Used for tables |
| `appResourceNamePrefix` | `generateResourceNamePrefix(deploymentDomainName) + "-app"` (line 347) | `ci-testabc-submit-app` | ❌ Includes "submit" |

---

## Changes Required

### 1. SubmitSharedNames.java - appResourceNamePrefix

**File:** `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`
**Line:** 347

```java
// CURRENT:
this.appResourceNamePrefix = "%s-app".formatted(generateResourceNamePrefix(this.deploymentDomainName));

// CHANGE TO:
this.appResourceNamePrefix = "%s-app".formatted(props.deploymentName);
```

**Effect:**
- Old: `ci-testabc-submit-app`
- New: `ci-testabc-app`

**Downstream impact (all automatically fixed by this change):**
| Resource | Old Name | New Name |
|----------|----------|----------|
| ECR repository (line 358) | `ci-testabc-submit-app-ecr` | `ci-testabc-app-ecr` |
| ECR us-east-1 (line 363) | `ci-testabc-submit-app-ecr-us-east-1` | `ci-testabc-app-ecr-us-east-1` |
| ECR log group (line 359) | `/aws/ecr/ci-testabc-submit-app` | `/aws/ecr/ci-testabc-app` |
| ECR publish role (line 360) | `ci-testabc-submit-app-ecr-publish-role` | `ci-testabc-app-ecr-publish-role` |
| Origin bucket (line 374) | `ci-testabc-submit-app-origin-us-east-1` | `ci-testabc-app-origin-us-east-1` |
| Origin access log bucket (line 375) | `ci-testabc-submit-app-origin-access-logs` | `ci-testabc-app-origin-access-logs` |
| All Lambda functions (lines 389, 408, 423, 515, 554, 576, 616, 663, 705, 736, 754) | `ci-testabc-submit-app-*` | `ci-testabc-app-*` |
| Lambda ARNs (line 379) | `arn:aws:lambda:...:ci-testabc-submit-app` | `arn:aws:lambda:...:ci-testabc-app` |

---

### 2. SubmitSharedNames.java - DynamoDB table names

**File:** `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`
**Lines:** 322-332

```java
// CURRENT:
this.receiptsTableName = "%s-receipts".formatted(this.envDashedDomainName);
this.bundlesTableName = "%s-bundles".formatted(this.envDashedDomainName);
this.bundlePostAsyncRequestsTableName = "%s-bundle-post-async-requests".formatted(this.envDashedDomainName);
this.bundleDeleteAsyncRequestsTableName = "%s-bundle-delete-async-requests".formatted(this.envDashedDomainName);
this.hmrcVatReturnPostAsyncRequestsTableName =
        "%s-hmrc-vat-return-post-async-requests".formatted(this.envDashedDomainName);
this.hmrcVatReturnGetAsyncRequestsTableName =
        "%s-hmrc-vat-return-get-async-requests".formatted(this.envDashedDomainName);
this.hmrcVatObligationGetAsyncRequestsTableName =
        "%s-hmrc-vat-obligation-get-async-requests".formatted(this.envDashedDomainName);
this.hmrcApiRequestsTableName = "%s-hmrc-api-requests".formatted(this.envDashedDomainName);

// CHANGE TO:
this.receiptsTableName = "%s-receipts".formatted(this.envResourceNamePrefix);
this.bundlesTableName = "%s-bundles".formatted(this.envResourceNamePrefix);
this.bundlePostAsyncRequestsTableName = "%s-bundle-post-async-requests".formatted(this.envResourceNamePrefix);
this.bundleDeleteAsyncRequestsTableName = "%s-bundle-delete-async-requests".formatted(this.envResourceNamePrefix);
this.hmrcVatReturnPostAsyncRequestsTableName =
        "%s-hmrc-vat-return-post-async-requests".formatted(this.envResourceNamePrefix);
this.hmrcVatReturnGetAsyncRequestsTableName =
        "%s-hmrc-vat-return-get-async-requests".formatted(this.envResourceNamePrefix);
this.hmrcVatObligationGetAsyncRequestsTableName =
        "%s-hmrc-vat-obligation-get-async-requests".formatted(this.envResourceNamePrefix);
this.hmrcApiRequestsTableName = "%s-hmrc-api-requests".formatted(this.envResourceNamePrefix);
```

**Effect:**
| Table | Old Name | New Name |
|-------|----------|----------|
| receipts | `ci-submit-diyaccounting-co-uk-receipts` | `ci-env-receipts` |
| bundles | `ci-submit-diyaccounting-co-uk-bundles` | `ci-env-bundles` |
| bundle-post-async-requests | `ci-submit-diyaccounting-co-uk-bundle-post-async-requests` | `ci-env-bundle-post-async-requests` |
| bundle-delete-async-requests | `ci-submit-diyaccounting-co-uk-bundle-delete-async-requests` | `ci-env-bundle-delete-async-requests` |
| hmrc-vat-return-post-async-requests | `ci-submit-diyaccounting-co-uk-hmrc-vat-return-post-async-requests` | `ci-env-hmrc-vat-return-post-async-requests` |
| hmrc-vat-return-get-async-requests | `ci-submit-diyaccounting-co-uk-hmrc-vat-return-get-async-requests` | `ci-env-hmrc-vat-return-get-async-requests` |
| hmrc-vat-obligation-get-async-requests | `ci-submit-diyaccounting-co-uk-hmrc-vat-obligation-get-async-requests` | `ci-env-hmrc-vat-obligation-get-async-requests` |
| hmrc-api-requests | `ci-submit-diyaccounting-co-uk-hmrc-api-requests` | `ci-env-hmrc-api-requests` |

---

### 3. SubmitSharedNames.java - Distribution log names

**File:** `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`
**Lines:** 333-338

```java
// CURRENT:
this.distributionAccessLogGroupName = "distribution-%s-logs".formatted(this.envDashedDomainName);
this.distributionAccessLogDeliveryHoldingSourceName =
        "%s-holding-dist-logs-src".formatted(this.envDashedDomainName);
this.distributionAccessLogDeliveryHoldingDestinationName =
        "%s-holding-logs-dest".formatted(this.envDashedDomainName);

// CHANGE TO:
this.distributionAccessLogGroupName = "distribution-%s-logs".formatted(this.envResourceNamePrefix);
this.distributionAccessLogDeliveryHoldingSourceName =
        "%s-holding-dist-logs-src".formatted(this.envResourceNamePrefix);
this.distributionAccessLogDeliveryHoldingDestinationName =
        "%s-holding-logs-dest".formatted(this.envResourceNamePrefix);
```

**Note:** Lines 336 and 339 already use `props.deploymentName` directly (marked with `// x` comment) - these are correct and don't need changes:
```java
this.distributionAccessLogDeliveryOriginSourceName = "%s-orig-dist-l-src".formatted(props.deploymentName);
this.distributionAccessLogDeliveryOriginDestinationName = "%s-orig-l-dst".formatted(props.deploymentName);
```

**Effect:**
| Resource | Old Name | New Name |
|----------|----------|----------|
| Log group | `distribution-ci-submit-diyaccounting-co-uk-logs` | `distribution-ci-env-logs` |
| Holding source | `ci-submit-diyaccounting-co-uk-holding-dist-logs-src` | `ci-env-holding-dist-logs-src` |
| Holding dest | `ci-submit-diyaccounting-co-uk-holding-logs-dest` | `ci-env-holding-logs-dest` |

---

### 4. deploy.yml - ECR repository references

**File:** `.github/workflows/deploy.yml`

**eu-west-2 ECR (lines 730, 746, 784):**
```yaml
# CURRENT:
ECR_REPOSITORY_NAME: ${{ needs.names.outputs.deployment-name }}-submit-app-ecr

# CHANGE TO:
ECR_REPOSITORY_NAME: ${{ needs.names.outputs.deployment-name }}-app-ecr
```

**us-east-1 ECR (lines 831, 847, 885):**
```yaml
# CURRENT:
ECR_REPOSITORY_NAME: ${{ needs.names.outputs.deployment-name }}-submit-app-ecr-us-east-1

# CHANGE TO:
ECR_REPOSITORY_NAME: ${{ needs.names.outputs.deployment-name }}-app-ecr-us-east-1
```

---

### 5. synthetic-test.yml - DynamoDB export script call

**File:** `.github/workflows/synthetic-test.yml`
**Line:** 301

```yaml
# CURRENT:
scripts/export-test-dynamodb.sh ${{ needs.names.outputs.environment-name == 'prod' && 'submit-diyaccounting-co-uk' || format('{0}-submit-diyaccounting-co-uk', needs.names.outputs.environment-name) }}

# CHANGE TO:
scripts/export-test-dynamodb.sh ${{ needs.names.outputs.environment-name == 'prod' && 'prod-env' || format('{0}-env', needs.names.outputs.environment-name) }}
```

**Note:** The script `scripts/export-dynamodb-for-test-users.js` (line 129) constructs table names using `${deploymentName}-bundles` etc., so changing the argument fixes the table name lookup.

---

### 6. verify-backups.yml - Table prefix

**File:** `.github/workflows/verify-backups.yml`
**Lines:** 84-88

```yaml
# CURRENT:
if [ "$ENV_NAME" = "prod" ]; then
  echo "ENV_PREFIX=submit-diyaccounting-co-uk" >> $GITHUB_ENV
else
  echo "ENV_PREFIX=$ENV_NAME-submit-diyaccounting-co-uk" >> $GITHUB_ENV
fi

# CHANGE TO:
if [ "$ENV_NAME" = "prod" ]; then
  echo "ENV_PREFIX=prod-env" >> $GITHUB_ENV
else
  echo "ENV_PREFIX=$ENV_NAME-env" >> $GITHUB_ENV
fi
```

---

### 7. Documentation updates

**Files to update:**

| File | Line | Change |
|------|------|--------|
| `.github/copilot-instructions.md` | 251 | Update example: `ci-submit-bundles` → `ci-env-bundles` |
| `AWS_ACCOUNTS_OVERVIEW.md` | 109 | Update example table names |
| `_developers/aws-multi-account/MIGRATION_RUNBOOK.md` | 117 | Update table name example |
| `_developers/SETUP.md` | 671-681 | Update S3 bucket and log group names |

---

## Unchanged (Correct As-Is)

### Legitimate Domain Name Usage

These fields correctly use domain names because they're for DNS/URLs:

| Field | Line | Value | Purpose |
|-------|------|-------|---------|
| `envDomainName` | 295-297 | `ci.submit.diyaccounting.co.uk` | DNS apex for environment |
| `deploymentDomainName` | 300-304 | `ci-testabc.submit.diyaccounting.co.uk` | DNS for specific deployment |
| `cognitoDomainName` | 298 | `ci-auth.submit.diyaccounting.co.uk` | Cognito custom domain |
| `holdingDomainName` | 299 | `ci-holding.submit.diyaccounting.co.uk` | Holding page domain |
| `baseUrl` | 307 | `https://ci-testabc.submit.diyaccounting.co.uk/` | OAuth callbacks |
| `envBaseUrl` | 310 | `https://submit.diyaccounting.co.uk/` | Environment base URL |
| `cognitoBaseUri` | 320 | `https://ci-auth.submit.diyaccounting.co.uk` | Cognito OAuth URI |
| `dashedDeploymentDomainName` | 308 | `ci-testabc-submit-diyaccounting-co-uk` | Used for internal tracking only |

### Already Consistent Naming

| Resource Type | Pattern | Example |
|--------------|---------|---------|
| Environment stack IDs | `${envName}-env-*Stack` | `ci-env-ObservabilityStack` |
| Application stack IDs | `${deploymentName}-app-*Stack` | `ci-testabc-app-DevStack` |
| Secrets Manager paths | `${envName}/submit/*` | `ci/submit/google/client_secret` |
| SSM Parameter paths | `/submit/${envName}/*` | `/submit/ci/last-known-good-deployment` |
| Holding bucket | `${envResourceNamePrefix}-holding-*` | `ci-env-holding-us-east-1` |
| Trail name | `${envResourceNamePrefix}-trail` | `ci-env-trail` |
| Self-destruct log groups | `/aws/lambda/${envResourceNamePrefix}-*` | `/aws/lambda/ci-env-self-destruct-eu-west-2` |
| API access log group | `/aws/apigw/${envResourceNamePrefix}/access` | `/aws/apigw/ci-env/access` |

---

## Result After All Changes

| Resource Type | Old Pattern | New Pattern |
|--------------|-------------|-------------|
| Env stack IDs | `ci-env-DataStack` | `ci-env-DataStack` (unchanged) |
| App stack IDs | `ci-testabc-app-DevStack` | `ci-testabc-app-DevStack` (unchanged) |
| DynamoDB tables | `ci-submit-diyaccounting-co-uk-receipts` | `ci-env-receipts` |
| Lambda functions | `ci-testabc-submit-app-cognito-token-post...` | `ci-testabc-app-cognito-token-post...` |
| ECR repository | `ci-testabc-submit-app-ecr` | `ci-testabc-app-ecr` |
| S3 origin bucket | `ci-testabc-submit-app-origin-us-east-1` | `ci-testabc-app-origin-us-east-1` |
| Distribution log group | `distribution-ci-submit-diyaccounting-co-uk-logs` | `distribution-ci-env-logs` |

---

## Implementation Checklist

### Pre-requisites
- [ ] Tear down all application stacks in ci environment
- [ ] Tear down all environment stacks in ci environment
- [ ] Tear down all application stacks in prod environment (if exists)
- [ ] Tear down all environment stacks in prod environment (if exists)

### Code Changes
- [ ] `SubmitSharedNames.java` line 347: Change `appResourceNamePrefix`
- [ ] `SubmitSharedNames.java` lines 322-332: Change DynamoDB table names
- [ ] `SubmitSharedNames.java` lines 333-338: Change distribution log names
- [ ] `deploy.yml` lines 730, 746, 784: Change ECR repository name (eu-west-2)
- [ ] `deploy.yml` lines 831, 847, 885: Change ECR repository name (us-east-1)
- [ ] `synthetic-test.yml` line 301: Change DynamoDB export script argument
- [ ] `verify-backups.yml` lines 84-88: Change table prefix

### Verification
- [ ] Run `./mvnw clean verify` to confirm compilation
- [ ] Deploy environment stacks
- [ ] Deploy application stacks
- [ ] Verify DynamoDB table names: `aws dynamodb list-tables`
- [ ] Verify ECR repository names: `aws ecr describe-repositories`
- [ ] Verify Lambda function names: `aws lambda list-functions`
- [ ] Run behaviour tests to confirm everything works

### Documentation Updates
- [ ] `.github/copilot-instructions.md`
- [ ] `AWS_ACCOUNTS_OVERVIEW.md`
- [ ] `_developers/aws-multi-account/MIGRATION_RUNBOOK.md`
- [ ] `_developers/SETUP.md`
- [ ] Delete this file after implementation complete

---

## Field Reference: envDashedDomainName

After these changes, `envDashedDomainName` (line 311) is no longer used for any resource names. It remains in the codebase but could potentially be removed if not needed elsewhere. Current usage after changes: **None for resource naming**.

The field is still computed at line 311:
```java
this.envDashedDomainName = buildDashedDomainName(this.envDomainName);
```

Consider removing this field in a follow-up cleanup if it's confirmed unused.

---

## Additional Notes

### LambdaNames.java

**File:** `infra/main/java/co/uk/diyaccounting/submit/LambdaNames.java`

The `LambdaNames` class receives `resourceNamePrefix` from `LambdaNameProps` (line 41):
```java
this.ingestLambdaFunctionName = "%s-%s".formatted(props.resourceNamePrefix(), ingestHandlerDashed);
```

This is passed from `SubmitSharedNames.java` line 446:
```java
.resourceNamePrefix(this.appResourceNamePrefix)
```

So changing `appResourceNamePrefix` automatically fixes all Lambda function names created via `LambdaNames`.

### SubmitApplication.java

**File:** `infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java`

Uses `sharedNames.appResourceNamePrefix` in 10 places (lines 172, 189, 206, 228, 256, 284, 307, 329, 351, 372) to pass to stack props. All will automatically use the new prefix after the change.

### Documentation File Notes

The documentation files contain slightly outdated examples:
- `.github/copilot-instructions.md` line 251 shows `ci-submit-bundles` but actual current name is `ci-submit-diyaccounting-co-uk-bundles`
- `_developers/SETUP.md` lines 671-681 reference a `dev` environment that may not exist anymore

After the change, update these to use the new consistent pattern (`ci-env-bundles`, etc.).
