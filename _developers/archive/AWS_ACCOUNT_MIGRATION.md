<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# AWS Account & Repository Migration

**Version**: 1.0 | **Date**: February 2026 | **Status**: Complete (Phase 1 & 2)

This document is a historical record of the account separation and repository separation work completed in January-February 2026. Phase 3 (cross-account backups) is tracked in `AWS_CROSS_ACCOUNT_BACKUPS.md`.

---

## 1. Overview

### Why this migration was done

All AWS workloads (submit app, gateway site, spreadsheets site, DNS) originally lived in a single AWS account (887764105431) and were deployed from a single GitHub repository (`antonycc/submit.diyaccounting.co.uk`). The migration separated each service into its own AWS account, then extracted each service's code into its own GitHub repository.

**What was achieved**: Six AWS accounts, each with a clearly defined purpose, deployed from four independent GitHub repositories. The original account (887764105431) was cleaned to a management-only role: AWS Organizations, IAM Identity Center, Route53 DNS zone, and consolidated billing. No application workloads remain there.

**Why**: Blast radius reduction (a misconfiguration in one service cannot affect another), billing clarity (per-service cost visibility), IaC repeatability (submit-prod was deployed from scratch to a new account, proving disaster recovery), independent release cadences (each service deploys without coordination), and security isolation (least-privilege per account).

### Design principles

These assertions governed all decisions:

1. **Accounts before repos** -- account separation happens first, while all code remains in a single repository. It is much easier to search-and-replace globally and synchronise changes in one repository and one commit.
2. **No oidc.antonycc.com** -- references to oidc.antonycc.com have been removed. Each AWS account gets its own OIDC provider trusting GitHub's `token.actions.githubusercontent.com`, scoped to the deploying repository.
3. **Migration order**: gateway+spreadsheets accounts first (CI then prod), then submit CI to its own account, then submit prod to a NEW account (proving IaC repeatability), all from this repo. Then root to a new repo. Then gateway and spreadsheets to their destination repos.
4. **Repository destinations**: `antonycc/www.diyaccounting.co.uk` for gateway (right name), `antonycc/diy-accounting` for spreadsheets (has existing users/discussions to preserve).
5. **Billing**: management account (887764105431) is the single place to look, but each account should display its own usage.
6. **Console access**: single set of credentials via IAM Identity Center (SSO), not separate IAM users per account.
7. **Backups**: submit-backups account receives copies from submit-ci and submit-prod. Restore testing by standing up a prod-replica in CI (including user sub hash salt).
8. **IaC repeatability** -- 887764105431 becomes a clean management account. Submit prod is deployed fresh to a new account from IaC. Salt + backups + code = recovery from total loss. This proves disaster recovery while prod has negligible user data (2 sign-ups and family testers).

### Account structure

```
887764105431 ── management-only: Route53 zone, CDK bootstrap, OIDC, SSO ✅
283165661847 ── gateway (CI + prod) ✅
064390746177 ── spreadsheets (CI + prod) ✅
367191799875 ── submit-ci ✅
972912397388 ── submit-prod ✅
914216784828 ── submit-backup (created, Phase 3)
```

### Repository structure

```
antonycc/root.diyaccounting.co.uk     ── Route53, holding page → 887764105431 ✅
antonycc/www.diyaccounting.co.uk      ── gateway → 283165661847 ✅
antonycc/diy-accounting               ── spreadsheets → 064390746177 ✅
antonycc/submit.diyaccounting.co.uk   ── submit → 367191799875 (CI), 972912397388 (prod) ✅
```

---

## 2. Phase 1: Account Separation ✅

**Goal**: Move every workload out of 887764105431 into purpose-built accounts while all code remains in one repository. 887764105431 becomes a clean management account.

**Why accounts before repos**: A single commit can update workflows, CDK config, and environment files atomically. No cross-repo coordination, no version skew, no "deploy repo A before repo B" ordering. Repository separation is safer once each service already deploys to its final account -- the repo split is then purely a code extraction with no infrastructure changes.

**Why migrate submit prod to a new account**: This proves the IaC is repeatable. If we can stand up submit prod from scratch in a fresh account using only code + backups + salt, then we have validated disaster recovery. Now is the ideal time -- prod has negligible user data (2 sign-ups and family testers), so the cost of re-registration is near zero.

### 1.0: AWS Organization and IAM Identity Center ✅

AWS Organization created from 887764105431 (permanent management account). Organizational Units: `Workloads` (for gateway, spreadsheets, submit-ci, submit-prod) and `Backup` (for submit-backup). IAM Identity Center enabled with SSO user, `AdministratorAccess` and `ReadOnlyAccess` permission sets assigned across all accounts.

### 1.1: Gateway account separation ✅

Gateway (CI + prod) fully migrated to account 283165661847.

### 1.2: Spreadsheets account separation ✅

Spreadsheets (CI + prod) fully migrated to account 064390746177.

### 1.3: Submit CI account separation ✅

Submit CI deployments moved into account 367191799875.

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| 1.3.1 | Create `submit-ci` account | ✅ | Account 367191799875, Workloads OU |
| 1.3.2 | Assign SSO access | ✅ | AdministratorAccess assigned |
| 1.3.3 | CDK bootstrap | ✅ | us-east-1 and eu-west-2 bootstrapped |
| 1.3.4 | Create OIDC provider | ✅ | Trust: `repo:antonycc/submit.diyaccounting.co.uk:*` |
| 1.3.5 | Create deployment roles | ✅ | `submit-ci-github-actions-role` and `submit-ci-deployment-role` |
| 1.3.6 | Create ACM certs | ✅ | us-east-1: `bd4b7bf4...` (*.submit, ci-submit, ci-holding), eu-west-2: `de2a24a1...` (*.submit, ci-submit) |
| 1.3.7 | Replicate Secrets Manager entries | ✅ | Not needed -- `deploy-environment.yml` `create-secrets` job creates all secrets automatically from GitHub Actions secrets |
| 1.3.8 | Add GitHub environment variables | ✅ | Environment-scoped `SUBMIT_*` vars (ci + prod envs), repo-level `ROOT_*` vars |
| 1.3.9 | Update ALL workflow files | ✅ | Removed every hardcoded 887764105431 reference from ~20 workflow files. Uses `vars.SUBMIT_*` (environment-scoped) and `vars.ROOT_*` (repo-level). `ROOT_HOSTED_ZONE_ID` for Route53 zone. |
| 1.3.10 | Update CDK context + .env.ci | ✅ | `.env.ci`: all Secrets Manager ARNs to 367191799875, added cert ARN env vars. Java CDK: added `envOr()` for cert ARNs in `SubmitEnvironment.java` and `SubmitApplication.java`. CI test fixtures updated. |
| 1.3.11 | Deploy CI environment stacks | ✅ | All env stacks live in submit-ci (367191799875). |
| 1.3.12 | Deploy CI application stacks | ✅ | All app stacks deployed (`ci-accounts-app-*`). |
| 1.3.13 | Update root DNS for CI submit | ✅ | `set-origins` job passed. Fixed cross-account Route53: action now switches from submit credentials to root credentials for Route53, then restores submit credentials for API Gateway. |
| 1.3.14 | Validate CI | ✅ | All 18 CI synthetic behaviour tests passing. All 17 simulator tests passing. Run #22208132155 clean. |
| 1.3.15 | Tear down old CI stacks | ✅ | All CI stacks deleted from 887764105431. |
| 1.3.16 | Merge `accounts` to `main` | ✅ | Blocked until 1.4 prod validation completed (prod GitHub env vars had to point to new account first). |

