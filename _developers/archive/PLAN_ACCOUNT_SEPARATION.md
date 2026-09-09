<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# AWS Account & GitHub Repository Separation Plan

**Version**: 2.0 | **Date**: February 2026 | **Status**: In progress

---

## User Assertions (non-negotiable)

1. **Accounts before repos** — account separation happens first, while all code remains in this single repository. It is much easier to search-and-replace globally and synchronise changes in one repository and one commit.
2. **No oidc.antonycc.com** — references to oidc.antonycc.com have been removed from this repository. Each AWS account gets its own OIDC provider trusting GitHub's `token.actions.githubusercontent.com`, scoped to `repo:antonycc/submit.diyaccounting.co.uk:*`.
3. **Migration order**: gateway+spreadsheets accounts first (CI then prod), then submit CI to its own account, then submit prod to a NEW account (proving IaC repeatability), all from this repo. Then root → new repo. Then gateway and spreadsheets → their destination repos.
4. **Repository destinations**: `antonycc/www.diyaccounting.co.uk` for gateway (right name), `antonycc/diy-accounting` for spreadsheets (has existing users/discussions to preserve).
5. **Billing**: management account (887764105431) is the single place to look, but each account should display its own usage.
6. **Console access**: single set of credentials via IAM Identity Center (SSO), not separate IAM users per account.
7. **Backups**: submit-backups account receives copies from submit-ci and submit-prod. Restore testing by standing up a prod-replica in CI (including user sub hash salt).
8. **IaC repeatability** — 887764105431 becomes a clean management account. Submit prod is deployed fresh to a new account from IaC. Salt + backups + code = recovery from total loss. This proves disaster recovery while prod has negligible user data (2 sign-ups and family testers).

---

## Current State

Production is live:
- https://diyaccounting.co.uk/ (gateway) — **migrated to 283165661847** ✅
- https://spreadsheets.diyaccounting.co.uk/ — **migrated to 064390746177** ✅
- https://submit.diyaccounting.co.uk/ — **migrated to 972912397388** ✅

All workloads migrated. Gateway, spreadsheets, submit-ci, and submit-prod all in their own accounts. Deploy #22257323730 from accounts branch: 142 passed, 0 failed. Phase 1 complete (accounts separated, 887764105431 cleaned to management-only). Phase 2.1 complete (root repo separated). Next: Phase 2.2 (gateway repo), Phase 2.3 (spreadsheets repo).

### Account structure (current)

```
887764105431 ── management-only: Route53 zone, CDK bootstrap, OIDC, SSO ✅ (clean)
283165661847 ── gateway (CI + prod) ✅
064390746177 ── spreadsheets (CI + prod) ✅
367191799875 ── submit-ci ✅
972912397388 ── submit-prod ✅
914216784828 ── submit-backup (created, Phase 3)
```

### Repository structure (current)

```
antonycc/root.diyaccounting.co.uk     ── Route53, holding page → 887764105431 ✅ (Phase 2.1)
antonycc/submit.diyaccounting.co.uk   ── submit + gateway + spreadsheets (this repo)
antonycc/www.diyaccounting.co.uk      ── gateway (Phase 2.2 — repo built, pending OIDC + first deploy)
antonycc/diy-accounting               ── spreadsheets (Phase 2.3 — pending)
```

### Account structure (target)

```
AWS Organization Root (887764105431) ── Management
├── gateway ─────────── Workloads OU (Phase 1.1)
├── spreadsheets ────── Workloads OU (Phase 1.2)
├── submit-ci ──────────── Workloads OU (Phase 1.3)
├── submit-prod ─────────── Workloads OU (Phase 1.4)
├── submit-backup ─────── Backup OU (Phase 3)
```

887764105431 retains only: AWS Organizations, IAM Identity Center, Route53 zone (`diyaccounting.co.uk`), consolidated billing, root DNS stack, holding page. No application workloads.

---

## Phase 1: Account separation (single repository)

**Goal**: Move every workload out of 887764105431 into purpose-built accounts while all code remains in this one repository. 887764105431 becomes a clean management account.

**Why accounts before repos**: A single commit can update workflows, CDK config, and environment files atomically. No cross-repo coordination, no version skew, no "deploy repo A before repo B" ordering. Repository separation is safer once each service already deploys to its final account — the repo split is then purely a code extraction with no infrastructure changes.

**Why migrate submit prod to a new account**: This proves the IaC is repeatable. If we can stand up submit prod from scratch in a fresh account using only code + backups + salt, then we have validated disaster recovery. Now is the ideal time — prod has negligible user data (2 sign-ups and family testers), so the cost of re-registration is near zero.

### 1.0: AWS Organization and IAM Identity Center

| Step | Description | Details |
|------|-------------|---------|
| 1.0.1 | Create AWS Organization | From 887764105431. This account becomes the permanent management account. |
| 1.0.2 | Create Organizational Units | `Workloads` OU (for gateway, spreadsheets, submit-ci, submit-prod), `Backup` OU (for submit-backup). |
| 1.0.3 | Enable IAM Identity Center | In 887764105431 (management account). This gives you a single SSO portal for all accounts. |
| 1.0.4 | Create SSO user | Create your identity in IAM Identity Center (or connect an external IdP later). |
| 1.0.5 | Create permission sets | `AdministratorAccess` (full access), `ReadOnlyAccess` (investigation), `DeploymentAccess` (CDK deploys — custom policy). |
| 1.0.6 | Assign permissions | Assign your SSO user + `AdministratorAccess` to 887764105431 and each account as they are created. |

### 1.1: Gateway account separation ✅ COMPLETE

Gateway (CI + prod) fully migrated to 283165661847. See `PLAN_AWS_CLICKS.md` Phase 1.1 for detailed clickthrough log.

### 1.2: Spreadsheets account separation ✅ COMPLETE

Spreadsheets (CI + prod) fully migrated to 064390746177. See `PLAN_AWS_CLICKS.md` Phase 1.2 for detailed clickthrough log.

### 1.3: Submit CI account separation ✅ COMPLETE

Move submit CI deployments into their own account (367191799875).

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| 1.3.1 | Create `submit-ci` account | ✅ | Account 367191799875, Workloads OU |
| 1.3.2 | Assign SSO access | ✅ | AdministratorAccess assigned |
| 1.3.3 | CDK bootstrap | ✅ | us-east-1 and eu-west-2 bootstrapped |
| 1.3.4 | Create OIDC provider | ✅ | Trust: `repo:antonycc/submit.diyaccounting.co.uk:*` |
| 1.3.5 | Create deployment roles | ✅ | `submit-ci-github-actions-role` and `submit-ci-deployment-role` |
| 1.3.6 | Create ACM certs | ✅ | us-east-1: `bd4b7bf4...` (*.submit, ci-submit, ci-holding), eu-west-2: `de2a24a1...` (*.submit, ci-submit) |
| 1.3.7 | Replicate Secrets Manager entries | ✅ | Not needed — `deploy-environment.yml` `create-secrets` job creates all secrets automatically from GitHub Actions secrets |
| 1.3.8 | Add GitHub environment variables | ✅ | Environment-scoped `SUBMIT_*` vars (ci + prod envs), repo-level `ROOT_*` vars |
| 1.3.9 | Update ALL workflow files | ✅ | Removed every hardcoded 887764105431 reference from ~20 workflow files. Uses `vars.SUBMIT_*` (environment-scoped) and `vars.ROOT_*` (repo-level). `ROOT_HOSTED_ZONE_ID` for Route53 zone. |
| 1.3.10 | Update CDK context + .env.ci | ✅ | `.env.ci`: all Secrets Manager ARNs → 367191799875, added cert ARN env vars. Java CDK: added `envOr()` for cert ARNs in `SubmitEnvironment.java` and `SubmitApplication.java`. CI test fixtures updated. CLAUDE.md: added accounts table, switched to SSO profiles. |
| 1.3.11 | Deploy CI environment stacks | ✅ | Deployed to submit-ci (367191799875). All env stacks live. |
| 1.3.12 | Deploy CI application stacks | ✅ | All app stacks deployed (`ci-accounts-app-*`). |
| 1.3.13 | Update root DNS for CI submit | ✅ | `set-origins` job passed. Fixed cross-account Route53: action now switches from submit credentials to root credentials for Route53, then restores submit credentials for API Gateway. |
| 1.3.14 | Validate CI | ✅ | All 18 CI synthetic behaviour tests passing. All 17 simulator tests passing. Run #22208132155 clean (only `npm test cdk prod` fails — expected, Phase 1.4). |
| 1.3.15 | Tear down old CI stacks | ✅ | All CI stacks already deleted from 887764105431 |
| 1.3.16 | Merge `accounts` to `main` | BLOCKED by 1.4 prod validation | **Cannot merge yet.** Prod GitHub env vars (`SUBMIT_*`) still point to 887764105431. Merging to `main` triggers a prod deploy which would apply the `accounts` branch's bucket name changes to the existing prod stacks — CloudFormation would replace live S3 buckets, destroying the prod site. **Strategy**: run Phase 1.4 workflows from the `accounts` branch targeting prod (new account 972912397388), validate prod, then merge to `main`. |

**Issues found and fixed during CI validation:**

