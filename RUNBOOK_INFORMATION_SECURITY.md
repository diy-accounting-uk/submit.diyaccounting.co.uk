# Information Security Runbook

**Document Version**: 3.0
**Last Updated**: 2026-02-22
**Administrator**: admin@diyaccounting.co.uk

This document consolidates all security, privacy, and data protection procedures for operating DIY Accounting Submit.

---

## Table of Contents

1. [Data Inventory](#1-data-inventory)
2. [Secrets Management](#2-secrets-management)
3. [Secret Rotation Procedures](#3-secret-rotation-procedures)
4. [User Sub Hashing (Salt)](#4-user-sub-hashing-salt)
5. [Data Subject Rights](#5-data-subject-rights)
6. [Security Incident Response](#6-security-incident-response)
7. [Security Monitoring](#7-security-monitoring)
8. [Data Retention](#8-data-retention)
9. [Regulatory Compliance](#9-regulatory-compliance)
10. [Public Repository Security](#10-public-repository-security)
11. [Console Access and AWS CLI](#11-console-access-and-aws-cli)
12. [Backup and Restore](#12-backup-and-restore)
13. [Holding Failover](#13-holding-failover)

---

## 1. Data Inventory

### 1.1 Data Storage Locations

| Storage | Data Types | Account | Encryption | Retention |
|---------|------------|---------|------------|-----------|
| **DynamoDB** `{env}-env-bundles` | User entitlements, bundle IDs | submit-ci (367191799875) / submit-prod (972912397388) | At rest (AWS managed) | Until account deletion |
| **DynamoDB** `{env}-env-receipts` | VAT submission receipts, HMRC responses | submit-ci / submit-prod | At rest (AWS managed) | 7 years TTL (legal requirement) |
| **DynamoDB** `{env}-env-hmrc-api-requests` | Audit trail of HMRC API calls (masked) | submit-ci / submit-prod | At rest (AWS managed) | 28 days TTL |
| **AWS Cognito** | Email, password hash, user attributes | submit-ci / submit-prod | AWS managed | Until account deletion |
| **AWS Secrets Manager** | OAuth secrets, user sub hash salt | submit-ci / submit-prod (per account) | KMS encryption | Permanent (except rotation) |
| **CloudWatch Logs** | Application logs, API access logs | submit-ci / submit-prod | At rest (AWS managed) | 30-90 days configurable |
| **S3** | Static assets, deployment artifacts | submit-ci / submit-prod | SSE-S3 | Version controlled |
| **CloudFront** | CDN cache, access logs | submit-ci / submit-prod | In transit (TLS) | Short-lived cache |

### 1.2 Sensitive Data and Compromise Impact

| Data Type | Storage Location | If Compromised... | Mitigating Secret |
|-----------|------------------|-------------------|-------------------|
| User emails | Cognito User Pool | Identity disclosure, phishing risk | Cognito is AWS managed |
| User passwords | Cognito (hashed) | Account takeover | Cognito is AWS managed |
| VAT submission data | DynamoDB (by hashedSub) | Financial data exposure | `USER_SUB_HASH_SALT` |
| HMRC receipts | DynamoDB (by hashedSub) | Tax filing history exposure | `USER_SUB_HASH_SALT` |
| HMRC OAuth tokens | Session only (masked in audit) | Unauthorized HMRC API access | `HMRC_CLIENT_SECRET` |
| User-to-data mapping | DynamoDB partition keys | Link users to their data | `USER_SUB_HASH_SALT` |

### 1.3 Protection Mechanisms

**Data Masking** (`app/lib/dataMasking.js`):
- Automatically masks sensitive fields before DynamoDB persistence
- Fields masked: `authorization`, `access_token`, `refresh_token`, `password`, `client_secret`, `code`
- Pattern matching: fields ending in `password`, `secret`, `token`
- Allowlist for safe fields: `periodKey`, `tokenInfo`, `hasAccessToken`

**User Sub Hashing** (`app/services/subHasher.js`):
- HMAC-SHA256 with environment-specific salt
- Original Cognito `sub` never stored in DynamoDB
- All partition keys use `hashedSub`
- Prevents correlation attacks across data breaches

---

## 2. Secrets Management

### 2.1 Secret Inventory

Each AWS account has its own Secrets Manager entries. GitHub Actions secrets flow into the correct account via environment-scoped deployment workflows.

| Secret Name | GitHub Secret | AWS Secrets Manager Path | Account(s) | Used By |
|-------------|---------------|--------------------------|------------|---------|
| Google OAuth Client Secret | `GOOGLE_CLIENT_SECRET` | `{env}/submit/google/client_secret` | submit-ci (367191799875), submit-prod (972912397388) | Cognito Identity Provider |
| HMRC Production Client Secret | `HMRC_CLIENT_SECRET` | `{env}/submit/hmrc/client_secret` | submit-ci, submit-prod | HMRC OAuth token exchange |
| HMRC Sandbox Client Secret | `HMRC_SANDBOX_CLIENT_SECRET` | `{env}/submit/hmrc/sandbox_client_secret` | submit-ci, submit-prod | HMRC sandbox testing |
| User Sub Hash Salt | (auto-generated) | `{env}/submit/user-sub-hash-salt` | submit-ci, submit-prod | DynamoDB partition keys |

### 2.2 Secret Flow Architecture

GitHub Actions environment-scoped variables (`SUBMIT_*`) route deployments to the correct account. Each account receives its own copy of the secrets.

```
┌─────────────────────┐    ┌─────────────────────┐    ┌───────────────────────────┐
│   GitHub Secrets    │───▶│  deploy-environment │───▶│  AWS Secrets Mgr           │
│   (source of truth  │    │  workflow           │    │  (per account)             │
│   for OAuth secrets)│    │  create-secrets job │    │  submit-ci (367191799875)  │
└─────────────────────┘    │  (env-scoped OIDC)  │    │  submit-prod (972912397388)│
                           └─────────────────────┘    └───────────────────────────┘
                                                               │
                                                               ▼
                           ┌─────────────────────┐    ┌─────────────────────┐
                           │  CDK Stacks         │◀───│  Lambda Functions   │
                           │  (reference ARNs)   │    │  (read at runtime)  │
                           └─────────────────────┘    └─────────────────────┘
```

### 2.3 Verifying Secrets

Use the **manage secrets** workflow:
1. Go to **Actions** → **manage secrets**
2. Select **Action**: `check`
3. Select **Environment**: `ci` or `prod`
4. Click **Run workflow**

This verifies all required secrets exist and have values.

---

## 3. Secret Rotation Procedures

### 3.1 Google OAuth Client Secret Rotation

**When to rotate**: Annually, or immediately if compromised.

**Step 1: Obtain new secret from Google**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your **OAuth 2.0 Client ID**
4. Click **Add Secret** (allows having multiple active secrets)
5. Copy the new secret value

**Step 2: Update GitHub Secret**
1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click on `GOOGLE_CLIENT_SECRET`
3. Click **Update secret**
4. Paste the new secret value
5. Click **Update secret**

**Step 3: Deploy to AWS**
1. Go to **Actions** → **deploy environment**
2. Click **Run workflow**
3. Select the environment (`ci` or `prod`)
4. Check **"Force refresh of Cognito Identity Provider"** ✓
5. Click **Run workflow**
6. Wait for deployment to complete

**Step 4: Verify and cleanup**
1. Test login via Google on the deployed environment
2. Once verified, return to Google Cloud Console
3. Delete the old secret

**Important**: The `force-identity-refresh` flag is required because Cognito caches the secret value. Without this flag, CloudFormation won't detect the change.

### 3.2 HMRC Client Secret Rotation

**When to rotate**: Annually, or immediately if compromised.

**Step 1: Obtain new secret from HMRC**
1. Go to [HMRC Developer Hub](https://developer.service.hmrc.gov.uk/)
2. Navigate to your application
3. Regenerate the client secret
4. Copy the new secret value

**Step 2: Update GitHub Secret**
1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click on `HMRC_CLIENT_SECRET` (or `HMRC_SANDBOX_CLIENT_SECRET` for sandbox)
3. Click **Update secret**
4. Paste the new secret value
5. Click **Update secret**

**Step 3: Deploy to AWS**
1. Go to **Actions** → **deploy environment**
2. Click **Run workflow**
3. Select the environment (`ci` or `prod`)
4. Click **Run workflow**
5. Wait for deployment to complete

**Step 4: Verify**
1. Test HMRC OAuth flow (retrieve obligations or submit VAT return)
2. Check Lambda logs for any authentication errors

**Note**: HMRC secrets are read at Lambda runtime, so a standard deployment is sufficient. The `create-secrets` job automatically updates the value in the target account's AWS Secrets Manager (submit-ci or submit-prod, depending on the environment selected).

### 3.3 Rotation Schedule

| Secret | Rotation Frequency | Last Rotated | Next Due |
|--------|-------------------|--------------|----------|
| Google Client Secret | Annually | 2026-01-24 | 2027-01-24 |
| HMRC Client Secret | Annually | 2025-07-24 | 2026-07-24 |
| HMRC Sandbox Client Secret | Annually | 2026-01-24 | 2027-01-24 |
| User Sub Hash Salt | Via migration framework | See Section 4 | See Section 4 |

### 3.4 Other Repository Secrets

These secrets are used for CI/CD and testing, not runtime OAuth:

| Secret | Purpose | Last Updated | Notes |
|--------|---------|--------------|-------|
| `NGROK_AUTHTOKEN` | Local tunnel for OAuth callbacks | 2025-07-24 | Rotate if compromised |
| `PERSONAL_ACCESS_TOKEN` | GitHub API for workflow automation | 2026-01-17 | Rotate quarterly recommended |
| `RELEASE_PAT` | GitHub release creation | 2026-01-10 | Rotate quarterly recommended |
| `SUPPORT_ISSUE_PAT` | GitHub issue management | 2026-01-17 | Rotate quarterly recommended |
| `TEST_HMRC_PASSWORD` | HMRC sandbox test user password | 2026-01-24 | Regenerate via HMRC test user API |

---

## 4. User Sub Hashing (Salt)

### 4.1 Why the Salt is Critical

The user sub hash salt creates the link between Cognito user identities and DynamoDB data via `HMAC-SHA256(salt, userSub)`. Every DynamoDB item uses the resulting 64-character hex hash as its partition key (`hashedSub`).

| If the salt is... | Impact |
|-------------------|--------|
| **Missing** | All Lambda functions fail on cold start |
| **Wrong value** | New writes go to unreachable partition keys (silent data loss) |
| **Compromised** | Attacker could de-anonymise users if they also have DynamoDB access |

### 4.2 Multi-Version Salt Registry

The salt is stored in Secrets Manager as a JSON registry supporting multiple versions:

```json
{
  "current": "v2",
  "versions": {
    "v1": "Abc123...base64...",
    "v2": "tiger-happy-castle-river-noble-frost-plume-brave"
  }
}
```

- **`current`**: The version used for all new writes
- **`versions`**: All known salt values (old versions kept for read-path fallback during migration windows)
- Lambda functions read the registry on cold start and cache the parsed result
- All DynamoDB items include a `saltVersion` field indicating which version was used

### 4.3 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Secrets Manager                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ {env}/submit/user-sub-hash-salt                         │    │
│  │ Value: {"current":"v2","versions":{"v1":"...","v2":"..."}}│   │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ GetSecretValue (on cold start)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Lambda Functions                              │
│  subHasher.js: hashSub() uses current version for writes        │
│                getPreviousVersions() for read-path fallback      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ hashSub(userSub) → HMAC-SHA256
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DynamoDB Tables                              │
│  bundles, receipts, hmrc-api-requests, async-requests (5)       │
│  Partition Key: hashedSub (64-char hex)                         │
│  Each item stores: saltVersion ("v1", "v2", etc.)               │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Three Recovery Paths

If the salt is lost from Secrets Manager, three independent recovery paths exist:

| Path | Location | Account | Recovery Method |
|------|----------|---------|-----------------|
| **Path 1** | Secrets Manager `{env}/submit/user-sub-hash-salt` | submit-prod (972912397388) / submit-ci (367191799875) | Soft-delete recovery (7-30 day window) |
| **Path 2** | Physical card | Offline | 8-word passphrase printed on card in fire safe |
| **Path 3** | DynamoDB `system#config` item in bundles table | submit-prod / submit-ci | KMS-encrypted salt, decrypted with DataStack KMS key (`{env}-env-salt-encryption`) |

**Path 2 detail**: The current salt (v2) is an 8-word passphrase (~82 bits entropy) that can be typed manually into the `restore-salt` workflow.

### 4.5 Salt Creation

The salt is automatically created by `deploy-environment.yml` in the `create-secrets` job:
- Only created if it doesn't exist (idempotent)
- Initial v1: 32-byte random value (base64 encoded), wrapped in JSON registry format
- Tagged as `Critical=true`, `BackupRequired=true`

Migration 003 rotates from v1 to v2 (8-word passphrase) and re-keys all items.

### 4.6 Salt Backup Procedure

1. Go to **Actions** → **manage secrets**
2. Select **Action**: `backup-salt`
3. Select **Environment**: `prod` (or `ci`)
4. Click **Run workflow**
5. Copy the **full JSON registry** from the output
6. Store securely (password manager, encrypted file)
7. **Delete the workflow run** from Actions history

The `check-salt` action validates registry format and shows version details without exposing values.

### 4.7 Salt Recovery Procedures

**Scenario: Salt accidentally deleted**

Symptoms: Lambdas fail with "ResourceNotFoundException" on cold start.

Recovery (try in order):
1. **Path 1**: Check Secrets Manager soft-delete recovery (7-30 day window) in the affected account (submit-prod 972912397388 or submit-ci 367191799875)
2. **Path 3**: Decrypt `system#config`/`salt-v2` item from bundles table using the account's KMS key (`{env}-env-salt-encryption`)
3. **Path 2**: Type the 8-word passphrase from the physical backup card

After recovering the value:
1. Go to **Actions** -> **manage secrets** -> `restore-salt`
2. Select the correct environment (`ci` or `prod`) -- this targets the correct account
3. Enter the full JSON registry value
4. **Delete the workflow run**
5. Redeploy or wait for Lambda cold start

**Note**: Each account (submit-ci, submit-prod) has its own independent salt secret. Recovery must target the correct account. The salt value is the same across accounts (copied during migration), but the Secrets Manager entry and KMS key are per-account.

**Scenario: Salt tampered (wrong value)**

Symptoms: Users can't access data; no errors (hashing works, just wrong values). Detected by salt health canary — a `system#canary` item in the bundles table with a known expected hash.

Recovery:
1. Restore correct salt from Path 2 or Path 3
2. Use `restore-salt` action with the correct registry JSON
3. Force Lambda cold starts (redeploy)

**Scenario: Total salt loss (all paths fail)**

If Secrets Manager, physical card, and KMS-encrypted backup are all lost:
- The HMAC is irreversible by design — user data cannot be reconnected to users
- Generate a new salt, existing data becomes orphaned (TTLs will clean up over time)

### 4.8 Salt Rotation (Migration Framework)

Salt rotation uses the EF-style migration framework at `scripts/migrations/`:

```bash
# Run manually via workflow or CLI
ENVIRONMENT_NAME=ci node scripts/migrations/runner.js --phase post-deploy
```

Migrations are tracked in the bundles table under `system#migrations` partition key. The runner skips already-applied migrations (idempotent).

| Migration | Phase | Purpose |
|-----------|-------|---------|
| 001-convert-salt-to-registry | pre-deploy | Convert raw string to JSON registry |
| 002-backfill-salt-version-v1 | post-deploy | Add `saltVersion="v1"` to existing items |
| 003-rotate-salt-to-passphrase | post-deploy | Generate 8-word passphrase, re-key all items |

During rotation, the read-path version fallback ensures users can access data at any salt version in the registry. No user experiences data loss during migration.

### 4.9 IAM Access

Lambda functions are granted access via CDK helper:

```java
// infra/main/java/co/uk/diyaccounting/submit/utils/SubHashSaltHelper.java
SubHashSaltHelper.grantSaltAccess(lambda, region, account, envName);
```

This adds permission for `secretsmanager:GetSecretValue` on the salt secret ARN.

---

## 5. Data Subject Rights

**Response deadline**: 30 days for all requests.

### 5.1 Right of Access

**Request**: User asks for copy of their personal data.

**Action**:
1. Run `scripts/export-user-data.js <userId>`
2. Email JSON file or provide secure download link

### 5.2 Right to Erasure

**Request**: User asks for account and data deletion.

**Action**:
1. Run `scripts/delete-user-data.js <userId>`
2. HMRC receipts retained for 7 years (anonymized)
3. Verify deletion in DynamoDB and Cognito
4. Inform user about HMRC receipt retention (legal requirement)

### 5.3 Right to Rectification

**Request**: User reports incorrect data.

**Action**: Update via DynamoDB console or admin scripts.

### 5.4 Right to Data Portability

**Request**: User wants data for transfer.

**Action**: Same as Right of Access - export to JSON/CSV.

---

## 6. Security Incident Response

### 6.1 Multi-Account Isolation

The system runs across 6 AWS accounts. Compromise of one account does not automatically compromise others:

| Account | ID | Contains user data? | Compromise impact |
|---------|-----|---------------------|-------------------|
| management | 887764105431 | No | DNS disruption only (no user data, no secrets) |
| gateway | 283165661847 | No | Static site only (managed by separate repo) |
| spreadsheets | 064390746177 | No | Static site only (managed by separate repo) |
| submit-ci | 367191799875 | Test data only | No real user data at risk |
| submit-prod | 972912397388 | Yes | User data, HMRC tokens, subscription data |
| submit-backup | 914216784828 | Backup copies | Read-only vault, no application code |

**Key principle**: Gateway and spreadsheets are managed by their own repositories (`diy-accounting-uk/www.diyaccounting.co.uk` and `diy-accounting-uk/spreadsheets.diyaccounting.co.uk` respectively). Incident handling for those sites is outside this runbook's scope.

**First step in any incident**: Identify which account is affected. Use IAM Identity Center SSO portal (`https://d-9c67480c02.awsapps.com/start/`) to access any account's console. Use AWS CLI SSO profiles (`aws --profile submit-prod ...`, `aws --profile submit-ci ...`, etc.) for programmatic investigation.

### 6.2 When a Breach Occurs

**72-hour notification requirement** applies to UK GDPR breaches.

1. **Identify affected account(s)**: Check CloudTrail in each account via SSO
2. **Assess impact**: What data affected? How many users? Which account(s)?
3. **Contain**: Revoke credentials in the affected account, block access, rotate secrets. Account boundaries mean containment can be per-account.
4. **Notify within 72 hours**:
   - **ICO**: https://ico.org.uk/make-a-complaint/data-protection-complaints/
   - **HMRC**: SDSTeam@hmrc.gov.uk (if OAuth tokens or HMRC data affected)
   - **Affected users**: Email with details and recommended actions
5. **Document**: Keep records of incident, response, and remediation

### 6.3 Breach Types Requiring Notification

- Unauthorized access to DynamoDB (bundles, receipts)
- Exposed OAuth tokens or HMRC credentials
- AWS credential compromise
- Data exfiltration or ransomware
- Accidental public exposure of user data

### 6.4 Immediate Actions by Secret Type

| Compromised Secret | Immediate Actions |
|--------------------|-------------------|
| `GOOGLE_CLIENT_SECRET` | 1. Regenerate in Google Console<br>2. Update GitHub secret<br>3. Deploy with `force-identity-refresh` to affected environment(s) |
| `HMRC_CLIENT_SECRET` | 1. Regenerate in HMRC Developer Hub<br>2. Update GitHub secret<br>3. Run deploy environment workflow for affected environment(s) |
| `USER_SUB_HASH_SALT` | 1. Assess data exposure<br>2. **Do NOT rotate** (breaks data access)<br>3. Focus on access control in the affected account |
| GitHub OIDC trust | 1. Check OIDC trust policies in affected account(s)<br>2. Each account has its own OIDC provider scoped to its repo<br>3. Compromise of one repo's OIDC trust does not affect other accounts |
| AWS account credentials (SSO) | 1. Disable the compromised user in IAM Identity Center (management account 887764105431)<br>2. Review CloudTrail in all accounts<br>3. Check for data exfiltration in submit-prod (972912397388)<br>4. Verify backup vault integrity in submit-backup (914216784828) |

### 6.5 Account Compromise Procedures

**Single account compromised (e.g., submit-prod)**:
1. Revoke SSO access for the compromised session via IAM Identity Center
2. Review CloudTrail in the compromised account for unauthorized actions
3. Check if backups in submit-backup (914216784828) are intact (separate credentials)
4. Rotate all secrets in the compromised account's Secrets Manager
5. Redeploy from IaC if infrastructure was modified

**Management account compromised (887764105431)**:
1. DNS records could be modified -- verify Route53 records immediately
2. SSO portal access could be used to reach other accounts -- disable compromised user
3. No user data in management account -- focus on DNS integrity and SSO access revocation
4. Submit accounts' OIDC trust is independent of management account credentials

**GitHub repository compromised**:
1. Each account's OIDC trust is scoped to its own repo -- only the trusted repo can deploy
2. Revoke any leaked GitHub PATs
3. Review recent workflow runs for unauthorized deployments
4. OIDC trust in each account can be disabled independently

---

## 7. Security Monitoring

### 7.1 Automatic Alerts (CloudWatch Alarms)

| Detection | Alarm Name Pattern | Response |
|-----------|-------------------|----------|
| Lambda errors | `{env}-submit-*-errors` | Check Lambda logs for stack trace |
| Lambda log errors | `{env}-submit-*-log-errors` | Search logs for error pattern |
| API 5xx errors | `{env}-submit-api-5xx` | Check API Gateway + Lambda logs |
| Lambda throttles | `{env}-submit-*-throttles` | Potential abuse - check source |
| Health check failures | `{env}-ops-health-check` | Check CloudFront, API, Lambda |

### 7.2 Manual Monitoring Required

| Detection | Where to Find | Account | What It Indicates |
|-----------|---------------|---------|-------------------|
| Auth failures | CloudWatch Logs > custom-authorizer | submit-prod (972912397388) | Brute force, invalid tokens |
| WAF blocks | AWS Console > WAF > Sampled requests | submit-prod (972912397388) | Active attacks (SQLi, XSS) |
| Unusual AWS API calls | CloudTrail > Event History | Each account (check via SSO) | Credential compromise |
| HMRC API failures | CloudWatch Logs > hmrc-* | submit-prod (972912397388) | Token theft, unauthorized access |
| DNS changes | CloudTrail > Event History | management (887764105431) | Unauthorized DNS modification |
| SSO login anomalies | IAM Identity Center > Settings | management (887764105431) | Compromised SSO credentials |

### 7.3 Investigation Queries

**AWS CLI access** (use SSO profiles for each account):
```bash
aws sso login --sso-session diyaccounting
aws --profile submit-prod logs tail /aws/lambda/prod-env-custom-authorizer --since 1h
aws --profile submit-ci logs tail /aws/lambda/ci-env-custom-authorizer --since 1h
aws --profile management cloudtrail lookup-events --lookup-attributes AttributeKey=EventSource,AttributeValue=route53.amazonaws.com
```

**CloudWatch Logs Insights - Auth Failures** (run in submit-prod or submit-ci account):
```
fields @timestamp, @message
| filter @logStream like /custom-authorizer/
| filter level = "WARN" or level = "ERROR"
| sort @timestamp desc
| limit 100
```

### 7.4 Monitoring Schedule

| Frequency | Tasks |
|-----------|-------|
| **Weekly** | Check CloudWatch alarms (submit-prod), review auth failures, check WAF activity |
| **Monthly** | Review DynamoDB growth (submit-prod), audit CloudTrail across all accounts via SSO, verify backup vault integrity (submit-backup) |
| **Quarterly** | Test export/deletion scripts, review IAM policies per account, update this document |
| **Annually** | Rotate OAuth secrets, disaster recovery test (restore from cross-account backup), penetration testing |

---

## 8. Data Retention

| Data Type | Retention Period | Cleanup Method | Account |
|-----------|------------------|----------------|---------|
| Active user bundles | Until account deletion | Manual deletion script | submit-prod (972912397388) |
| Closed account data | 30 days after closure | `scripts/cleanup-deleted-accounts.js` | submit-prod |
| HMRC receipts | 7 years (legal requirement) | DynamoDB TTL (automatic) | submit-prod |
| HMRC API audit trail | 28 days | DynamoDB TTL (automatic) | submit-prod |
| Async request tables | 1 hour | DynamoDB TTL (automatic) | submit-ci / submit-prod |
| CloudWatch logs | 30-90 days | Retention policy (automatic) | submit-ci / submit-prod |
| Cross-account backups | 90 days (daily copies) | Vault lifecycle (planned) | submit-backup (914216784828) |

---

## 9. Regulatory Compliance

### 9.1 UK GDPR Requirements

- ✅ Data subject requests: 30-day response
- ✅ Breach notification: 72-hour requirement
- ✅ Privacy policy: `web/public/privacy.html`
- ✅ Terms of use: `web/public/terms.html`

### 9.2 HMRC MTD Requirements

- ✅ Fraud Prevention Headers: Gov-Client-* headers on all API calls
- ✅ OAuth Token Security: Never logged, masked in audit trail
- ✅ Penetration testing (Zap scan)

---

## 10. Public Repository Security

All four repositories are **public on GitHub**. The security model is "secure by design" -- no security through obscurity. This section covers the submit repository (`diy-accounting-uk/submit.diyaccounting.co.uk`). Gateway (`diy-accounting-uk/www.diyaccounting.co.uk`), spreadsheets (`diy-accounting-uk/spreadsheets.diyaccounting.co.uk`), and root (`diy-accounting-uk/root.diyaccounting.co.uk`) follow the same principle.

### 10.1 What Is Public (By Design)

| Item | Why It's Safe |
|------|---------------|
| AWS Account IDs (887764105431, 283165661847, 064390746177, 367191799875, 972912397388, 914216784828) | Account IDs are identifiers, not secrets. AWS IAM controls access per account. |
| HMRC Client IDs | Public OAuth identifiers. Secrets stored in GitHub Secrets -> AWS Secrets Manager. |
| Secret ARNs | Just references to secrets, not the secrets themselves. |
| Infrastructure code (CDK) | Reveals architecture but not access credentials. |
| `.env.ci`, `.env.prod` | No secrets, only configuration and ARN references. |
| `submit.passes.toml` | Pass type definitions only, no secrets or user data. |

### 10.2 What Is Kept Private

| Item | Protection Method |
|------|-------------------|
| OAuth client secrets | GitHub Secrets → AWS Secrets Manager (never in code) |
| User sub hash salt | AWS Secrets Manager only (auto-generated) |
| GitHub PATs | GitHub Secrets only |
| HMRC test credentials | GitHub Secrets + regenerated per test run |
| Salt backups | `.gitignore` excludes `salt-backup-*.json` |
| Local dev secrets | `.gitignore` excludes `/.env`, `/secrets.env` |

### 10.3 Security Verification (Passed)

| Check | Result |
|-------|--------|
| No AWS access keys (AKIA/ASIA) in code | ✅ Clean |
| No GitHub PATs (ghp_/gho_) in code | ✅ Clean |
| No hardcoded passwords | ✅ All from env vars |
| Sensitive files in .gitignore | ✅ Properly configured |
| Secrets use ARN references only | ✅ Never inline values |

### 10.4 HMRC Production URL Placeholder

**Note**: `.env.prod` contains placeholder `HMRC_BASE_URI=https://to0request0from0hmrc-api.service.hmrc.gov.uk`. This must be updated with the real production URL when HMRC grants production access.

---

## 11. Console Access and AWS CLI

### 11.1 IAM Identity Center (SSO)

All console and CLI access uses IAM Identity Center. There are no IAM users. One SSO portal provides access to all 6 accounts.

- **SSO portal**: `https://d-9c67480c02.awsapps.com/start/`
- **MFA**: Required for all SSO sessions
- **Session duration**: ~8-12 hours across all profiles

### 11.2 AWS CLI SSO Profiles

```bash
# Login once (opens browser for MFA)
aws sso login --sso-session diyaccounting

# Use --profile for any account
aws --profile management route53 list-hosted-zones
aws --profile submit-ci cloudformation describe-stacks
aws --profile submit-prod dynamodb scan --table-name prod-env-bundles
aws --profile submit-backup backup list-backup-vaults
```

| Profile | Account ID | Purpose |
|---------|------------|---------|
| `management` | 887764105431 | Route53, Organizations, IAM Identity Center |
| `gateway` | 283165661847 | Gateway static site (managed by separate repo) |
| `spreadsheets` | 064390746177 | Spreadsheets static site (managed by separate repo) |
| `submit-ci` | 367191799875 | Submit CI environment |
| `submit-prod` | 972912397388 | Submit production environment |
| `submit-backup` | 914216784828 | Cross-account backup vault |

### 11.3 Credential Model

| Access method | How it works | Scope |
|---------------|-------------|-------|
| **SSO portal** | Browser-based login with MFA | All accounts (per assigned permission set) |
| **AWS CLI SSO profiles** | `aws sso login` + `--profile` per command | All accounts (per assigned permission set) |
| **GitHub Actions OIDC** | Per-account OIDC provider, scoped to the deploying repository | One account per OIDC trust |
| **Legacy IAM users** | Removed during Phase 1.5 cleanup | None (SSO replaced all IAM users) |

Each account's OIDC provider trusts only its own repository:

| Account | OIDC Trust |
|---------|-----------|
| management (887764105431) | `repo:diy-accounting-uk/root.diyaccounting.co.uk:*` |
| gateway (283165661847) | `repo:diy-accounting-uk/www.diyaccounting.co.uk:*` |
| spreadsheets (064390746177) | `repo:diy-accounting-uk/spreadsheets.diyaccounting.co.uk:*` |
| submit-ci (367191799875) | `repo:diy-accounting-uk/submit.diyaccounting.co.uk:*` |
| submit-prod (972912397388) | `repo:diy-accounting-uk/submit.diyaccounting.co.uk:*` |

---

## 12. Backup and Restore

### 12.1 Current State

Each submit account has a local backup vault with daily, weekly, and monthly compliance schedules. Cross-account backup shipping to submit-backup (914216784828) is planned but not yet implemented.

| Resource | submit-ci (367191799875) | submit-prod (972912397388) | submit-backup (914216784828) |
|----------|--------------------------|----------------------------|------------------------------|
| Local vault | `ci-env-primary-vault` | `prod-env-primary-vault` | -- |
| Backup KMS key | `ci-env-backup` | `prod-env-backup` | Planned |
| Cross-account vault | -- | -- | `submit-cross-account-vault` (planned) |

### 12.2 Backup Schedules (Local Vault)

| Schedule | Time (UTC) | Retention | Cold storage |
|----------|-----------|-----------|-------------|
| Daily | 02:00 | 35 days | No |
| Weekly (Sundays) | 03:00 | 90 days | No |
| Monthly compliance (1st) | 04:00 | 7 years (2,555 days) | After 90 days |

### 12.3 Recovery Objectives

| Metric | Target | Implementation |
|--------|--------|----------------|
| **RPO** (Recovery Point Objective) | < 24 hours | Daily backups + PITR on critical tables |
| **RTO** (Recovery Time Objective) | < 4 hours | Automated restore scripts |
| **Backup Retention** | 90 days (cross-account), 7 years (monthly compliance) | Vault lifecycle policies |

### 12.4 Disaster Recovery

IaC repeatability is proven: submit-prod (972912397388) was deployed from scratch to a new account during Phase 1.4, using only code + backups + salt. See `AWS_ACCOUNT_MIGRATION.md` for details.

**Recovery equation**: Salt + Backups + Code = Full recovery from total loss.

For detailed backup architecture, table inventory, cross-account backup plans, and restore testing procedures, see `_developers/backlog/PLAN_CROSS_ACCOUNT_BACKUPS.md`.

---

## 13. Holding Failover

Procedure for moving live submit.diyaccounting.co.uk traffic onto a maintenance page and back.

### 13.1 What the holding page is

`HoldingStack`, one per account:

| Environment | Account | Stack | Holding domain | `OriginFor` tag | Live domains it takes over |
|---|---|---|---|---|---|
| prod | submit-prod (972912397388) | `prod-env-HoldingStack` | `holding.submit.diyaccounting.co.uk` | `holding.submit.diyaccounting.co.uk` | `submit.diyaccounting.co.uk`, `prod-submit.diyaccounting.co.uk` |
| ci | submit-ci (367191799875) | `ci-env-HoldingStack` | `ci-holding.submit.diyaccounting.co.uk` | `ci-holding.submit.diyaccounting.co.uk` | `ci-submit.diyaccounting.co.uk` |

The page is titled "Maintenance – submit.diyaccounting.co.uk" with the heading "We'll be right
back". Every response carries a `Server: DIY-Accounting` header. A 403 or 404 on the distribution
also renders the holding page, so deep links fail over cleanly instead of showing an S3 error.

The certificate is imported by ARN — two certificates, one per account, because ci and prod run in
separate AWS accounts. Each is issued once by dispatching `request-holding-cert.yml` with
`environment-name: ci` or `environment-name: prod` — a bootstrap step, not a per-failover step.
That workflow requests the certificate in the target account, assumes the management account's
Route53 delegate role to write the DNS validation records, waits for validation, then prints the
certificate ARN to store as the environment-scoped repository variable
`SUBMIT_HOLDING_CERTIFICATE_ARN`. Until that variable is set for an environment,
`deploy-environment.yml` skips the holding stack deployment for it entirely.

### 13.2 When to fail over

This is a last resort, for when the site cannot be fixed quickly or is under attack. It is not a
performance measure and not a fix for one broken route — it replaces the whole site with a static
page.

Reach for it when a deploy has left the origin broken and rolling forward is not immediate, when
an attack is in progress, or when an AWS incident is affecting the origin.

What makes it worth having: the holding page is a static file in S3 behind CloudFront, with no
dynamic AWS deployment anywhere in the request path. There is nothing to inject into, because
nothing is served from a database or a function, and CloudFront absorbs volume that would
overwhelm an origin. So it stays up in exactly the situations that take the real site down.

Expect the switch to be slow, and accept it. Users cannot work either way while the site is
broken, so several minutes of blank responses during the cutover costs nothing that the incident
has not already cost.

### 13.3 Who authorises

The operator. There is no standing delegation — nobody dispatches `set-origins.yml` without the
operator's direct instruction.

### 13.4 How to fail over

Dispatch `set-origins.yml` on this repo:

- `domain-source`: `holding`
- `environment-name`: `ci` or `prod`

This points the apex domain (`submit.diyaccounting.co.uk` for prod) at the holding distribution:
it finds whichever CloudFront distribution currently holds that alias, strips it from that
distribution, waits for the change to deploy, adds the alias to the holding distribution instead,
waits again, then UPSERTs the apex A/AAAA records to alias the holding distribution's CloudFront
domain name. No DNS TTL wait is involved — the alias record change is what a resolver sees on its
next lookup.

### 13.5 Expected time to take effect

Measured on a real ci exercise: **23 minutes to fail over, 31 minutes to restore**, dominated by
two `aws cloudfront wait distribution-deployed` calls each way. Restore is the slower leg — budget
half an hour for it, and do not assume coming back is quicker than going out.

**The live domain serves nothing for most of that window.** CloudFront enforces alias uniqueness
globally, so the name has to be fully released from the live distribution and propagated before
the holding distribution can claim it. There is no overlap and no progressive cutover: the site
goes blank, then the holding page appears. That is inherent to the mechanism, not a fault.

### 13.6 How to fail back

Dispatch `set-origins.yml` again with `domain-source: last-known-good` and the same
`environment-name`. This reads `/submit/<env>/last-known-good-deployment` from SSM Parameter
Store — the deployment name submit's own `deploy.yml` records after every green smoke test — and
points the apex domain back at that deployment's CloudFront distribution, the same way a normal
deploy would.

Confirm the apex alias is back on the expected deployment's distribution:

```bash
aws cloudfront get-distribution --id <deployment-distribution-id> \
  --query 'Distribution.DistributionConfig.Aliases.Items'
```

### 13.7 How to verify while failed over

```bash
curl -sI https://submit.diyaccounting.co.uk/
```

Expect `200`, a `Server: DIY-Accounting` header, and a body that is the holding page, not the live
site.

### 13.8 Rehearsal

Exercise the `ci` environment twice a year. Never rehearse against `prod`.

### 13.9 Deploying while failed over

There is no guard against this, and unlike gateway and spreadsheets it does not fail loudly — it
succeeds and quietly undoes the failover. Every run of this repo's own `deploy.yml` ends with a
`set-origins` job that unconditionally points the apex domain at the newly deployed distribution,
using the same alias-move mechanism as `set-origins.yml` itself. If that job runs while the site is
failed over, it moves the apex alias straight off the holding distribution and onto the new
deployment, whether or not the underlying problem that caused the failover is fixed. Before
merging or dispatching a deploy while a failover is live, restore first
(`set-origins.yml` with `domain-source: last-known-good`), confirm the apex alias is back where
expected, then deploy.

### 13.10 Certificate coverage for new domains

Failover adds the live apex domain as an alias to the holding distribution, and CloudFront refuses
an alias the distribution's certificate does not cover. If a new live domain is added to this
site, it must be added to the holding certificate's subject alternative names before it can ever
be failed over. Re-run `request-holding-cert.yml` for the affected environment with the expanded
SAN list, wait for validation, and update the `SUBMIT_HOLDING_CERTIFICATE_ARN` variable for that
environment with the new ARN before relying on failover for that domain.

---

## Appendix A: File References

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-environment.yml` | Secret creation, Identity stack deployment |
| `.github/workflows/manage-secrets.yml` | Secret verification, backup, restore |
| `app/services/subHasher.js` | HMAC-SHA256 hashing with salt |
| `app/lib/dataMasking.js` | Sensitive data masking for DynamoDB |
| `infra/main/java/.../utils/SubHashSaltHelper.java` | CDK helper for salt IAM permissions |
| `infra/main/java/.../stacks/IdentityStack.java` | Cognito + Google IdP configuration |
| `infra/main/java/.../stacks/BackupStack.java` | CDK infrastructure for local backup vault and plans |
| `infra/main/java/.../stacks/DataStack.java` | DynamoDB table definitions including salt encryption KMS key |
| `scripts/aws-accounts/restore-salt.sh` | Cross-account salt restoration (Paths 1 and 3) |
| `scripts/aws-accounts/restore-tables-from-backup.sh` | Cross-account DynamoDB table copy |

---

## Appendix B: Account Quick Reference

| Account | ID | SSO Profile | Contains User Data? |
|---------|-----|-------------|---------------------|
| management | 887764105431 | `management` | No |
| gateway | 283165661847 | `gateway` | No (separate repo) |
| spreadsheets | 064390746177 | `spreadsheets` | No (separate repo) |
| submit-ci | 367191799875 | `submit-ci` | Test data only |
| submit-prod | 972912397388 | `submit-prod` | Yes |
| submit-backup | 914216784828 | `submit-backup` | Backup copies (planned) |

SSO portal: `https://d-9c67480c02.awsapps.com/start/`

---

## Appendix C: Contact Information

| Contact | Purpose | Details |
|---------|---------|---------|
| Administrator | Data requests, incidents | admin@diyaccounting.co.uk |
| ICO | GDPR guidance, breach reporting | https://ico.org.uk/ |
| HMRC SDS Team | MTD compliance | SDSTeam@hmrc.gov.uk |
| AWS Support | Infrastructure incidents | Via AWS Console (access any account via SSO portal) |

---

*This document should be reviewed quarterly and updated whenever procedures change.*