#### Issues found and fixed during CI validation

| Issue | Root cause | Fix | Commit |
|-------|-----------|-----|--------|
| CDK build: cross-environment bucket reference | `OriginBucket` in EdgeStack (us-east-1) had no explicit physical name. SelfDestructStack (eu-west-2) couldn't resolve it cross-region. | Added `PhysicalName.GENERATE_IF_NEEDED` to the bucket. | `1715f2bf` |
| Route53 AccessDenied in `set-origins` | `deploy.yml` used submit-ci credentials for everything, but Route53 is in the management account (887764105431). | Added cross-account credential switching to the `set-origins` composite action. | `3f40cacd` |
| API Gateway domain conflict | `ci-submit.diyaccounting.co.uk` custom domain already existed in 887764105431 (globally unique per region). | Manually deleted from old account via `aws apigatewayv2 delete-domain-name`. | Manual |
| S3 bucket name mismatch in workflows | Workflows constructed bucket names as `${deployment}-app-origin-us-east-1` but CDK now generates unique names with `PhysicalName.GENERATE_IF_NEEDED`. | Replaced hardcoded names with CloudFormation output lookup from EdgeStack in 4 files. | `11b6ab70` |
| Simulator tests: missing `hmrcTokenScope` | HMRC scope enforcement added scope checking but simulator injection didn't set `hmrcTokenScope` in sessionStorage. | Added `hmrcTokenScope` to simulator demo user injection. | `4e0b3c5b` |
| CI synthetic tests: HMRC auth redirect missed | Scope enforcement fetches catalogue asynchronously before OAuth redirect (~7s). Inline test code waited only 1s, missing the redirect entirely. | Replaced fixed timeout with locator wait for HMRC auth page or receipt. | `7b141936` |
| CDK prod test: Cognito lookup fails | `npm test cdk prod` looks up `prod-auth.diyaccounting.co.uk` Cognito domain, which didn't exist yet in submit-prod (972912397388). | Resolved itself when prod was deployed (Phase 1.4). | -- |

**Key design decision**: `SUBMIT_*` variables are GitHub Actions **environment-scoped** (different values for `ci` vs `prod` environments), while `ROOT_*`, `GATEWAY_*`, `SPREADSHEETS_*` are **repo-level** (same account for CI and prod). This means workflow code uses `vars.SUBMIT_ACCOUNT_ID` everywhere -- no conditionals needed.

**ROOT workflow migration**: Done as part of step 1.3.9. `deploy-root.yml` and `deploy-holding.yml` now use `vars.ROOT_ACTIONS_ROLE_ARN` / `vars.ROOT_DEPLOY_ROLE_ARN`, ensuring they are unaffected when `SUBMIT_*` vars change for Phase 1.4.

### 1.4: Submit prod to new account (IaC repeatability proof) ✅