| Issue | Root cause | Fix | Commit |
|-------|-----------|-----|--------|
| CDK build: cross-environment bucket reference | `OriginBucket` in EdgeStack (us-east-1) had no explicit physical name. SelfDestructStack (eu-west-2) couldn't resolve it cross-region. | Added `PhysicalName.GENERATE_IF_NEEDED` to the bucket. | `1715f2bf` |
| Route53 AccessDenied in `set-origins` | `deploy.yml` used submit-ci credentials for everything, but Route53 is in the management account (887764105431). | Added cross-account credential switching to the `set-origins` composite action. | `3f40cacd` |
| API Gateway domain conflict | `ci-submit.diyaccounting.co.uk` custom domain already existed in 887764105431 (globally unique per region). | Manually deleted from old account via `aws apigatewayv2 delete-domain-name`. | Manual |
| S3 bucket name mismatch in workflows | Workflows constructed bucket names as `${deployment}-app-origin-us-east-1` but CDK now generates unique names with `PhysicalName.GENERATE_IF_NEEDED`. | Replaced hardcoded names with CloudFormation output lookup from EdgeStack in 4 files. | `11b6ab70` |
| Simulator tests: missing `hmrcTokenScope` | HMRC scope enforcement (PLAN_HMRC_SCOPES_REQUIRED.md) added scope checking but simulator injection didn't set `hmrcTokenScope` in sessionStorage. | Added `hmrcTokenScope` to simulator demo user injection. | `4e0b3c5b` |
| CI synthetic tests: HMRC auth redirect missed | Scope enforcement fetches catalogue asynchronously before OAuth redirect (~7s). Inline test code waited only 1s, missing the redirect entirely. | Replaced fixed timeout with locator wait for HMRC auth page or receipt. | `7b141936` |
| CDK prod test: Cognito lookup fails | `npm test cdk prod` looks up `prod-auth.diyaccounting.co.uk` Cognito domain, which doesn't exist yet in submit-prod (972912397388). | Will resolve itself when prod is deployed (Phase 1.4). Not blocking CI. | — |

**Key design decision**: `SUBMIT_*` variables are GitHub Actions **environment-scoped** (different values for `ci` vs `prod` environments), while `ROOT_*`, `GATEWAY_*`, `SPREADSHEETS_*` are **repo-level** (same account for CI and prod). This means workflow code uses `vars.SUBMIT_ACCOUNT_ID` everywhere — no conditionals needed.

**ROOT workflow migration**: Done as part of step 1.3.9. `deploy-root.yml` and `deploy-holding.yml` now use `vars.ROOT_ACTIONS_ROLE_ARN` / `vars.ROOT_DEPLOY_ROLE_ARN`, ensuring they are unaffected when `SUBMIT_*` vars change for Phase 1.4.

**Issues found and fixed during prod validation (Phase 1.4):**

| Issue | Root cause | Fix | Alternatives considered | Commit |
|-------|-----------|-----|------------------------|--------|
| Wrong AWS credentials (ci instead of prod) | Every job's `environment:` key used `github.ref == 'refs/heads/main' && 'prod' || 'ci'`. When deploying from the `accounts` branch with `environment-name=prod`, all jobs resolved to `ci` environment, getting submit-ci (367191799875) credentials instead of submit-prod (972912397388). CDK used the wrong account, ACM certs not found. | `params` job now resolves `github-environment` from the explicit `environment-name` input (falling back to branch). All downstream jobs reference `needs.params.outputs.github-environment` or `needs.names.outputs.environment-name` instead of re-deriving from `github.ref`. Applied to `deploy-environment.yml` and `deploy-cdk-stack.yml`. ~47 occurrences in other workflows remain (will be fixed when those workflows are used for prod). | Could have merged to `main` first so branch-based logic works, but that risks deploying to old prod in 887764105431 before new account is validated. | `491d8b04` |
| CloudFront CNAME conflict (simulator + holding) | CloudFront CNAME aliases are globally unique. Old prod distributions in 887764105431 still owned `prod-simulator.diyaccounting.co.uk` (dist `EXVMGISUNTRHN`) and `prod-holding.diyaccounting.co.uk` (dist `E21CED3ZEMERBD`). New stacks in 972912397388 couldn't create distributions with the same CNAMEs. | Removed CNAME aliases from the two old distributions in 887764105431 (set aliases to empty, switched to CloudFront default certificate). Old distributions still exist but are no longer reachable by custom domain. | Could have torn down old prod stacks entirely (Phase 1.5), but that's premature — old prod should stay until new is fully validated. Could have changed the new stacks to use different CNAMEs temporarily, but that defeats the purpose of proving IaC repeatability. | Manual (AWS CLI) |
| Cross-account Route53 access denied | ApexStack and SimulatorStack create Route53 A/AAAA alias records via CDK `AwsCustomResource`. The Lambda runs in 972912397388 but Route53 is in 887764105431. The code already supports cross-account via `ROOT_ROUTE53_ROLE_ARN` env var, but `.env.prod` was missing this variable. `.env.ci` had it (added during Phase 1.3). | Added `ROOT_ROUTE53_ROLE_ARN=arn:aws:iam::887764105431:role/root-route53-record-delegate` to `.env.prod`. The role already trusts both 367191799875 and 972912397388. | Could have removed DNS record creation from env stacks and handled via `set-origins` job, but the existing cross-account role pattern is cleaner and keeps DNS creation atomic with the stack. | Pending commit |
| BackupStack: DynamoDB GSI still creating | BackupStack depends on DataStack and re-deploys it. The `prod-env-passes` table's `issuedBy-index` GSI was still being created when BackupStack tried to update DataStack. Transient timing issue — GSI creation takes a few minutes. | Resolved on third run — by then the GSI had finished creating. No code change needed. | Could add a wait/retry in the CDK custom resource, but the issue is transient and self-healing on re-run. |  — |
| Cognito custom domain conflict | Cognito custom domains are globally unique (like CloudFront CNAMEs). Old prod user pool in 887764105431 (`eu-west-2_MJovvw6mL`) owned `prod-auth.diyaccounting.co.uk`. New IdentityStack in 972912397388 couldn't create a user pool with the same custom domain. | Removed custom domain from old Cognito user pool in 887764105431 via `aws cognito-idp delete-user-pool-domain`. Old user pool still exists but is no longer reachable by custom domain. | Could wait for Phase 1.5 teardown, but IdentityStack is blocking the rest of the deployment. | Manual (AWS CLI) |
| Cognito domain: stale Route53 records | After removing the custom domain from the old user pool, Route53 A/AAAA records for `prod-auth.diyaccounting.co.uk` still pointed to the old (now defunct) Cognito CloudFront distribution `d1yuj3kt2v4b8h.cloudfront.net`. Cognito returned "Invalid request provided: AWS::Cognito::UserPoolDomain" when creating the new custom domain. | Deleted the stale A/AAAA alias records from Route53 in 887764105431. CDK `Route53AliasUpsert` re-creates them pointing to the new Cognito CloudFront endpoint. | Could wait for DNS TTL expiry, but Cognito validates DNS state on domain creation. | Manual (AWS CLI) |
| `npm test cdk-ci` wrong credentials | `npm-test-cdk-ci` job used `environment: ${{ needs.params.outputs.github-environment }}` which resolved to `prod` when deploying prod from `accounts` branch. CI CDK test needs CI account credentials to look up CI Cognito. | Hardcoded `environment: ci` for `npm-test-cdk-ci` and `environment: prod` for `npm-test-cdk-prod`. These CDK synthesis tests always target their respective accounts regardless of the deploy's target environment. | Could have kept dynamic resolution but excluded CDK test jobs, but hardcoding is simpler and correct — these tests always need their own account's resources. | `17d783b0` |
| `destroy.yml` scanning both accounts | Single destroy workflow scanned both ci- and prod-prefixed stacks in one account. With accounts separated, each destroy needs its own account's credentials. | Split into `destroy-ci.yml` (hardcoded `environment: ci`, schedule `:34 2,4,6,8,10,12`) and `destroy-prod.yml` (hardcoded `environment: prod`, schedule `:04 3,5,7,9,11,13`). Updated `deploy.yml` to call `destroy-prod.yml`. | Could have kept a single workflow with matrix strategy, but separate files are simpler and each can be triggered independently. | `17d783b0` |
| CloudFront CNAME conflict (submit apex) | `set-origins` failed with `CNAMEAlreadyExists` — distribution `E3MECWCY0HNL8J` (old prod `prod-4c05746`) in 887764105431 still owned `submit.diyaccounting.co.uk`, `prod-submit.diyaccounting.co.uk`, `prod-4c05746.submit.diyaccounting.co.uk`. | Removed all 3 CNAME aliases from old distribution and switched to CloudFront default cert (same pattern as simulator/holding fix). | Same pattern as issue #2 above. Old distributions kept alive for rollback but no longer reachable by custom domain. | Manual (AWS CLI) |
| API Gateway domain "already exists" on re-run | `set-origins` API GW domain transfer: `create-domain-name` fails with "already exists" if domain was created by a previous run. The `get-domain-names` check can fail silently due to rate limiting (`2>/dev/null`), so it doesn't find the existing domain and skips the delete-first path. | Made `create-domain-name` handle "already exists" as success — if the domain already exists, proceed to mapping instead of failing. | Could also make the `get-domain-names` check retry on failure, but handling "already exists" in create is simpler and idempotent. | Pending commit |
| TTL disabled on all DynamoDB tables | All 11 tables in both accounts had TTL disabled. HMRC API requests (19,691 items, 48 MB) growing unbounded. Async request tables (1-hour TTL written but not enforced) accumulating stale data. | Added `ensureTimeToLive()` CDK utility. Enabled TTL on 8 tables in DataStack (hmrc-api-requests, bundles, 5 async-request tables, receipts). Changed HMRC API request TTL from 1 month → 28 days. Batch update complete: all 19,691 records set to 1-day expiry. | PITR also disabled everywhere — separate concern for Phase 3 (backup strategy). | `a38f21b0` |
| Lambda reserved concurrency exhaustion | New account (972912397388) has 400 Lambda concurrent executions limit. Each function reserves 5. Old deployment `prod-a38f21b` (32 functions × 5 = 160) + new deployment trying to allocate another 160 exceeded the limit minus 40 minimum unreserved. | Old deployments destroyed to free reserved concurrency. Account now has 8 env functions, 400 unreserved. | Could request quota increase (400 → 1000), but destroying stale deployments is the right fix. Future deploys won't have this issue — only one app deployment at a time. | Manual |
| API Gateway custom domain conflict (prod apex) | `prod-submit.diyaccounting.co.uk` and `submit.diyaccounting.co.uk` still existed as API GW custom domains in 887764105431. API GW custom domains are globally unique per region — `create-domain-name` in 972912397388 failed with "already exists". Same pattern as CI domain conflict (1.3). | Deleted both domains from old account via `aws --profile management apigatewayv2 delete-domain-name`. | Part of Phase 1.5 cleanup, but was blocking 1.4.20 validation. | Manual (AWS CLI) |
| Destroy sweepers broken (Route 53 in wrong account) | `destroy-ci.yml` and `destroy-prod.yml` fail at "Get the public record names" with `No hosted zone found for diyaccounting.co.uk.` — Route 53 zone is in management account (887764105431), but sweepers query with submit-account credentials. Sweepers have been completely broken since account separation (never successfully select stacks for destruction). | Added cross-account credential switching: assume `ROOT_ACTIONS_ROLE_ARN` → `ROOT_DEPLOY_ROLE_ARN` before Route 53 query, restore `SUBMIT_*` credentials after. Same pattern as `set-origins` in deploy.yml. | Could make the Route 53 check non-fatal (rely on SSM last-known-good + CloudFront aliases for protection), but cross-account fix is correct and consistent. | Pending commit |