Created a NEW submit-prod account (972912397388) and deployed the full production stack from IaC. Restored data from backups. This proves disaster recovery: salt + backups + code = full recovery. The existing prod in 887764105431 stayed live until the new account was validated and DNS was switched.

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| | **Preparation** | | |
| 1.4.1 | Back up prod data | ✅ | 11/11 tables backed up (prefix `pre-migration-20260221`), all AVAILABLE. Salt metadata exported. Script: `scripts/aws-accounts/backup-prod-for-migration.sh`. |
| 1.4.2 | Document secrets | ✅ | 9 prod secrets found in 887764105431. 2 customer-managed KMS keys (`prod-env-backup`, `prod-env-salt-encryption`). Script: `scripts/aws-accounts/list-prod-secrets.sh`. |
| 1.4.3 | Document ACM certs | ✅ | Old account had 4 certs in us-east-1 and 4 in eu-west-2. Old certs bundled CI+prod SANs together; new account got prod-only certs. |
| | **Account creation** | | |
| 1.4.4 | Create `submit-prod` account | ✅ | Account 972912397388, Workloads OU. |
| 1.4.5 | Assign SSO access | ✅ | AdministratorAccess assigned, `submit-prod` SSO profile working. |
| 1.4.6 | CDK bootstrap | ✅ | us-east-1 and eu-west-2 bootstrapped. |
| 1.4.7 | Create OIDC provider | ✅ | Trust: `repo:antonycc/submit.diyaccounting.co.uk:*`. |
| 1.4.8 | Create deployment roles | ✅ | `submit-prod-github-actions-role`, `submit-prod-deployment-role`. |
| | **Certificates** | | |
| 1.4.9 | Create ACM certs | ✅ | us-east-1: `e465ad23-baf8-4b5c-94a4-33f73a266ec6` (*.submit, prod-submit, submit, prod-auth, prod-holding, prod-simulator). eu-west-2: `eea7a266-4b80-42d9-9d10-39af2455ce5b` (*.submit, prod-submit, submit). Both ISSUED. |
| | **Secrets** | | |
| 1.4.10 | Copy Secrets Manager entries | ✅ | 9/9 secrets copied from 887764105431 to 972912397388. Script: `scripts/aws-accounts/copy-secrets-to-account.sh`. |
| | **Deploy from IaC** | | |
| 1.4.11 | Update GitHub environment variables | ✅ | All 5 `prod` environment variables updated to 972912397388: `SUBMIT_ACCOUNT_ID`, `SUBMIT_ACTIONS_ROLE_ARN`, `SUBMIT_DEPLOY_ROLE_ARN`, `SUBMIT_CERTIFICATE_ARN`, `SUBMIT_REGIONAL_CERTIFICATE_ARN`. |
| 1.4.12 | Update `deploy.yml` | ✅ | No code changes needed -- already uses `vars.SUBMIT_*` (environment-scoped). |
| 1.4.13 | Update `deploy-environment.yml` | ✅ | No code changes needed -- already uses `vars.SUBMIT_*` (environment-scoped). |
| 1.4.14 | Update CDK context + .env.prod | ✅ | Updated `cdk-application/cdk.json` (3 cert ARNs), `cdk-environment/cdk.json` (3 cert ARNs), `.env.prod` (8 Secrets Manager ARNs) from 887764105431 to 972912397388. |
| 1.4.15 | Deploy prod environment stacks | ✅ | All 10 environment stacks deployed to 972912397388: ObservabilityStack, ObservabilityUE1Stack, DataStack, EcrStack, EcrUE1Stack, ActivityStack, BackupStack, SimulatorStack, ApexStack, IdentityStack. Run #22248369483 (30/30 jobs passed). |
| 1.4.16 | Deploy prod application stacks | ✅ | All app stacks deployed to 972912397388: AuthStack, AccountStack, BillingStack, HmrcStack, ApiStack, EdgeStack, PublishStack. |
| | **Data restoration** | | |
| 1.4.17 | Restore DynamoDB tables | ✅ | Cross-account scan+batch-write from 887764105431 to 972912397388. All 5 tables copied: receipts (1,156), bundles (1,035), hmrc-api-requests (19,691 / 48 MB), passes (1,181), subscriptions (30). Script: `scripts/aws-accounts/restore-tables-from-backup.sh`. |
| 1.4.17a | Enable TTL on DynamoDB tables | ✅ | TTL was DISABLED on ALL 11 tables in both accounts. CDK `ensureTimeToLive()` utility added. TTL enabled on 7 tables. HMRC API requests TTL changed from 1 month to 28 days. All 19,691 existing records set to 1-day expiry (~6.5h). Script: `scripts/aws-accounts/set-ttl-on-existing-records.sh`. |
| 1.4.18 | Restore salt | ✅ | Path 1 (Secrets Manager): `prod/submit/user-sub-hash-salt` copied from 887764105431 to 972912397388, verified MATCH. Valid registry with 2 versions (current: v2). Script: `scripts/aws-accounts/restore-salt.sh`. |
| | **DNS cutover** | | |
| 1.4.19 | Update root DNS for prod submit | ✅ | Root DNS deploy run #22249618225 succeeded. Route53 records upserted for `submit.diyaccounting.co.uk` and `prod-submit.diyaccounting.co.uk` pointing to new CloudFront. |
| 1.4.20 | Validate prod | ✅ | Deploy #22257323730: **142 passed, 0 failed, 20 skipped.** All CDK stacks deployed, set-origins succeeded, all 13 prod synthetic behaviour tests passed. |
| 1.4.21 | Notify users | ✅ | Informed the 2 sign-ups + family testers that they need to re-register (new Cognito pool). |

#### Issues found and fixed during prod validation

| Issue | Root cause | Fix | Commit |
|-------|-----------|-----|--------|
| Wrong AWS credentials (ci instead of prod) | Every job's `environment:` key used `github.ref == 'refs/heads/main' && 'prod' || 'ci'`. When deploying from the `accounts` branch with `environment-name=prod`, all jobs resolved to `ci` environment, getting submit-ci (367191799875) credentials instead of submit-prod (972912397388). | `params` job now resolves `github-environment` from the explicit `environment-name` input (falling back to branch). All downstream jobs reference `needs.params.outputs.github-environment`. Applied to `deploy-environment.yml` and `deploy-cdk-stack.yml`. | `491d8b04` |
| CloudFront CNAME conflict (simulator + holding) | CloudFront CNAME aliases are globally unique. Old prod distributions in 887764105431 still owned `prod-simulator.diyaccounting.co.uk` and `prod-holding.diyaccounting.co.uk`. | Removed CNAME aliases from the two old distributions in 887764105431. Old distributions still existed but were no longer reachable by custom domain. | Manual (AWS CLI) |
| Cross-account Route53 access denied | ApexStack and SimulatorStack create Route53 records via CDK `AwsCustomResource`. The Lambda runs in 972912397388 but Route53 is in 887764105431. `.env.prod` was missing `ROOT_ROUTE53_ROLE_ARN`. | Added `ROOT_ROUTE53_ROLE_ARN=arn:aws:iam::887764105431:role/root-route53-record-delegate` to `.env.prod`. | -- |
| BackupStack: DynamoDB GSI still creating | BackupStack depends on DataStack and re-deploys it. The `prod-env-passes` table's `issuedBy-index` GSI was still being created when BackupStack tried to update DataStack. | Resolved on third run -- transient timing issue. No code change needed. | -- |
| Cognito custom domain conflict | Cognito custom domains are globally unique. Old prod user pool in 887764105431 owned `prod-auth.diyaccounting.co.uk`. | Removed custom domain from old Cognito user pool via `aws cognito-idp delete-user-pool-domain`. | Manual (AWS CLI) |
| Cognito domain: stale Route53 records | After removing the custom domain from the old user pool, Route53 A/AAAA records still pointed to the old Cognito CloudFront endpoint. | Deleted the stale A/AAAA alias records from Route53. CDK `Route53AliasUpsert` re-created them pointing to the new endpoint. | Manual (AWS CLI) |
| `npm test cdk-ci` wrong credentials | `npm-test-cdk-ci` job used `environment: ${{ needs.params.outputs.github-environment }}` which resolved to `prod` when deploying prod from `accounts` branch. CI CDK test needs CI account credentials. | Hardcoded `environment: ci` for `npm-test-cdk-ci` and `environment: prod` for `npm-test-cdk-prod`. | `17d783b0` |
| `destroy.yml` scanning both accounts | Single destroy workflow scanned both ci- and prod-prefixed stacks in one account. With accounts separated, each destroy needed its own account's credentials. | Split into `destroy-ci.yml` and `destroy-prod.yml`. | `17d783b0` |
| CloudFront CNAME conflict (submit apex) | `set-origins` failed with `CNAMEAlreadyExists` -- old distribution in 887764105431 still owned `submit.diyaccounting.co.uk`, `prod-submit.diyaccounting.co.uk`, `prod-4c05746.submit.diyaccounting.co.uk`. | Removed all 3 CNAME aliases from old distribution and switched to CloudFront default cert. | Manual (AWS CLI) |
| API Gateway domain "already exists" on re-run | `set-origins` API GW domain transfer: `create-domain-name` failed with "already exists" if domain was created by a previous run. | Made `create-domain-name` handle "already exists" as success -- proceed to mapping instead of failing. | -- |
| TTL disabled on all DynamoDB tables | All 11 tables in both accounts had TTL disabled. HMRC API requests (19,691 items, 48 MB) growing unbounded. | Added `ensureTimeToLive()` CDK utility. Enabled TTL on 8 tables in DataStack. Changed HMRC API request TTL from 1 month to 28 days. Batch updated all 19,691 records. | `a38f21b0` |
| Lambda reserved concurrency exhaustion | New account (972912397388) has 400 Lambda concurrent executions limit. Old deployment (32 functions x 5 = 160) + new deployment trying 160 more exceeded the limit. | Destroyed old deployments to free reserved concurrency. | Manual |
| API Gateway custom domain conflict (prod apex) | `prod-submit.diyaccounting.co.uk` and `submit.diyaccounting.co.uk` still existed as API GW custom domains in 887764105431. Globally unique per region. | Deleted both domains from old account. | Manual (AWS CLI) |
| Destroy sweepers broken (Route 53 in wrong account) | `destroy-ci.yml` and `destroy-prod.yml` failed with `No hosted zone found for diyaccounting.co.uk.` -- Route 53 zone is in management account but sweepers queried with submit-account credentials. | Added cross-account credential switching: assume `ROOT_ACTIONS_ROLE_ARN` then `ROOT_DEPLOY_ROLE_ARN` before Route 53 query, restore `SUBMIT_*` credentials after. | -- |