### 1.4: Submit prod to new account (IaC repeatability proof)

Create a NEW submit-prod account and deploy the full production stack from IaC. Restore data from backups. This proves disaster recovery: salt + backups + code = full recovery.

**Pre-requisites**: Back up everything from 887764105431 before starting. The existing prod in 887764105431 stays live until the new account is validated and DNS is switched.

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| | **Preparation** | | |
| 1.4.1 | Back up prod data | ✅ | 11/11 tables backed up (prefix `pre-migration-20260221`), all AVAILABLE. Salt metadata exported. No Path 3 DynamoDB salt item in prod (not configured yet — Path 1 Secrets Manager is primary). Script: `scripts/aws-accounts/backup-prod-for-migration.sh`. |
| 1.4.2 | Document secrets | ✅ | 9 prod secrets found in 887764105431 matching expected list. 2 customer-managed KMS keys (`prod-env-backup`, `prod-env-salt-encryption`). Script: `scripts/aws-accounts/list-prod-secrets.sh`. |
| 1.4.3 | Document ACM certs | ✅ | Old account has 4 certs in us-east-1 (main `d340de40`, auth `8750ac93`, simulator `5b8afa59`, wildcard `b23cd904`) and 4 in eu-west-2 (main `1f9c9a57`, auth `2b09cb4f`, simulator `7ae3bc98`, wildcard `77810f99`). Old certs bundle CI+prod SANs together; new account gets prod-only certs. |
| | **Account creation** | | |
| 1.4.4 | Create `submit-prod` account | ✅ | Account 972912397388, Workloads OU. |
| 1.4.5 | Assign SSO access | ✅ | AdministratorAccess assigned, `submit-prod` SSO profile working. |
| 1.4.6 | CDK bootstrap | ✅ | us-east-1 and eu-west-2 bootstrapped. |
| 1.4.7 | Create OIDC provider | ✅ | Trust: `repo:antonycc/submit.diyaccounting.co.uk:*`. |
| 1.4.8 | Create deployment roles | ✅ | `arn:aws:iam::972912397388:role/submit-prod-github-actions-role`, `arn:aws:iam::972912397388:role/submit-prod-deployment-role`. |
| | **Certificates** | | |
| 1.4.9 | Create ACM certs | ✅ | us-east-1: `arn:aws:acm:us-east-1:972912397388:certificate/e465ad23-baf8-4b5c-94a4-33f73a266ec6` (*.submit, prod-submit, submit, prod-auth, prod-holding, prod-simulator). eu-west-2: `arn:aws:acm:eu-west-2:972912397388:certificate/eea7a266-4b80-42d9-9d10-39af2455ce5b` (*.submit, prod-submit, submit). Both ISSUED. |
| | **Secrets** | | |
| 1.4.10 | Copy Secrets Manager entries | ✅ | 9/9 secrets copied from 887764105431 to 972912397388. Note: Stripe webhook secrets may need updating after deployment (new CloudFront URLs). Script: `scripts/aws-accounts/copy-secrets-to-account.sh`. |
| | **Deploy from IaC** | | |
| 1.4.11 | Update GitHub environment variables | ✅ | All 5 `prod` environment variables updated: `SUBMIT_ACCOUNT_ID` (972912397388), `SUBMIT_ACTIONS_ROLE_ARN` (`submit-prod-github-actions-role`), `SUBMIT_DEPLOY_ROLE_ARN` (`submit-prod-deployment-role`), `SUBMIT_CERTIFICATE_ARN` (`e465ad23...`), `SUBMIT_REGIONAL_CERTIFICATE_ARN` (`eea7a266...`). Previous values (887764105431) replaced. |
| 1.4.12 | Update `deploy.yml` | ✅ | No code changes needed — already uses `vars.SUBMIT_*` (environment-scoped). Step 1.4.11 variable update is sufficient. |
| 1.4.13 | Update `deploy-environment.yml` | ✅ | No code changes needed — already uses `vars.SUBMIT_*` (environment-scoped). Step 1.4.11 variable update is sufficient. |
| 1.4.14 | Update CDK context + .env.prod | ✅ | Updated `cdk-application/cdk.json` (3 cert ARNs), `cdk-environment/cdk.json` (3 cert ARNs), `.env.prod` (8 Secrets Manager ARNs) from 887764105431 → 972912397388. All use single us-east-1 cert (all SANs combined). `npm test` (949 passed) and `./mvnw clean verify` (BUILD SUCCESS) both pass. |
| 1.4.15 | Deploy prod environment stacks | ✅ | All 10 environment stacks deployed to 972912397388: ObservabilityStack, ObservabilityUE1Stack, DataStack, EcrStack, EcrUE1Stack, ActivityStack, BackupStack, SimulatorStack, ApexStack, IdentityStack. Run #22248369483 (30/30 jobs passed). See "Issues found and fixed during prod validation" above for 5 issues resolved. |
| 1.4.16 | Deploy prod application stacks | ✅ | Run #22249290173: 124 passed, 14 failed, 21 skipped. All app stacks deployed to 972912397388: AuthStack, AccountStack, BillingStack, HmrcStack, ApiStack, EdgeStack, PublishStack. CloudFront aliases set. Failures: `npm test cdk-ci` (wrong env, fixed `17d783b0`), `set-origins` (API GW "already exists", fix pending), 12 synthetic tests (cascading from set-origins — API endpoints unreachable via custom domain). Re-run needed after push. Environment fix applied to all remaining workflows. `destroy.yml` split into `destroy-ci.yml` + `destroy-prod.yml`. |
| | **Data restoration** | | |
| 1.4.17 | Restore DynamoDB tables | ✅ | Cross-account scan+batch-write from 887764105431 to 972912397388. Script: `scripts/aws-accounts/restore-tables-from-backup.sh` (rewritten for cross-account). All 5 tables copied: receipts (1,156), bundles (1,035), hmrc-api-requests (19,691 / 48 MB), passes (1,181), subscriptions (30). |
| 1.4.17a | Enable TTL on DynamoDB tables | ✅ | **Finding**: TTL was DISABLED on ALL 11 tables in both accounts. PITR also disabled everywhere. **Fix**: CDK `ensureTimeToLive()` utility added to KindCdk.java. TTL enabled in DataStack for 7 tables (hmrc-api-requests, bundles, 5 async-request tables). Code changed: HMRC API requests TTL from 1 month → 28 days (`calculateTwentyEightDayTtl`). TTL enabled on `prod-env-hmrc-api-requests` table. Batch update complete: all 19,691 existing records set to 1-day expiry (~6.5h, ~3,100 items/hr sequential update-item). DynamoDB will delete expired records within ~48 hours. Script: `scripts/aws-accounts/set-ttl-on-existing-records.sh`. |
| 1.4.18 | Restore salt | ✅ | Path 1 (Secrets Manager): `prod/submit/user-sub-hash-salt` copied from 887764105431 → 972912397388, verified MATCH. Valid registry with 2 versions (current: v2). Path 3 (DynamoDB + KMS): not configured in source — will be created when migration 003 runs in the new account. Script bug fixed (unbound `TARGET_TABLE_STATUS` when Step 2 skips). Script: `scripts/aws-accounts/restore-salt.sh`. |
| | **DNS cutover** | | |
| 1.4.19 | Update root DNS for prod submit | ✅ | Root DNS deploy run #22249618225 succeeded. Zone re-exported (238 records). Route53 records upserted for `submit.diyaccounting.co.uk` and `prod-submit.diyaccounting.co.uk` pointing to new CloudFront. CloudFront CNAME aliases removed from old distribution `E3MECWCY0HNL8J` in 887764105431. |
| 1.4.20 | Validate prod | ✅ | Deploy #22257323730: **142 passed, 0 failed, 20 skipped.** All CDK stacks deployed, set-origins succeeded, all 13 prod synthetic behaviour tests passed. API Gateway custom domains created in 972912397388 after deleting from 887764105431. Previous failures: #22250204833 (set-origins race with nightly main deploy), #22251503776 (Lambda concurrency), #22256295510 (API GW domain conflict). |
| 1.4.21 | Notify users | | Inform the 2 sign-ups + family testers that they need to re-register (new Cognito pool). |

#### DynamoDB data profile and cost analysis (Phase 1.4 migration)

**Table sizes in submit-prod (972912397388) — February 2026:**