#### DynamoDB data profile and cost analysis

**Table sizes in submit-prod (972912397388) -- February 2026:**

| Table | Items | Size | Unique Users | Billing |
|-------|------:|-----:|-------------:|---------|
| prod-env-hmrc-api-requests | 19,691 | 46.0 MB | 905 | PAY_PER_REQUEST |
| prod-env-receipts | 1,156 | 384 KB | 852 | PAY_PER_REQUEST |
| prod-env-passes | 1,182 | 367 KB | -- | PAY_PER_REQUEST |
| prod-env-bundles | 1,035 | 285 KB | -- | PAY_PER_REQUEST |
| prod-env-subscriptions | 30 | 10 KB | 24 | PAY_PER_REQUEST |
| 5 x async-request tables | 0 | 0 | -- | PAY_PER_REQUEST |
| **Total** | **23,094** | **~47.1 MB** | | |

**User analysis**: 905 distinct users (by hashedSub) generated 19,691 HMRC API request records = ~22 API calls per user lifetime. With 24 active subscriptions and 30 subscription records, real paying users were very few. Most of the 905 users signed up, made a few HMRC API calls (obligation checks), then left.

**Cost of the cross-account migration (one-off)**:
- Scan (source, 887764105431): ~23,094 RCUs -- ~$0.007
- Batch-write (dest, 972912397388): ~23,094 WCUs -- ~$0.034
- TTL batch update (19,691 update-item calls): ~$0.029
- **Total migration DynamoDB cost: ~$0.07**
- **Migration time**: Data copy ~20 min (batch-write-item at 25 items/batch). TTL batch update ~6.5 hours (sequential update-item, ~3,100 items/hr).

**Monthly storage cost**: 47.1 MB x $0.2968/GB = ~$0.014/month

**Scaling projections (with 28-day TTL on hmrc-api-requests)**:
- At 1,000 monthly active users: ~5,000 live records, ~12 MB -- $0.004/month storage
- At 10,000 monthly active users: ~50,000 live records, ~120 MB -- $0.036/month storage
- At 100,000 monthly active users: ~500,000 live records, ~1.2 GB -- $0.36/month storage

### 1.5: Clean up 887764105431 (make it management-only) ✅

#### Inventory of resources remaining in 887764105431 (as of 2026-02-21)

**CloudFormation stacks (3):**
- `CDKToolkit` -- kept (needed for root DNS/holding deploys)
- `prod-env-BackupStack` -- torn down
- `prod-env-DataStack` -- torn down (had 38 DynamoDB tables: 11 prod-env-*, 11 ci-env-*, 16 legacy-named)

**CloudFront distributions (9):** All legacy/old deployment distributions (`E3VBOLA04TMMN0`, `EW310RS705OLC`, `E1JZ7PA80QQ7NE`, `E26KUZNPFIMNI1`, `E3VC3J8EWJ541F`, `E1L9BGS0YJH61A`, `E2C6KXBWV4RNC6`, `E2MVQZJ1DET1F`, `ETMWP0TSWEONI`).

**DynamoDB tables (38):** 11 `prod-env-*`, 11 `ci-env-*`, 16 legacy-named (`submit-diyaccounting-co-uk-*`, `ci-submit-diyaccounting-co-uk-*`). All data had been copied to 972912397388. Tables protected by pre-migration backups (prefix `pre-migration-20260221`).

**Secrets Manager (20):** 10 `prod/submit/*`, 10 `ci/submit/*`. All copied to respective new accounts.

**ACM certificates (14):** us-east-1: 10 certs (submit, stage, gateway, spreadsheets domains). eu-west-2: 4 certs (submit, auth, simulator domains).

**Lambda functions (3):** Old app stack and env stack custom resources.

**IAM roles (4 relevant):** `submit-deployment-role`, `submit-github-actions-role` (old OIDC deploy), `root-route53-record-delegate` (kept -- cross-account DNS), `root-RootDnsStack-*` (kept -- root DNS custom resource).

**Route53:** 1 hosted zone `diyaccounting.co.uk` -- kept permanently (management account owns DNS).