| Table | Items | Size | Unique Users | Billing |
|-------|------:|-----:|-------------:|---------|
| prod-env-hmrc-api-requests | 19,691 | 46.0 MB | 905 | PAY_PER_REQUEST |
| prod-env-receipts | 1,156 | 384 KB | 852 | PAY_PER_REQUEST |
| prod-env-passes | 1,182 | 367 KB | — | PAY_PER_REQUEST |
| prod-env-bundles | 1,035 | 285 KB | — | PAY_PER_REQUEST |
| prod-env-subscriptions | 30 | 10 KB | 24 | PAY_PER_REQUEST |
| 5 × async-request tables | 0 | 0 | — | PAY_PER_REQUEST |
| **Total** | **23,094** | **~47.1 MB** | | |

**User analysis**: 905 distinct users (by hashedSub) generated 19,691 HMRC API request records = ~22 API calls per user lifetime. With 24 active subscriptions and 30 subscription records, real paying users are very few. Most of the 905 users are sign-ups who made a few HMRC API calls (obligation checks) then left.

**Cost of the cross-account migration (one-off)**:
- Scan (source, 887764105431): ~23,094 RCUs → ~$0.007
- Batch-write (dest, 972912397388): ~23,094 WCUs → ~$0.034
- TTL batch update (19,691 update-item calls): ~$0.029
- **Total migration DynamoDB cost: ~$0.07**
- **Migration time**: Data copy ~20 min (batch-write-item at 25 items/batch). TTL batch update ~6.5 hours (sequential update-item, ~3,100 items/hr).

**Monthly storage cost**: 47.1 MB × $0.2968/GB = ~$0.014/month

**Scaling projections (with 28-day TTL on hmrc-api-requests)**:
- Current ~22 API calls/user lifetime → with TTL, only last 28 days retained
- Estimated ~5 API calls per user per monthly VAT session
- At 1,000 monthly active users: ~5,000 live records, ~12 MB → $0.004/month storage
- At 10,000 monthly active users: ~50,000 live records, ~120 MB → $0.036/month storage
- At 100,000 monthly active users: ~500,000 live records, ~1.2 GB → $0.36/month storage
- DynamoDB on-demand read/write costs scale linearly but remain negligible until ~100K+ users

### 1.5: Clean up 887764105431 (make it management-only)

#### Inventory of resources remaining in 887764105431 (as of 2026-02-21)

**CloudFormation stacks (3):**
- `CDKToolkit` — keep (needed for root DNS/holding deploys)
- `prod-env-BackupStack` — tear down
- `prod-env-DataStack` — tear down (has 38 DynamoDB tables — 11 prod-env-*, 11 ci-env-*, 16 legacy-named)

**CloudFront distributions (9):**
- `E3VBOLA04TMMN0` — `old-www.submit.diyaccounting.co.uk` (legacy S3 origin)
- `EW310RS705OLC` — `www.stage.diyaccounting.co.uk`, `stage.diyaccounting.co.uk` (staging)
- `E1JZ7PA80QQ7NE` — `prod-bab0022.submit.diyaccounting.co.uk` (old deployment)
- `E26KUZNPFIMNI1` — `prod-9531d17.submit.diyaccounting.co.uk` (old deployment)
- `E3VC3J8EWJ541F` — `prod-39cb5d3.submit.diyaccounting.co.uk` (old deployment)
- `E1L9BGS0YJH61A` — `prod-d51c346.submit.diyaccounting.co.uk` (old deployment)
- `E2C6KXBWV4RNC6` — `prod-8caf293.submit.diyaccounting.co.uk` (old deployment)
- `E2MVQZJ1DET1F` — `ci-refresh.submit.diyaccounting.co.uk` (old CI deployment)
- `ETMWP0TSWEONI` — `prod-0d69dfd.submit.diyaccounting.co.uk` (old deployment)

**DynamoDB tables (38):** 11 `prod-env-*`, 11 `ci-env-*`, 16 legacy-named (`submit-diyaccounting-co-uk-*`, `ci-submit-diyaccounting-co-uk-*`). All data has been copied to 972912397388. Tables protected by pre-migration backups (prefix `pre-migration-20260221`).

**Secrets Manager (20):** 10 `prod/submit/*`, 10 `ci/submit/*`. All copied to respective new accounts.

**ACM certificates:** us-east-1: 10 certs (submit, stage, gateway, spreadsheets domains). eu-west-2: 4 certs (submit, auth, simulator domains). Gateway and spreadsheets certs are used by their account stacks via DNS validation — do NOT delete until those accounts have their own certs.

**Lambda functions (3):** `prod-4c05746-app-ApiStack-*` (old app stack custom resource), `prod-env-BackupStack-*`, `prod-env-DataStack-*` (env stack custom resources).

**IAM roles (4):** `submit-deployment-role`, `submit-github-actions-role` (old OIDC deploy), `root-route53-record-delegate` (keep — cross-account DNS), `root-RootDnsStack-*` (keep — root DNS custom resource).

**Route53:** 1 hosted zone `diyaccounting.co.uk` — **keep permanently** (management account owns DNS).

**Cognito:** No user pools remaining (old pool's custom domain already deleted).

**API Gateway:** No custom domains remaining (deleted during 1.4.20).

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| 1.5.0 | Export root zone and organization structure | ✅ | Exported 236 Route53 records to `root-zone/` (zone.json, zone.bind, manual-records.json, organization.json). Identified 5 manually-managed records (email MX/SPF/DKIM, webmail CNAME, Google site verification) not in any CDK stack. Export script: `scripts/aws-accounts/export-root-zone.sh`. |
| 1.5.1 | Tear down old prod stacks | ✅ | All cleaned from 887764105431: 9 CloudFront distributions deleted, `prod-env-DataStack` and `prod-env-BackupStack` CloudFormation stacks deleted (manually), 38 DynamoDB tables deleted (11 ci-env, 11 prod-env, 8 ci-submit-diyaccounting-co-uk, 8 submit-diyaccounting-co-uk). Only `CDKToolkit` stack remains. |
| 1.5.2 | Delete old ACM certs | ✅ | All 14 ACM certs deleted from 887764105431 (4 eu-west-2, 10 us-east-1). Gateway/spreadsheets distributions already migrated to their own accounts (283165661847, 064390746177) with their own certs. Management account now has zero ACM certs in both regions. |
| 1.5.3 | Delete old Secrets Manager entries | ✅ | All 20 secrets force-deleted from 887764105431: 9 `ci/submit/*`, 9 `prod/submit/*`, 2 unprefixed `/submit/*`. Management account now has zero secrets. |
| 1.5.4 | Remove old OIDC provider and roles | ✅ | Deleted `submit-github-actions-role`, `submit-deployment-role`, and 7 legacy roles (`diya-console-via-google`, `diyaccounting-co-uk-account-*` ×3, `EC2ManagedRole`, `lambda_exec_role`, `static-site-deploy`). Deleted 5 customer-managed policies, 3 instance profiles, 1 empty S3 bucket (`live-www-diyaccounting-co-uk-logs`). Kept: `root-route53-record-delegate`, OIDC provider, CDK bootstrap roles. Also deleted 10 legacy IAM users (with access keys, login profiles) and 7 IAM groups (pre-SSO era). |
| 1.5.5 | Verify management-only state | ✅ | Verified. 887764105431 contains only: CDKToolkit stack, CDK bootstrap roles (10), OIDC provider, `root-github-actions-role`, `root-deployment-role`, `root-route53-record-delegate`, `root-RootDnsStack-*` custom resource role, Route53 zone, CDK asset buckets (2), SSO roles (2), AWS service-linked roles (16). Zero: DynamoDB tables, Lambda functions, CloudFront distributions, secrets, ACM certs, customer-managed policies, IAM users, IAM groups. |
| 1.5.6 | Update OIDC trust for root DNS | ✅ | OIDC provider already existed. Created `root-github-actions-role` (OIDC trust for `repo:antonycc/submit.diyaccounting.co.uk:*`) and `root-deployment-role` (scoped to CDK + Route53 + S3 + CloudFront + ACM + SSM). Updated GitHub vars `ROOT_ACTIONS_ROLE_ARN` and `ROOT_DEPLOY_ROLE_ARN` to new role ARNs. Old submit roles deleted in 1.5.4. |

### Cross-account DNS validation

All new accounts' ACM certs need DNS validation. The Route53 zone stays in 887764105431 (management account) — this is architecturally correct.

1. Request the cert in the new account
2. Copy the ACM DNS validation CNAME values
3. Create them in 887764105431's Route53 zone (via `deploy-root.yml` or manually)
4. ACM validates and issues the cert

One-time operation per cert. ACM certs are rarely recreated.

### OIDC trust

Each new account gets its own GitHub Actions OIDC provider pointing to `token.actions.githubusercontent.com`. The trust policy is scoped to `repo:antonycc/submit.diyaccounting.co.uk:*` — because during Phase 1, this is the only repo deploying anywhere. In Phase 2 (repo separation), OIDC trust policies are updated to trust each service's own repo.

### S3 bucket name migration

S3 bucket names are globally unique across all AWS accounts. All stacks had hardcoded bucket names (e.g., `ci-gateway-origin`), which collide when deploying the same stack to a new account while the old account still has the bucket.

**Fix applied (commit `1715f2bf`):** Removed `.bucketName()` from all 7 stacks. CDK auto-generates unique names per account. For EdgeStack, the cross-stack reference (PublishStack and SelfDestructStack looked up the bucket by name via `sharedNames`) was replaced with an explicit prop passed from SubmitApplication. **Additional fix:** EdgeStack's OriginBucket required `PhysicalName.GENERATE_IF_NEEDED` because it's created in us-east-1 but referenced by SelfDestructStack in eu-west-2 — CDK can't resolve auto-generated tokens cross-environment without an explicit physical name.

**Migration pattern for each phase:**
1. Old stacks in 887764105431 remain untouched (still have hardcoded names — deployed from `main`)
2. New stacks deploy fresh to the new account with CDK-generated names — no collision
3. Old stacks are torn down after validation and DNS cutover

**Safety rule:** Do not deploy the `accounts` branch to 887764105431. The bucket name removal would cause CloudFormation to replace existing buckets. Keep 887764105431 deployments on `main` until the relevant stacks are being torn down.

See `PLAN_AWS_CLICKS.md` → "S3 bucket rename impact" for the per-stack breakdown.

### Rollback strategy

- Keep old stacks in 887764105431 until new-account versions are validated
- DNS cutover is a single alias record update via `deploy-root.yml` — rollback is running the workflow again with the old CloudFront domain
- For submit prod: old prod stays live in 887764105431 until the new account is fully validated. DNS switch is the final step. Revert DNS to roll back.

### Scripts to create

| Script | Purpose |
|--------|---------|
| `scripts/aws-accounts/backup-prod-for-migration.sh` | On-demand backup of all prod DynamoDB tables + export salt |
| `scripts/aws-accounts/list-prod-secrets.sh` | List Secrets Manager secret names/descriptions (not values) |
| `scripts/aws-accounts/copy-secrets-to-account.sh` | Copy secrets from one account to another via CLI |
| `scripts/aws-accounts/restore-tables-from-backup.sh` | Restore DynamoDB tables from backup into target account |
| `scripts/aws-accounts/restore-salt.sh` | Copy encrypted salt to new DataStack table, re-encrypt if needed |
| `scripts/aws-accounts/bootstrap-account.sh` | CDK bootstrap + OIDC provider + deployment roles for a new account |

---

## Phase 2: Repository separation

**Goal**: Each service gets its own GitHub repository with independent CI/CD, versioning, and deployment pipelines. By this point, each service already deploys to its final AWS account. The repo split is purely a code extraction — no infrastructure changes.

**Prerequisite**: Phase 1 complete (accounts separated, all deployments stable from this repo).

**Order**: Root first (thinnest slice), then gateway, then spreadsheets, then submit cleanup.

### Target repositories

| Repository | GitHub URL | Content | Source |
|---|---|---|---|
| Root | `antonycc/root.diyaccounting.co.uk` | Route53 zone, RootDnsStack, holding page | Created fresh from submit |
| Gateway | `antonycc/www.diyaccounting.co.uk` | Gateway static site, CloudFront Function redirects | Archive-and-overlay existing repo |
| Spreadsheets | `antonycc/diy-accounting` | Spreadsheets site, package hosting, knowledge base, community discussions | Archive-and-overlay existing repo |
| Submit | `antonycc/submit.diyaccounting.co.uk` | Submit application (Lambda, Cognito, DynamoDB, API GW) | This repo — remove migrated code |

**Repository naming — root repo (decided)**: `antonycc/root.diyaccounting.co.uk` — checked out at `../root.diyaccounting.co.uk`

**Note**: `antonycc/www.diyaccounting.co.uk` is being kept because it has the right name for gateway. `antonycc/diy-accounting` is being kept because it has existing users with posts in discussions that should be preserved.

### 2.1: Root → new repository ✅ COMPLETE

Root is the thinnest slice — just Route53 alias records and the holding page. Deploys to 887764105431 (management account).

| Step | Description | Status |
|------|-------------|--------|
| 2.1.1 | Create new GitHub repository | ✅ `antonycc/root.diyaccounting.co.uk` |
| 2.1.2 | Set up project: `pom.xml` (CDK only), `package.json` (CDK CLI, prettier, ncu, cfn-diagram) | ✅ |
| 2.1.3 | Copy root-relevant files from submit repo | ✅ Java files, web/holding/, cdk-root/, root-zone/, scripts, Maven wrapper, GitHub actions |
| 2.1.4 | Adapt `deploy-root.yml` → `deploy.yml`, keep `deploy-holding.yml`, add `test.yml` | ✅ |
| 2.1.5 | Update OIDC trust in 887764105431 | ✅ `root-github-actions-role` trusts `repo:antonycc/root.diyaccounting.co.uk:*` only (narrowed in 2.4.3) |
| 2.1.6 | Deploy from root repo and verify DNS | Pending — repo ready, needs first deploy |
| 2.1.7 | Verify holding page deploys from root repo | Pending — depends on 2.1.6 |
| 2.1.8 | Remove root files from submit repo | ✅ Removed: `deploy-root.yml`, `deploy-holding.yml`, `RootEnvironment.java`, `RootDnsStack.java`, `cdk-root/`, `root-zone/`, `export-root-zone.sh`. Removed `cdk-root` Maven profile, `submit-root.jar` antrun target, `cdk:synth-root` and `diagram:root` npm scripts. Updated comments in GatewayStack, SpreadsheetsStack, GatewayEnvironment, SpreadsheetsEnvironment. Kept: `web/holding/` (still used by ApexStack), `set-origins` action (still used by deploy.yml). |

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

**Quality tooling in root repo** (established as the baseline for all new repos):

| Tool | Purpose | npm script |
|------|---------|------------|
| Prettier | JS/YAML/JSON formatting | `formatting:js`, `formatting:js-fix` |
| Spotless + Palantir | Java formatting (100-col) | `formatting:java`, `formatting:java-fix` |
| npm-check-updates | Dependency updates | `update-to-minor`, `update-to-latest` |
| cfn-diagram | Architecture diagrams from CDK synth | `diagram:root` |
| actionlint | GitHub Actions workflow validation | `lint:workflows` |
| Maven update script | Java dependency updates | `update:java` |

### 2.2: Gateway → `antonycc/www.diyaccounting.co.uk`

Archive-and-overlay into the existing repo. Preserves repo settings, stars, and issue history. **Gateway becomes the template** for future static site repos.

#### Files to copy from submit repo

| Category | Files | Notes |
|----------|-------|-------|
| CDK entry point | `GatewayEnvironment.java` (82 lines) | Rename package to `co.uk.diyaccounting.gateway` |
| CDK stack | `GatewayStack.java` (358 lines) | S3 + CloudFront + OAC + CloudFront Function redirects + CloudWatch Logs |
| CDK config | `cdk-gateway/cdk.json` | Rename app jar, adjust paths |
| Shared CDK utils | `SubmitSharedNames.java`, `SubmitStackProps.java`, `Kind.java`, `KindCdk.java`, `ResourceNameUtils.java`, `Route53AliasUpsert.java`, `LambdaNames.java`, `LambdaNameProps.java` | Same subset as root repo |
| Web content | `web/www.diyaccounting.co.uk/public/` | index.html, about.html, gateway.css, lib/, favicons, robots.txt, sitemap.xml, .well-known/security.txt |
| CloudFront Function | `web/www.diyaccounting.co.uk/redirect-function.js` | 301 redirects generated from redirects.toml |
| Redirect config | `web/www.diyaccounting.co.uk/redirects.toml` | Old www URL → new URL mappings |
| Workflows | `deploy-gateway.yml` → `deploy.yml` (207 lines) | Adapt for standalone repo |
| Behaviour tests | `behaviour-tests/gateway.behaviour.test.js` | E2E tests for gateway site |
| Scripts | `build-gateway-redirects.cjs`, `build-sitemaps.cjs`, `clean-drawio.cjs`, `validate-workflows.sh`, `update-java.sh` | Gateway-specific + shared build scripts |
| Build | Maven wrapper, `.prettierrc`, `.prettierignore`, `.gitignore` | Same as root repo |
| Playwright config | `playwright.config.js` | Keep only gatewayBehaviour project |

#### Quality tooling (match root repo baseline + gateway additions)

| Tool | Purpose | npm script |
|------|---------|------------|
| Prettier | JS/YAML/JSON formatting | `formatting`, `formatting-fix` |
| Spotless + Palantir | Java formatting (100-col) | `formatting:java`, `formatting:java-fix` |
| npm-check-updates | Dependency updates | `update-to-minor`, `update-to-latest` |
| cfn-diagram | Architecture diagrams | `diagram:gateway` |
| actionlint | Workflow validation | `lint:workflows` |
| Maven update script | Java dependency updates | `update:java` |
| Playwright | Behaviour tests (ci + prod) | `test:gatewayBehaviour-ci`, `test:gatewayBehaviour-prod` |
| Pa11y / axe / Lighthouse | Accessibility + performance | `test:a11y`, `test:lighthouse` |

#### Steps

| Step | Description | Status |
|------|-------------|--------|
| 2.2.1 | In existing repo: `mkdir archive && git mv` all current files into `archive/` | Skipped — repo was nearly empty (just `.gitignore` and `.idea`) |
| 2.2.2 | Copy files from submit repo (see table above) | ✅ Web content, redirects.toml, scripts, Maven wrapper, Prettier config |
| 2.2.3 | Rename Java package from `co.uk.diyaccounting.submit` to `co.uk.diyaccounting.gateway` — move files, update all package declarations and imports | ✅ 4 Java files: GatewayEnvironment, GatewayStack, Kind, KindCdk. Package `co.uk.diyaccounting.gateway`. Unnecessary shared files removed (SubmitSharedNames, LambdaNames, etc. not imported by GatewayStack). |
| 2.2.4 | Create `pom.xml` — CDK-only, Spotless + Palantir, Maven wrapper, same structure as root repo | ✅ groupId `co.uk.diyaccounting.gateway`, artifactId `gateway`, JAR name `gateway.jar` |
| 2.2.5 | Create `package.json` — prettier, aws-cdk, npm-check-updates, cfn-diagram; scripts for build, formatting, diagrams, dependency updates | ✅ Name `@antonycc/www-diyaccounting-co-uk`, engines node >=24.0.0 |
| 2.2.6 | Create `CLAUDE.md` — based on root repo, adapted for gateway account (283165661847) | ✅ Includes template repo instructions |
| 2.2.7 | Adapt `deploy-gateway.yml` → `deploy.yml` — standalone workflow, OIDC auth with `GATEWAY_*` vars | ✅ Simplified params job (no get-names action needed) |
| 2.2.8 | Add `test.yml` workflow — build, formatting check, CDK synth | ✅ |
| 2.2.9 | Create `AWS_RESOURCES.md` and `README.md` | ✅ AWS resources catalogued from live account, README with architecture and quick start |
| 2.2.10 | Verify build: `npm install`, `./mvnw clean verify`, `npm run cdk:synth` | ✅ All pass. Certificate ARN placeholder in cdk.json for local synth (deploy workflow provides real ARN). |
| 2.2.11 | Update OIDC trust in gateway account (283165661847): add `repo:antonycc/www.diyaccounting.co.uk:*` to trust policy | ✅ `gateway-github-actions-role` trust includes `repo:antonycc/www.diyaccounting.co.uk:*` |
| 2.2.12 | Deploy from gateway repo. Run `test:gatewayBehaviour-ci`. Verify site, redirects, CSP headers. | ✅ Gateway repo deployed and live |
| 2.2.13 | Mark repo as **template repository** in GitHub Settings | ✅ Done |
| 2.2.14 | Remove gateway files from submit repo: `deploy-gateway.yml`, `GatewayStack.java`, `GatewayEnvironment.java`, `cdk-gateway/`, `web/www.diyaccounting.co.uk/`, `build-gateway-redirects.cjs`, `gateway.behaviour.test.js`, Maven `cdk-gateway` profile, npm gateway scripts, Playwright gateway project, SEO gateway tests | ✅ All removed, `npm test` + `./mvnw clean verify` pass |

#### Template repository setup

After the gateway repo is fully working, mark it as a GitHub template repository:

1. Go to `antonycc/www.diyaccounting.co.uk` → Settings → General
2. Check "Template repository"
3. Add a `TEMPLATE_README.md` (or update README) explaining how to use the template:
   - Click "Use this template" → "Create a new repository"
   - What to customise: `cdk.json` (domain names, cert ARNs, doc root path), `package.json` (name, description), `CLAUDE.md` (account details, stack names)
   - What to keep: build tooling, formatting config, CI workflow structure, CDK patterns

**Why gateway is the template**: It's the simplest CDK static site pattern — S3 + CloudFront + OAC + optional CloudFront Function. No Lambda, no DynamoDB, no API Gateway. Any future static site can start from this template and add complexity as needed. The spreadsheets repo adds packages and knowledge base on top of this same pattern.

### 2.3: Spreadsheets → `antonycc/diy-accounting`

Same archive-and-overlay pattern as gateway. Preserves GitHub Discussions. More complex than gateway due to Excel packages and knowledge base.

#### Files to copy from submit repo

| Category | Files | Notes |
|----------|-------|-------|
| CDK entry point | `SpreadsheetsEnvironment.java` (80 lines) | Rename package to `co.uk.diyaccounting.spreadsheets` |
| CDK stack | `SpreadsheetsStack.java` (300+ lines) | S3 + CloudFront + OAC + CloudWatch Logs, broader CSP for PayPal SDK |
| CDK config | `cdk-spreadsheets/cdk.json` | Rename app jar, adjust paths |
| Shared CDK utils | Same subset as gateway | `SubmitSharedNames.java`, `Kind.java`, `KindCdk.java`, etc. |
| Web content | `web/spreadsheets.diyaccounting.co.uk/public/` | index.html, download.html, donate.html, community.html, sources.html, knowledge-base.html, 246 articles, spreadsheets.css, lib/ (analytics, ecommerce, kb-search, toml-parser, lightbox, etc.) |
| Data files | `web/spreadsheets.diyaccounting.co.uk/public/data/ref-additions/` | 42 TOML reference files for knowledge base articles |
| Catalogue | `catalogue.toml`, `knowledge-base.toml`, `recently-updated.toml`, `references.toml` | Product and content catalogues |
| Excel packages | `packages/` (71 directories) | Excel spreadsheet templates for all product variants |
| Workflows | `deploy-spreadsheets.yml` → `deploy.yml` (217 lines) | Adapt for standalone repo |
| Behaviour tests | `behaviour-tests/spreadsheets.behaviour.test.js` | E2E tests for spreadsheets site |
| Scripts | `build-packages.cjs` (with financial year cutoff logic), `generate-knowledge-base-toml.cjs`, `build-sitemaps.cjs`, `stripe-spreadsheets-setup.js`, `clean-drawio.cjs`, `validate-workflows.sh`, `update-java.sh` | Spreadsheets-specific + shared scripts |
| Build | Maven wrapper, `.prettierrc`, `.prettierignore`, `.gitignore` | Same as root repo |
| Playwright config | `playwright.config.js` | Keep only spreadsheetsBehaviour project |

#### Quality tooling (match root repo baseline + spreadsheets additions)

| Tool | Purpose | npm script |
|------|---------|------------|
| Prettier | JS/YAML/JSON/TOML formatting | `formatting`, `formatting-fix` |
| Spotless + Palantir | Java formatting (100-col) | `formatting:java`, `formatting:java-fix` |
| npm-check-updates | Dependency updates | `update-to-minor`, `update-to-latest` |
| cfn-diagram | Architecture diagrams | `diagram:spreadsheets` |
| actionlint | Workflow validation | `lint:workflows` |
| Maven update script | Java dependency updates | `update:java` |
| Playwright | Behaviour tests (ci + prod) | `test:spreadsheetsBehaviour-ci`, `test:spreadsheetsBehaviour-prod` |
| Pa11y / axe / Lighthouse | Accessibility + performance | `test:a11y`, `test:lighthouse` |
| Structured data testing | SEO schema.org validation | `seo:structured-data` |

#### Steps

| Step | Description | Status |
|------|-------------|--------|
| 2.3.1 | In existing repo: `mkdir archive && git mv` all current files into `archive/` | ✅ Done in previous session — existing repo files archived |
| 2.3.2 | Copy files from submit repo (see table above) | ✅ Web content (`web/spreadsheets.diyaccounting.co.uk/`), packages (71 dirs), scripts (build-packages, build-sitemaps, generate-knowledge-base-toml, stripe-setup), behaviour test, redirects.toml |
| 2.3.3 | Rename Java package from `co.uk.diyaccounting.submit` to `co.uk.diyaccounting.spreadsheets` — move files, update all package declarations and imports | ✅ Already done by template — package is `co.uk.diyaccounting.spreadsheets`. SpreadsheetsEnvironment and SpreadsheetsStack replaced with submit's logic (CSP for PayPal, `prune(false)`, correct distributionPaths). KindCdk.java kept from template (safer null handling). |
| 2.3.4 | Create `pom.xml` — CDK-only, single `cdk-spreadsheets` profile, same structure as gateway/root | ✅ Template had it, updated `retag-gateway` → `retag-spreadsheets`. JAR name `spreadsheets.jar`. |
| 2.3.5 | Create `package.json` — same baseline as gateway, plus build-packages, generate-knowledge-base-toml, stripe setup | ✅ Major rewrite: `GATEWAY_BASE_URL` → `SPREADSHEETS_BASE_URL`, CI URL fixed to `ci-spreadsheets.diyaccounting.co.uk`, all `www.spreadsheets` paths → `spreadsheets`, added build scripts, added `stripe` dependency |
| 2.3.6 | Create `CLAUDE.md` — based on gateway CLAUDE.md, adapted for spreadsheets account (064390746177), knowledge base, packages, PayPal/Stripe integrations | ✅ Generated with package pipeline, knowledge base, SPREADSHEETS_BASE_URL, no Lambda/DynamoDB/Cognito |
| 2.3.7 | Adapt `deploy-spreadsheets.yml` → `deploy.yml` — standalone workflow, add package zip sync step | ✅ Rewritten from submit's deploy-spreadsheets.yml — SpreadsheetsStack, build-redirects/sitemaps/packages steps, S3 zip sync, `SPREADSHEETS_*` vars |
| 2.3.8 | Add `test.yml` workflow — build, formatting, CDK synth, behaviour tests | ✅ Updated paths trigger, added build-sitemaps/build-redirects steps, spreadsheetsBehaviour-local test |
| 2.3.9 | Fill gaps from `archive/` — old packages, README, build scripts, community discussions context | ✅ Done |
| 2.3.10 | Update OIDC trust in spreadsheets account (064390746177): add `repo:antonycc/diy-accounting:*` to trust policy | ✅ `spreadsheets-github-actions-role` trust includes `repo:antonycc/diy-accounting:*` |
| 2.3.11 | Deploy from spreadsheets repo. Run `test:spreadsheetsBehaviour-ci`. Verify site, packages, knowledge base, PayPal donate. | ✅ All 3 jobs passed (params, deploy, smoke test) — [run 22284381028](https://github.com/antonycc/diy-accounting/actions/runs/22284381028) |
| 2.3.12 | Remove `deploy-spreadsheets.yml`, `SpreadsheetsStack.java`, `SpreadsheetsEnvironment.java`, `cdk-spreadsheets/`, `web/spreadsheets.diyaccounting.co.uk/`, `packages/`, `build-packages.cjs`, `generate-knowledge-base-toml.cjs`, `stripe-spreadsheets-setup.js` from submit repo | ✅ All removed, `npm test` (927 passed) + `./mvnw clean verify` (BUILD SUCCESS) |

#### Additional files created/adapted (2.3.2–2.3.8)

| File | Action |
|------|--------|
| `cdk-spreadsheets/cdk.json` | Fixed `docRootPath`, `prodFQDomainName`, removed `prodFQNakedDomainName` |
| `playwright.config.js` | `gatewayBehaviour` → `spreadsheetsBehaviour`, browser test → `spreadsheets-content.browser.test.js` |
| `.pa11yci.ci.json` / `.pa11yci.prod.json` | Expanded to 5 URLs (download, donate, knowledge-base, community) |
| `.gitignore` | Added generated files (catalogue.toml, sitemap.xml, knowledge-base.toml, redirect-function.js, target/zips/) |
| `web/browser-tests/spreadsheets-content.browser.test.js` | New — replaces gateway-content, tests product cards, JSON-LD `SoftwareApplication`, donate/download pages |
| `web/unit-tests/seo-validation.test.js` | Rewritten — path to `web/spreadsheets.diyaccounting.co.uk/public`, JSON-LD type `SoftwareApplication` |
| `web/unit-tests/smoke.test.js` | Rewritten — spreadsheets pages (download, donate, knowledge-base), spreadsheets.css |
| `web/spreadsheets.diyaccounting.co.uk/redirects.toml` | Created — 12 static redirects + 5 product mappings (old www.diyaccounting.co.uk URLs) |
| `scripts/build-spreadsheets-redirects.cjs` | Fixed auto-generated comment, domain names (ci-spreadsheets, ci.submit) |
| `README.md` | Generated for spreadsheets site |
| `PLAN_DONATION_DOWNLOAD_TESTING.md` | Created — 6 phases for Stripe sandbox, PayPal, zip downloads, E2E donation, local dev, GA4 |
| `gateway.behaviour.test.js` | Deleted |
| `gateway-content.browser.test.js` | Deleted |

#### Verification (2.3.2–2.3.8)

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
| Stripe payment links | Donation payment links (see `PLAN_STRIPE_1.md` — completed). |
| SEO | Structured data (schema.org) on product pages. Sitemap generation. |

### 2.4: Submit repo cleanup

| Step | Description |
|------|-------------|
| 2.4.1 | Remove gateway and spreadsheets behaviour tests from submit | ✅ Removed `spreadsheets.behaviour.test.js`, `spreadsheetsBehaviour` playwright project (gateway already removed in 2.2.14) |
| 2.4.2 | Clean up `package.json`, `pom.xml` — remove gateway/spreadsheets/root build references | ✅ Removed spreadsheets npm scripts, gateway/spreadsheets URLs from accessibility scripts, SEO scripts, `cdk-spreadsheets` Maven profile, `submit-spreadsheets.jar` from main profile, spreadsheets site from SEO validation tests |
| 2.4.3 | Remove submit repo's OIDC trust from 887764105431 (only root repo deploys there now). Narrow root OIDC trust to `repo:antonycc/root.diyaccounting.co.uk:*` only. | ✅ `root-github-actions-role` trust narrowed to `repo:antonycc/root.diyaccounting.co.uk:*` only |
| 2.4.4 | Verify submit deploys and tests still pass | ✅ `npm test` (88 files, 927 passed) + `./mvnw clean verify` (BUILD SUCCESS) locally |

### What went in the root repo (reference — Phase 2.1 done)

| Asset | Purpose |
|---|---|
| `RootDnsStack.java` | Route53 alias records for all services |
| `ApexStack.java` | CloudFront + S3 for `{env}-holding.diyaccounting.co.uk` |
| `web/holding/` | Holding page content |
| `deploy.yml` (adapted from `deploy-root.yml`) | DNS deployment workflow |
| `deploy-holding.yml` | Holding/maintenance page workflow |
| `test.yml` | Build, formatting check, CDK synth |
| `cdk-root/cdk.json` | CDK app configuration |
| Shared CDK lib | `SubmitSharedNames.java`, `Kind.java`, `KindCdk.java`, `Route53AliasUpsert.java`, `ResourceNameUtils.java` (subset needed) |
| Quality tooling | Prettier, Spotless, npm-check-updates, cfn-diagram, actionlint |

**What root does NOT have**: Lambda, DynamoDB, Cognito, API Gateway, Docker, ngrok, HMRC anything.

**Cross-repo coordination**: All four repos depend on root for DNS. When a service changes its CloudFront distribution, root must update the alias records. This is the one cross-repo coordination point.

### What to remove from copied submit code

**From gateway repo**: `app/`, `web/public/`, `web/spreadsheets.diyaccounting.co.uk/`, `web/holding/`, `packages/`, `infra/.../` (all stacks except GatewayStack), `cdk-application/`, `cdk-environment/`, `cdk-spreadsheets/`, non-gateway behaviour tests, `scripts/build-packages.cjs`, `scripts/generate-knowledge-base-toml.cjs`, non-gateway workflows, `.env.test`, `.env.proxy`, Docker/ngrok/HMRC files.

**From spreadsheets repo**: `app/`, `web/public/`, `web/www.diyaccounting.co.uk/`, `web/holding/`, `infra/.../` (all stacks except SpreadsheetsStack), `cdk-application/`, `cdk-environment/`, `cdk-gateway/`, non-spreadsheets behaviour tests, `scripts/build-gateway-redirects.cjs`, non-spreadsheets workflows, `.env.test`, `.env.proxy`, Docker/ngrok/HMRC files.

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

## Phase 3: Backup strategy (submit-backups)

**Goal**: Ship backups from submit-ci and submit-prod into submit-backups. Validate restores by standing up a prod-replica in CI, including the user sub hash salt.

**When**: Can start alongside Phase 1 (account separation) — the backup account is independent.

### 3.1: Backup account setup

| Step | Description | Details |
|------|-------------|---------|
| 3.1.1 | Create `submit-backup` account | Via AWS Organizations. Email: `aws-backup@diyaccounting.co.uk`. Place in Backup OU. |
| 3.1.2 | Assign SSO access | `AdministratorAccess` for setup, then downgrade to a restricted policy. |
| 3.1.3 | Create cross-account vault | `submit-cross-account-vault` in submit-backup (eu-west-2). |
| 3.1.4 | Set vault access policy | Allow `submit-prod` and `submit-ci` to copy backups into the vault. |
| 3.1.5 | Create KMS key | For encrypting backup copies at rest in the backup account. |

### 3.2: Cross-account backup shipping

| Step | Description | Details |
|------|-------------|---------|
| 3.2.1 | Update BackupStack in this repo | Add cross-account copy rules to the existing backup plans. Daily backups copy to submit-backup. |
| 3.2.2 | Create IAM roles | In submit-prod and submit-ci: backup service role with `backup:CopyIntoBackupVault` permission for the backup account's vault. |
| 3.2.3 | Deploy updated BackupStack | To both CI and prod environments. |
| 3.2.4 | Verify backup shipping | Trigger a manual backup, wait for cross-account copy to complete. Check the vault in submit-backup. |

**What gets backed up**: DynamoDB tables (`{env}-env-receipts`, `{env}-env-bundles`, `{env}-env-hmrc-api-requests`, `{env}-env-passes`, `{env}-env-subscriptions`). Existing schedules: Daily (35-day local), Weekly (90-day local), Monthly compliance (7 years for HMRC). Cross-account copies: Daily → submit-backup vault (90-day retention — longer than source).

### 3.3: Restore testing (prod-replica in CI)

Prove backups work by restoring production data into CI and verifying the application functions correctly — including the user sub hash salt.

| Step | Description | Details |
|------|-------------|---------|
| 3.3.1 | Copy prod backup to CI | From submit-backup vault, restore prod DynamoDB tables into submit-ci with target table names like `ci-env-bundles-restored`. |
| 3.3.2 | Restore the salt | Copy encrypted salt from prod backup. Grant submit-ci `kms:Decrypt` on submit-prod's salt encryption key. |
| 3.3.3 | Swap tables | Point CI environment at the restored tables. |
| 3.3.4 | Run behaviour tests | `npm run test:submitVatBehaviour-ci` against the restored data. Verify salt decrypts correctly and user sub hashing works. |
| 3.3.5 | Clean up | Delete restored tables and revert CI config. |

### 3.4: Automated restore testing (future)

Monthly scheduled GitHub Actions workflow: copy prod backup → restore to CI → run tests → clean up → report.

---

## Reference: Per-account resource inventory

### 887764105431 (management account)

After Phase 1 completion, this account is management-only:

| Category | Resources |
|----------|-----------|
| Organization | AWS Organizations, OUs, IAM Identity Center, Consolidated Billing |
| DNS | Route 53 (`diyaccounting.co.uk` zone), RootDnsStack, holding page stacks |
| Deployment | GitHub OIDC provider (for root repo only), CDK bootstrap |
| NOT here | No Lambda, DynamoDB, Cognito, API Gateway, Secrets Manager, application CloudFront |

### submit-prod (NEW account)

| Category | Resources |
|----------|-----------|
| Compute | Lambda functions (submit), API Gateway HTTP API |
| Data | DynamoDB (prod-env-receipts, prod-env-bundles, etc.), Secrets Manager |
| Web | CloudFront (submit), S3 |
| Certs | ACM us-east-1 (main, auth, simulator), ACM eu-west-2 (regional API GW) |
| Security | Cognito, WAF, KMS (salt encryption) |
| Backup | AWS Backup local vault (35-day daily, 90-day weekly), copies to submit-backup |
| Deployment | GitHub OIDC provider, submit-prod-github-actions-role, submit-prod-deployment-role, CDK bootstrap |

### gateway

| Category | Resources |
|----------|-----------|
| Web | CloudFront (with CloudFront Function redirects), S3 |
| Certs | ACM us-east-1 (`ci-gateway`, `prod-gateway`, `diyaccounting.co.uk`, `www.diyaccounting.co.uk`) |
| Deployment | GitHub OIDC provider, gateway-github-actions-role, gateway-deployment-role, CDK bootstrap |
| NOT here | No Lambda, DynamoDB, Cognito, API Gateway, Route53 |

### spreadsheets

| Category | Resources |
|----------|-----------|
| Web | CloudFront, S3 (static assets + package zip hosting) |
| Certs | ACM us-east-1 (`ci-spreadsheets`, `prod-spreadsheets`, `spreadsheets.diyaccounting.co.uk`) |
| Deployment | GitHub OIDC provider, spreadsheets-github-actions-role, spreadsheets-deployment-role, CDK bootstrap |
| NOT here | No Lambda, DynamoDB, Cognito, API Gateway, Route53 |

### submit-ci

| Category | Resources |
|----------|-----------|
| Compute | Lambda functions (CI submit), API Gateway HTTP API |
| Data | DynamoDB (ci-env-receipts, ci-env-bundles, etc. — test data), Secrets Manager (sandbox credentials) |
| Web | CloudFront (submit CI), S3 |
| Certs | ACM us-east-1 (CI-scoped main, auth, simulator), ACM eu-west-2 (CI regional) |
| Security | Cognito (CI user pool) |
| Backup | AWS Backup local vault (shorter retention), copies to submit-backup |
| Deployment | GitHub OIDC provider, submit-ci-github-actions-role, submit-ci-deployment-role, CDK bootstrap |
| Differences | HMRC sandbox APIs, test data only, feature branch per-deployment stacks |

### submit-backup

| Category | Resources |
|----------|-----------|
| Backup | submit-cross-account-vault (90-day retention), KMS key |
| IAM | Vault access policy (allows submit-prod and submit-ci to copy in) |
| Audit | CloudTrail |
| NOT here | No application code, receive-only (plus outbound copies for restore testing) |

---

## Reference: Deployment flow

### Current (single repo, single account)

```
GitHub Actions (submit.diyaccounting.co.uk repo)
        │
        ▼ OIDC
┌───────────────────────────────────────────────────────┐
│    887764105431 (everything)                           │
│                                                        │
│  deploy-environment.yml → {env}-env-* stacks          │
│  deploy.yml → {deployment}-app-* stacks               │
│  deploy-gateway.yml → {env}-gateway-GatewayStack      │
│  deploy-spreadsheets.yml → {env}-spreadsheets-*Stack  │
│  deploy-root.yml → {env}-env-RootDnsStack             │
│  deploy-holding.yml → {env}-holding stack             │
└───────────────────────────────────────────────────────┘
```

### After Phase 1 + 2.1 (root separated, rest in submit repo) — CURRENT STATE

```
root.diyaccounting.co.uk repo ──OIDC──► 887764105431 (DNS + holding only)

GitHub Actions (submit.diyaccounting.co.uk repo)
        │
        ├── deploy-gateway.yml ──OIDC──► gateway
        │                                (S3 + CloudFront)
        │
        ├── deploy-spreadsheets.yml ──OIDC──► spreadsheets
        │                                     (S3 + CloudFront)
        │
        ├── deploy.yml (CI branches) ──OIDC──► submit-ci
        │   deploy-environment.yml (CI)        (Lambda, DDB, Cognito)
        │
        └── deploy.yml (main) ──OIDC──► submit-prod
            deploy-environment.yml (prod)      (Lambda, DDB, Cognito)
```

### After Phase 2 (multiple repos, multiple accounts)

```
root.diyaccounting.co.uk ──OIDC──► 887764105431 (DNS + holding only)
submit repo ───────OIDC──► submit-prod (prod) + submit-ci (CI)
gateway repo ──────OIDC──► gateway (S3 + CloudFront)
spreadsheets repo ─OIDC──► spreadsheets (S3 + CloudFront)
```

---

## Reference: Data flow

```
┌─────────────────┐     ┌─────────────────┐
│   submit-ci     │     │  submit-prod    │
│                 │     │  (NEW account)  │
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

---

## Reference: Console access (IAM Identity Center)

Single portal for all accounts. No separate IAM users, no multiple sets of credentials.

1. Log into the SSO portal once: `https://d-9c67480c02.awsapps.com/start/`
2. Portal shows all accounts with their permission sets
3. Click any account → choose permission set → opens AWS console
4. For CLI: click "Command line or programmatic access" → copy temporary credentials

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

**Transition from assume-role scripts**: Existing `scripts/aws-assume-submit-deployment-role.sh` will need updating to target the new submit-prod account. SSO profiles are the preferred approach for new accounts.

---

## Reference: Billing

AWS Organizations provides consolidated billing automatically.

| What | Where |
|------|-------|
| Single bill for everything | 887764105431 (management account) — Billing console |
| Per-account breakdown | 887764105431 → Cost Explorer → filter by "Linked Account" |
| Individual account view | Each member account → Cost Explorer shows only its own usage |
| Budget alerts | Set per-account in management → SNS notifications |

**Expected costs**:

| Account | Expected Cost | Main Drivers |
|---------|---------------|--------------|
| 887764105431 (management) | ~$5-10/month | Route53 zone, IAM Identity Center (free), holding page CloudFront |
| submit-prod | Current prod costs | Lambda, DynamoDB, CloudFront, API GW, Cognito |
| submit-ci | ~30-50% of prod | Same services, less traffic |
| gateway | ~$1-5/month | S3 + CloudFront (static site) |
| spreadsheets | ~$1-10/month | S3 + CloudFront (static site + package zips) |
| submit-backup | ~$5-20/month | Vault storage for backup copies |

---

## Reference: Domain convention

| Service | CI | Prod | Prod alias | Account | Repo (final) |
|---------|-----|------|------------|---------|-------------|
| Submit | `ci-submit.diyaccounting.co.uk` | `prod-submit.diyaccounting.co.uk` | `submit.diyaccounting.co.uk` | submit-ci / submit-prod | submit |
| Gateway | `ci-gateway.diyaccounting.co.uk` | `prod-gateway.diyaccounting.co.uk` | `diyaccounting.co.uk`, `www.diyaccounting.co.uk` | gateway | www.diyaccounting.co.uk |
| Spreadsheets | `ci-spreadsheets.diyaccounting.co.uk` | `prod-spreadsheets.diyaccounting.co.uk` | `spreadsheets.diyaccounting.co.uk` | spreadsheets | diy-accounting |
| Cognito | `ci-auth.diyaccounting.co.uk` | `prod-auth.diyaccounting.co.uk` | — | submit-ci / submit-prod | submit |
| Holding | `ci-holding.diyaccounting.co.uk` | `prod-holding.diyaccounting.co.uk` | — | 887764105431 | root |
| Simulator | `ci-simulator.diyaccounting.co.uk` | `prod-simulator.diyaccounting.co.uk` | — | submit-ci / submit-prod | submit |
| DNS zone | — | — | `diyaccounting.co.uk` | 887764105431 | root |

---

## Reference: Account table

| Account | ID | Email | OU | Purpose | Phase |
|---------|-----|-------|-----|---------|-------|
| 887764105431 | 887764105431 | admin@diyaccounting.co.uk | Management (org root) | Org admin, Route53, IAM Identity Center, billing, holding page | Phase 1.0 ✅ |
| gateway | 283165661847 | admin+aws-gateway@diyaccounting.co.uk | Workloads | Gateway (S3 + CloudFront) | Phase 1.1 ✅ |
| spreadsheets | 064390746177 | admin+aws-spreadsheets@diyaccounting.co.uk | Workloads | Spreadsheets (S3 + CloudFront) | Phase 1.2 ✅ |
| submit-ci | 367191799875 | admin+aws-submit-ci@diyaccounting.co.uk | Workloads | Submit CI (Lambda, DDB, Cognito, API GW) | Phase 1.3 (code changes done, deploy pending) |
| submit-prod | 972912397388 | admin+aws-submit-prod@diyaccounting.co.uk | Workloads | Submit prod (Lambda, DDB, Cognito, API GW) | Phase 1.4 |
| submit-backup | 914216784828 | admin+aws-submit-backup@diyaccounting.co.uk | Backup | Cross-account backup vault | Phase 3.1 |

### Repository → Account mapping progression

| Phase | This repo deploys to | Root repo | Gateway repo | Spreadsheets repo |
|-------|---------------------|-----------|-------------|-------------------|
| Current | 887764105431 (everything) | N/A | N/A | N/A |
| Phase 1.1 | 887764105431 + gateway | N/A | N/A | N/A |
| Phase 1.2 | 887764105431 + gateway + spreadsheets | N/A | N/A | N/A |
| Phase 1.3 | 887764105431 + submit-ci + gateway + spreadsheets | N/A | N/A | N/A |
| Phase 1.4 | submit-prod + submit-ci + gateway + spreadsheets + 887764105431 (root DNS) | N/A | N/A | N/A |
| Phase 1.5 | submit-prod + submit-ci + gateway + spreadsheets + 887764105431 (root DNS only) | N/A | N/A | N/A |
| Phase 2 | submit-prod + submit-ci | 887764105431 | gateway | spreadsheets |

---

## Risk summary

| Risk | Mitigation |
|---|---|
| DNS cutover causes downtime | CloudFront alias changes propagate in seconds. Old distributions kept until verified. Rollback via `deploy-root.yml`. |
| ACM cert validation delay | Request certs days before planned cutover. DNS validation typically completes in minutes. |
| New account missing permissions | Bootstrap follows proven pattern. Test with CI deployment first. |
| Account separation breaks workflows | All changes are in one repo — test on feature branch before merging. Revert is one commit. |
| Submit prod migration loses data | Full DynamoDB backup before migration. Old prod stays live until new is validated. Backup restoration is scripted and tested. |
| Cognito users must re-register | Only 2 sign-ups + family testers. Notify them directly. New Cognito pool from IaC proves repeatability. |
| Salt restoration fails | Test salt restore in CI first (Phase 3.3). Script handles re-encryption if needed. |
| Repository migration breaks builds | Each repo deployed and tested before removing from submit. Archive-and-overlay preserves working state. |
| Old www URLs break | CloudFront Function handles redirects. 301s preserve SEO. |
| Root repo becomes SPOF for DNS | DNS records are durable — a broken root deploy doesn't affect existing records. |
| Backup account compromised | Vault is receive-only. No application code. Restricted SSO after setup. |

---

## Future considerations

| Item | Notes |
|---|---|
| Automated restore testing | Monthly workflow: copy prod backup → restore to CI → test → report (Phase 3.4). |
| `diy-accounting` repo rename | If renamed to `diy-accounting-spreadsheets`, update OIDC trust. GitHub supports renames with redirects but OIDC `sub` claims use current name. |

---

*Created: February 2026 (v2.0 — 887764105431 becomes clean management account, submit-prod migrates to new account, IaC repeatability proof)*