**Cognito:** No user pools remaining (old pool's custom domain already deleted).

**API Gateway:** No custom domains remaining (deleted during 1.4).

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| 1.5.0 | Export root zone and organization structure | ✅ | Exported 236 Route53 records to `root-zone/` (zone.json, zone.bind, manual-records.json, organization.json). Identified 5 manually-managed records (email MX/SPF/DKIM, webmail CNAME, Google site verification) not in any CDK stack. Script: `scripts/aws-accounts/export-root-zone.sh`. |
| 1.5.1 | Tear down old prod stacks | ✅ | All cleaned from 887764105431: 9 CloudFront distributions deleted, `prod-env-DataStack` and `prod-env-BackupStack` CloudFormation stacks deleted (manually), 38 DynamoDB tables deleted (11 ci-env, 11 prod-env, 8 ci-submit-diyaccounting-co-uk, 8 submit-diyaccounting-co-uk). Only `CDKToolkit` stack remains. |
| 1.5.2 | Delete old ACM certs | ✅ | All 14 ACM certs deleted from 887764105431 (4 eu-west-2, 10 us-east-1). Gateway/spreadsheets distributions already migrated to their own accounts with their own certs. Management account now has zero ACM certs in both regions. |
| 1.5.3 | Delete old Secrets Manager entries | ✅ | All 20 secrets force-deleted from 887764105431: 9 `ci/submit/*`, 9 `prod/submit/*`, 2 unprefixed `/submit/*`. Management account now has zero secrets. |
| 1.5.4 | Remove old OIDC provider and roles | ✅ | Deleted `submit-github-actions-role`, `submit-deployment-role`, and 7 legacy roles (`diya-console-via-google`, `diyaccounting-co-uk-account-*` x3, `EC2ManagedRole`, `lambda_exec_role`, `static-site-deploy`). Deleted 5 customer-managed policies, 3 instance profiles, 1 empty S3 bucket (`live-www-diyaccounting-co-uk-logs`). Kept: `root-route53-record-delegate`, OIDC provider, CDK bootstrap roles. Also deleted 10 legacy IAM users (with access keys, login profiles) and 7 IAM groups (pre-SSO era). |
| 1.5.5 | Verify management-only state | ✅ | Verified. 887764105431 contains only: CDKToolkit stack, CDK bootstrap roles (10), OIDC provider, `root-github-actions-role`, `root-deployment-role`, `root-route53-record-delegate`, `root-RootDnsStack-*` custom resource role, Route53 zone, CDK asset buckets (2), SSO roles (2), AWS service-linked roles (16). Zero: DynamoDB tables, Lambda functions, CloudFront distributions, secrets, ACM certs, customer-managed policies, IAM users, IAM groups. |
| 1.5.6 | Update OIDC trust for root DNS | ✅ | Created `root-github-actions-role` (OIDC trust for root repo) and `root-deployment-role` (scoped to CDK + Route53 + S3 + CloudFront + ACM + SSM). Updated GitHub vars `ROOT_ACTIONS_ROLE_ARN` and `ROOT_DEPLOY_ROLE_ARN` to new role ARNs. Old submit roles deleted in 1.5.4. |

### Cross-account DNS validation

All new accounts' ACM certs needed DNS validation. The Route53 zone stays in 887764105431 (management account) -- this is architecturally correct.

1. Request the cert in the new account
2. Copy the ACM DNS validation CNAME values
3. Create them in 887764105431's Route53 zone (via `deploy-root.yml` or manually)
4. ACM validates and issues the cert

One-time operation per cert. ACM certs are rarely recreated.

### OIDC trust

Each new account gets its own GitHub Actions OIDC provider pointing to `token.actions.githubusercontent.com`. During Phase 1, the trust policy was scoped to `repo:antonycc/submit.diyaccounting.co.uk:*` -- because this was the only repo deploying anywhere. In Phase 2 (repo separation), OIDC trust policies were updated to trust each service's own repo.

### S3 bucket name migration

S3 bucket names are globally unique across all AWS accounts. All stacks had hardcoded bucket names (e.g., `ci-gateway-origin`), which collide when deploying the same stack to a new account while the old account still has the bucket.

**Fix applied (commit `1715f2bf`):** Removed `.bucketName()` from all 7 stacks. CDK auto-generates unique names per account. For EdgeStack, the cross-stack reference (PublishStack and SelfDestructStack looked up the bucket by name via `sharedNames`) was replaced with an explicit prop passed from SubmitApplication. **Additional fix:** EdgeStack's OriginBucket required `PhysicalName.GENERATE_IF_NEEDED` because it's created in us-east-1 but referenced by SelfDestructStack in eu-west-2 -- CDK can't resolve auto-generated tokens cross-environment without an explicit physical name.

**Migration pattern for each phase:**
1. Old stacks in 887764105431 remained untouched (still had hardcoded names -- deployed from `main`)
2. New stacks deployed fresh to the new account with CDK-generated names -- no collision
3. Old stacks were torn down after validation and DNS cutover

### Rollback strategy

- Old stacks in 887764105431 were kept until new-account versions were validated
- DNS cutover was a single alias record update via `deploy-root.yml` -- rollback was running the workflow again with the old CloudFront domain
- For submit prod: old prod stayed live in 887764105431 until the new account was fully validated. DNS switch was the final step. Reverting DNS would roll back.

---

## 3. Phase 2: Repository Separation ✅

**Goal**: Each service gets its own GitHub repository with independent CI/CD, versioning, and deployment pipelines. By this point, each service already deploys to its final AWS account. The repo split is purely a code extraction -- no infrastructure changes.

**Prerequisite**: Phase 1 complete (accounts separated, all deployments stable from this repo).

**Order**: Root first (thinnest slice), then gateway, then spreadsheets, then submit cleanup.

### 2.1: Root to `antonycc/root.diyaccounting.co.uk` ✅

Root is the thinnest slice -- just Route53 alias records and the holding page. Deploys to 887764105431 (management account).

| Step | Description | Status |
|------|-------------|--------|
| 2.1.1 | Create new GitHub repository | ✅ `antonycc/root.diyaccounting.co.uk` |
| 2.1.2 | Set up project: `pom.xml` (CDK only), `package.json` (CDK CLI, prettier, ncu, cfn-diagram) | ✅ |
| 2.1.3 | Copy root-relevant files from submit repo | ✅ Java files, web/holding/, cdk-root/, root-zone/, scripts, Maven wrapper, GitHub actions |
| 2.1.4 | Adapt `deploy-root.yml` to `deploy.yml`, keep `deploy-holding.yml`, add `test.yml` | ✅ |
| 2.1.5 | Update OIDC trust in 887764105431 | ✅ `root-github-actions-role` trusts `repo:antonycc/root.diyaccounting.co.uk:*` only (narrowed in 2.4.3) |
| 2.1.6 | Deploy from root repo and verify DNS | ✅ |
| 2.1.7 | Verify holding page deploys from root repo | ✅ |
| 2.1.8 | Remove root files from submit repo | ✅ Removed: `deploy-root.yml`, `deploy-holding.yml`, `RootEnvironment.java`, `RootDnsStack.java`, `cdk-root/`, `root-zone/`, `export-root-zone.sh`. Removed `cdk-root` Maven profile, `submit-root.jar` antrun target, `cdk:synth-root` and `diagram:root` npm scripts. Kept: `web/holding/` (still used by ApexStack), `set-origins` action (still used by deploy.yml). |

**What was copied to root repo** (package renamed to `co.uk.diyaccounting.root`):

| Category | Files |
|----------|-------|
| CDK entry point | `RootEnvironment.java` |
| CDK stacks | `RootDnsStack.java`, `ApexStack.java` |
| CDK config | `cdk-root/cdk.json` |
| Shared CDK utils | `SubmitSharedNames.java`, `SubmitStackProps.java`, `Kind.java`, `KindCdk.java`, `Route53AliasUpsert.java`, `ResourceNameUtils.java`, `LambdaNames.java`, `LambdaNameProps.java` |
| Web content | `web/holding/index.html` |
| Root zone data | `root-zone/` (zone.json, zone.bind, manual-records.json, organization.json) |
| Workflows | `deploy.yml` (from deploy-root.yml), `deploy-holding.yml`, `test.yml` |
| GitHub actions | `get-names/`, `set-origins/` |
| Scripts | `bootstrap-account.sh`, `export-root-zone.sh`, `validate-workflows.sh`, `update-java.sh`, `clean-drawio.cjs` |
| Build | Maven wrapper, `.prettierrc`, `.prettierignore`, `.gitignore` |
| Docs | `CLAUDE.md` |

### 2.2: Gateway to `antonycc/www.diyaccounting.co.uk` ✅

Archive-and-overlay into the existing repo. Preserved repo settings, stars, and issue history. **Gateway became the template repository** for future static site repos.

| Step | Description | Status |
|------|-------------|--------|
| 2.2.1 | Archive existing repo files | ✅ Skipped -- repo was nearly empty (just `.gitignore` and `.idea`) |
| 2.2.2 | Copy files from submit repo | ✅ Web content, redirects.toml, scripts, Maven wrapper, Prettier config |
| 2.2.3 | Rename Java package to `co.uk.diyaccounting.gateway` | ✅ 4 Java files: GatewayEnvironment, GatewayStack, Kind, KindCdk. Unnecessary shared files removed (SubmitSharedNames, LambdaNames, etc. not imported by GatewayStack). |
| 2.2.4 | Create `pom.xml` | ✅ CDK-only, Spotless + Palantir, Maven wrapper. groupId `co.uk.diyaccounting.gateway`, JAR name `gateway.jar`. |
| 2.2.5 | Create `package.json` | ✅ Name `@antonycc/www-diyaccounting-co-uk`, engines node >=24.0.0 |
| 2.2.6 | Create `CLAUDE.md` | ✅ Based on root repo, adapted for gateway account (283165661847). Includes template repo instructions. |
| 2.2.7 | Adapt `deploy-gateway.yml` to `deploy.yml` | ✅ Standalone workflow, OIDC auth with `GATEWAY_*` vars. Simplified params job. |
| 2.2.8 | Add `test.yml` workflow | ✅ |
| 2.2.9 | Create `AWS_RESOURCES.md` and `README.md` | ✅ AWS resources catalogued from live account. |
| 2.2.10 | Verify build | ✅ `npm install`, `./mvnw clean verify`, `npm run cdk:synth` all pass. |
| 2.2.11 | Update OIDC trust in gateway account (283165661847) | ✅ `gateway-github-actions-role` trust includes `repo:antonycc/www.diyaccounting.co.uk:*` |
| 2.2.12 | Deploy from gateway repo | ✅ Gateway repo deployed and live. |
| 2.2.13 | Mark repo as template repository | ✅ |
| 2.2.14 | Remove gateway files from submit repo | ✅ All removed: `deploy-gateway.yml`, `GatewayStack.java`, `GatewayEnvironment.java`, `cdk-gateway/`, `web/www.diyaccounting.co.uk/`, `build-gateway-redirects.cjs`, `gateway.behaviour.test.js`, Maven `cdk-gateway` profile, npm gateway scripts, Playwright gateway project, SEO gateway tests. `npm test` + `./mvnw clean verify` pass. |

**Why gateway is the template**: It's the simplest CDK static site pattern -- S3 + CloudFront + OAC + optional CloudFront Function. No Lambda, no DynamoDB, no API Gateway. Any future static site can start from this template and add complexity as needed. The spreadsheets repo was built on top of this same pattern.

### 2.3: Spreadsheets to `antonycc/diy-accounting` ✅

Same archive-and-overlay pattern as gateway. Preserved GitHub Discussions. More complex than gateway due to Excel packages and knowledge base.

| Step | Description | Status |
|------|-------------|--------|
| 2.3.1 | Archive existing repo files | ✅ |
| 2.3.2 | Copy files from submit repo | ✅ Web content (`web/spreadsheets.diyaccounting.co.uk/`), packages (71 dirs), scripts (build-packages, build-sitemaps, generate-knowledge-base-toml, stripe-setup), behaviour test, redirects.toml |
| 2.3.3 | Rename Java package to `co.uk.diyaccounting.spreadsheets` | ✅ SpreadsheetsEnvironment and SpreadsheetsStack replaced with submit's logic (CSP for PayPal, `prune(false)`, correct distributionPaths). KindCdk.java kept from template (safer null handling). |
| 2.3.4 | Create `pom.xml` | ✅ CDK-only, single `cdk-spreadsheets` profile. Updated `retag-gateway` to `retag-spreadsheets`. JAR name `spreadsheets.jar`. |
| 2.3.5 | Create `package.json` | ✅ Major rewrite: `GATEWAY_BASE_URL` to `SPREADSHEETS_BASE_URL`, CI URL fixed to `ci-spreadsheets.diyaccounting.co.uk`, added build scripts, added `stripe` dependency. |
| 2.3.6 | Create `CLAUDE.md` | ✅ Includes package pipeline, knowledge base, SPREADSHEETS_BASE_URL, no Lambda/DynamoDB/Cognito. |
| 2.3.7 | Adapt `deploy-spreadsheets.yml` to `deploy.yml` | ✅ Rewritten from submit's deploy-spreadsheets.yml: SpreadsheetsStack, build-redirects/sitemaps/packages steps, S3 zip sync, `SPREADSHEETS_*` vars. |
| 2.3.8 | Add `test.yml` workflow | ✅ Updated paths trigger, added build-sitemaps/build-redirects steps, spreadsheetsBehaviour-local test. |
| 2.3.9 | Fill gaps from `archive/` | ✅ Old packages, README, build scripts, community discussions context. |
| 2.3.10 | Update OIDC trust in spreadsheets account (064390746177) | ✅ `spreadsheets-github-actions-role` trust includes `repo:antonycc/diy-accounting:*` |
| 2.3.11 | Deploy from spreadsheets repo | ✅ All 3 jobs passed (params, deploy, smoke test) -- [run 22284381028](https://github.com/antonycc/diy-accounting/actions/runs/22284381028) |
| 2.3.12 | Remove spreadsheets files from submit repo | ✅ All removed. `npm test` (927 passed) + `./mvnw clean verify` (BUILD SUCCESS). |

#### Additional files created/adapted (2.3.2-2.3.8)

| File | Action |
|------|--------|
| `cdk-spreadsheets/cdk.json` | Fixed `docRootPath`, `prodFQDomainName`, removed `prodFQNakedDomainName` |
| `playwright.config.js` | `gatewayBehaviour` to `spreadsheetsBehaviour`, browser test to `spreadsheets-content.browser.test.js` |
| `.pa11yci.ci.json` / `.pa11yci.prod.json` | Expanded to 5 URLs (download, donate, knowledge-base, community) |
| `.gitignore` | Added generated files (catalogue.toml, sitemap.xml, knowledge-base.toml, redirect-function.js, target/zips/) |
| `web/browser-tests/spreadsheets-content.browser.test.js` | New -- replaces gateway-content, tests product cards, JSON-LD `SoftwareApplication`, donate/download pages |
| `web/unit-tests/seo-validation.test.js` | Rewritten -- path to `web/spreadsheets.diyaccounting.co.uk/public`, JSON-LD type `SoftwareApplication` |
| `web/unit-tests/smoke.test.js` | Rewritten -- spreadsheets pages (download, donate, knowledge-base), spreadsheets.css |
| `web/spreadsheets.diyaccounting.co.uk/redirects.toml` | Created -- 12 static redirects + 5 product mappings (old www.diyaccounting.co.uk URLs) |
| `scripts/build-spreadsheets-redirects.cjs` | Fixed auto-generated comment, domain names (ci-spreadsheets, ci.submit) |
| `README.md` | Generated for spreadsheets site |

#### Verification (2.3.2-2.3.8)

All passing in diy-accounting repo:
- `npm install` ✅
- `./mvnw clean verify` ✅ (BUILD SUCCESS)
- `npm test` ✅ (28 tests: 20 SEO + 8 smoke)
- `node scripts/build-spreadsheets-redirects.cjs` ✅ (4.0KB/10KB limit)
- `npm run cdk:synth` ✅ (ci-spreadsheets-SpreadsheetsStack with DistributionDomainName, DistributionId, OriginBucketName outputs)

#### Spreadsheets-specific complexity (beyond gateway template)

| Feature | Details |
|---------|---------|
| Excel packages | 71 zip archives built by `build-packages.cjs` with financial year cutoff logic for Company (Any) variants. Synced to S3 separately from BucketDeployment (BucketDeployment has `prune(false)` to preserve zips). |
| Knowledge base | 246 HTML articles generated/managed, with TOML-based reference additions (`data/ref-additions/`). `generate-knowledge-base-toml.cjs` builds the index. |
| PayPal Donate | PayPal SDK embedded on donate page. CSP headers in SpreadsheetsStack must include `paypal.com`, `paypalobjects.com` in script-src, connect-src, frame-src. |
| Stripe payment links | Donation payment links (completed). |
| SEO | Structured data (schema.org) on product pages. Sitemap generation. |

### 2.4: Submit repo cleanup ✅

| Step | Description | Status |
|------|-------------|--------|
| 2.4.1 | Remove gateway and spreadsheets behaviour tests from submit | ✅ Removed `spreadsheets.behaviour.test.js`, `spreadsheetsBehaviour` playwright project (gateway already removed in 2.2.14) |
| 2.4.2 | Clean up `package.json`, `pom.xml` | ✅ Removed spreadsheets npm scripts, gateway/spreadsheets URLs from accessibility scripts, SEO scripts, `cdk-spreadsheets` Maven profile, `submit-spreadsheets.jar` from main profile, spreadsheets site from SEO validation tests |
| 2.4.3 | Remove submit repo's OIDC trust from 887764105431 | ✅ `root-github-actions-role` trust narrowed to `repo:antonycc/root.diyaccounting.co.uk:*` only |
| 2.4.4 | Verify submit deploys and tests still pass | ✅ `npm test` (88 files, 927 passed) + `./mvnw clean verify` (BUILD SUCCESS) locally |

### Shared quality baseline (all repos)

Every repo in the organization follows this baseline, established during Phase 2.1 (root repo):

| Category | Tooling | Configuration |
|----------|---------|---------------|
| Java formatting | Spotless + Palantir Java Format | 100-column width, `./mvnw spotless:apply` |
| JS/YAML/JSON formatting | Prettier | `.prettierrc` shared config |
| Java build | Maven 3.9.10 + Java 25 | Maven wrapper (`./mvnw`), shade plugin for fat JARs |
| CDK | AWS CDK 2.x (Java) | Immutables annotation processing, CDK CLI via npm |
| Dependency updates | npm-check-updates + Maven versions | `update-to-minor`, `update-to-latest`, `update:java` |
| Architecture diagrams | cfn-diagram | Generated from CDK synth output |
| Workflow validation | actionlint | `lint:workflows` script |
| Node engine | >=24.0.0 | `engines.node` in package.json |
| Git workflow | Branch-based, no direct pushes to main | PRs required, CI must pass |
| CLAUDE.md | AI assistant instructions | Account structure, build commands, security rules |

---

## 4. Reference Sections

### Deployment flow (final state)

```
root.diyaccounting.co.uk ──OIDC──► 887764105431 (DNS + holding only)
submit repo ───────OIDC──► submit-prod (prod) + submit-ci (CI)
gateway repo ──────OIDC──► gateway (S3 + CloudFront)
spreadsheets repo ─OIDC──► spreadsheets (S3 + CloudFront)
```

### Data flow

```
┌─────────────────┐     ┌─────────────────┐
│   submit-ci     │     │  submit-prod    │
│                 │     │  (972912397388)  │
│  CI DynamoDB    │     │ Prod DynamoDB   │
│       │         │     │       │         │
│  Local Backup   │     │  Local Backup   │
│       │         │     │       │         │
└───────┼─────────┘     └───────┼─────────┘
        │                       │
        │   Cross-Account Copy  │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │    submit-backup      │
        │    (914216784828)     │
        │                       │
        │  Cross-Account Vault  │
        │  (90-day retention)   │
        └───────────┬───────────┘
                    │
                    │  Restore Testing
                    │  (copy back to CI)
                    ▼
        ┌───────────────────────┐
        │   submit-ci           │
        │   (restored tables)   │
        │   → behaviour tests   │
        └───────────────────────┘
```

### Console access (IAM Identity Center)

Single portal for all accounts. No separate IAM users, no multiple sets of credentials.

1. Log into the SSO portal once: `https://d-9c67480c02.awsapps.com/start/`
2. Portal shows all accounts with their permission sets
3. Click any account, choose permission set, opens AWS console
4. For CLI: click "Command line or programmatic access", copy temporary credentials

**CLI profiles** (`~/.aws/config`):

```ini
[sso-session diyaccounting]
sso_start_url = https://d-9c67480c02.awsapps.com/start/
sso_region = eu-west-2
sso_registration_scopes = sso:account:access

[profile management]
sso_session = diyaccounting
sso_account_id = 887764105431
sso_role_name = AdministratorAccess
region = eu-west-2

[profile gateway]
sso_session = diyaccounting
sso_account_id = 283165661847
sso_role_name = AdministratorAccess
region = eu-west-2

[profile spreadsheets]
sso_session = diyaccounting
sso_account_id = 064390746177
sso_role_name = AdministratorAccess
region = eu-west-2

[profile submit-ci]
sso_session = diyaccounting
sso_account_id = 367191799875
sso_role_name = AdministratorAccess
region = eu-west-2

[profile submit-prod]
sso_session = diyaccounting
sso_account_id = 972912397388
sso_role_name = AdministratorAccess
region = eu-west-2

[profile submit-backup]
sso_session = diyaccounting
sso_account_id = 914216784828
sso_role_name = AdministratorAccess
region = eu-west-2
```

**Daily workflow**: `aws sso login --sso-session diyaccounting` opens browser for auth. Credentials last ~8-12 hours across all profiles.

### Billing

AWS Organizations provides consolidated billing automatically.

| What | Where |
|------|-------|
| Single bill for everything | 887764105431 (management account) -- Billing console |
| Per-account breakdown | 887764105431 -- Cost Explorer -- filter by "Linked Account" |
| Individual account view | Each member account -- Cost Explorer shows only its own usage |
| Budget alerts | Set per-account in management -- SNS notifications |

**Expected costs**:

| Account | Expected Cost | Main Drivers |
|---------|---------------|--------------|
| 887764105431 (management) | ~$5-10/month | Route53 zone, IAM Identity Center (free), holding page CloudFront |
| submit-prod | Current prod costs | Lambda, DynamoDB, CloudFront, API GW, Cognito |
| submit-ci | ~30-50% of prod | Same services, less traffic |
| gateway | ~$1-5/month | S3 + CloudFront (static site) |
| spreadsheets | ~$1-10/month | S3 + CloudFront (static site + package zips) |
| submit-backup | ~$5-20/month | Vault storage for backup copies |

### Domain convention

| Service | CI | Prod | Prod alias | Account | Repo |
|---------|-----|------|------------|---------|------|
| Submit | `ci-submit.diyaccounting.co.uk` | `prod-submit.diyaccounting.co.uk` | `submit.diyaccounting.co.uk` | submit-ci / submit-prod | submit |
| Gateway | `ci-gateway.diyaccounting.co.uk` | `prod-gateway.diyaccounting.co.uk` | `diyaccounting.co.uk`, `www.diyaccounting.co.uk` | gateway | www.diyaccounting.co.uk |
| Spreadsheets | `ci-spreadsheets.diyaccounting.co.uk` | `prod-spreadsheets.diyaccounting.co.uk` | `spreadsheets.diyaccounting.co.uk` | spreadsheets | diy-accounting |
| Cognito | `ci-auth.diyaccounting.co.uk` | `prod-auth.diyaccounting.co.uk` | -- | submit-ci / submit-prod | submit |
| Holding | `ci-holding.diyaccounting.co.uk` | `prod-holding.diyaccounting.co.uk` | -- | 887764105431 | root |
| Simulator | `ci-simulator.diyaccounting.co.uk` | `prod-simulator.diyaccounting.co.uk` | -- | submit-ci / submit-prod | submit |
| DNS zone | -- | -- | `diyaccounting.co.uk` | 887764105431 | root |

### Account table

| Account | ID | Email | OU | Purpose | Phase |
|---------|-----|-------|-----|---------|-------|
| Management | 887764105431 | admin@diyaccounting.co.uk | Management (org root) | Org admin, Route53, IAM Identity Center, billing, holding page | Phase 1.0 ✅ |
| Gateway | 283165661847 | admin+aws-gateway@diyaccounting.co.uk | Workloads | Gateway (S3 + CloudFront) | Phase 1.1 ✅ |
| Spreadsheets | 064390746177 | admin+aws-spreadsheets@diyaccounting.co.uk | Workloads | Spreadsheets (S3 + CloudFront) | Phase 1.2 ✅ |
| Submit CI | 367191799875 | admin+aws-submit-ci@diyaccounting.co.uk | Workloads | Submit CI (Lambda, DDB, Cognito, API GW) | Phase 1.3 ✅ |
| Submit Prod | 972912397388 | admin+aws-submit-prod@diyaccounting.co.uk | Workloads | Submit prod (Lambda, DDB, Cognito, API GW) | Phase 1.4 ✅ |
| Submit Backup | 914216784828 | admin+aws-submit-backup@diyaccounting.co.uk | Backup | Cross-account backup vault | Phase 3 |

### Risk summary

| Risk | Mitigation |
|---|---|
| DNS cutover causes downtime | CloudFront alias changes propagate in seconds. Old distributions kept until verified. Rollback via `deploy-root.yml`. |
| ACM cert validation delay | Certs requested days before planned cutover. DNS validation typically completes in minutes. |
| New account missing permissions | Bootstrap follows proven pattern. Tested with CI deployment first. |
| Account separation breaks workflows | All changes in one repo -- tested on feature branch before merging. Revert is one commit. |
| Submit prod migration loses data | Full DynamoDB backup before migration. Old prod stayed live until new was validated. Backup restoration scripted and tested. |
| Cognito users must re-register | Only 2 sign-ups + family testers. Notified directly. New Cognito pool from IaC proves repeatability. |
| Salt restoration fails | Salt restore scripted and verified. Script handles re-encryption if needed. |
| Repository migration breaks builds | Each repo deployed and tested before removing from submit. Archive-and-overlay preserves working state. |
| Old www URLs break | CloudFront Function handles redirects. 301s preserve SEO. |
| Root repo becomes SPOF for DNS | DNS records are durable -- a broken root deploy doesn't affect existing records. |
| Backup account compromised | Vault is receive-only. No application code. Restricted SSO after setup. |

---

## 5. Related Documents

- `AWS_ARCHITECTURE.md` -- current architecture and stack structure
- `AWS_COSTS.md` -- detailed cost analysis and optimization
- `AWS_CROSS_ACCOUNT_BACKUPS.md` -- Phase 3 backup strategy

---

*Completed: February 2026. Source: `PLAN_ACCOUNT_SEPARATION.md` (v2.0)*
