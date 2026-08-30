# AWS Cross-Account Backups

**Version**: 1.0 | **Date**: February 2026 | **Status**: Planned (Phase 3 not yet started)

---

## 1. Overview

Cross-account backups isolate backup data from the production and CI accounts so that a compromise or accidental deletion in one account cannot destroy both live data and its backups. The submit-backup account (914216784828) exists solely to receive and store backup copies from submit-prod (972912397388) and submit-ci (367191799875). It runs no application code and has no inbound network paths — it is a receive-only vault.

**Why cross-account?**

| Risk | Single-account backup | Cross-account backup |
|------|----------------------|---------------------|
| Accidental table deletion | Protected by PITR (35 days) | Protected by PITR + independent vault copy |
| IAM credential compromise | Attacker can delete backups | Attacker cannot reach backup account |
| Account suspension/closure | All data lost | Backups survive in separate account |
| CloudFormation stack teardown | Vault deleted with stack | Vault in different account, unaffected |
| Ransomware / malicious admin | Can delete local vault | Cannot delete cross-account vault (separate credentials) |

**Recovery equation**: Salt + Backups + Code = Full recovery from total loss.

---

## 2. Current Backup State

### What exists today

**BackupStack** is deployed in both submit-prod (972912397388) and submit-ci (367191799875). Each account has:

| Resource | Purpose |
|----------|---------|
| Primary vault (`{env}-env-primary-vault`) | Local backup storage, KMS-encrypted |
| Backup plan (`{env}-env-backup-plan`) | Three schedules: daily, weekly, monthly compliance |
| Backup KMS key (`{env}-env-backup`) | Encryption at rest for local vault |
| S3 exports bucket (`{env}-env-BackupExports`) | DynamoDB export storage, lifecycle to IA (30d) then Glacier (90d) |
| Backup IAM role (`{env}-env-backup-role`) | Service role for AWS Backup operations |

**Backup schedules (local vault):**

| Schedule | Time (UTC) | Retention | Cold storage |
|----------|-----------|-----------|-------------|
| Daily | 02:00 | 35 days | No |
| Weekly (Sundays) | 03:00 | 90 days | No |
| Monthly compliance (1st) | 04:00 | 7 years (2,555 days) | After 90 days |

**Tables protected by BackupStack** (3 critical tables):
- `{env}-env-receipts`
- `{env}-env-bundles`
- `{env}-env-hmrc-api-requests`

**DynamoDB TTL configuration:**

| Table | TTL attribute | Retention |
|-------|--------------|-----------|
| `{env}-env-hmrc-api-requests` | `ttl` | 28 days |
| `{env}-env-receipts` | `ttl` | 7 years (HMRC compliance) |
| `{env}-env-bundles` | `ttl` | Enabled (application-managed) |
| 5 async-request tables | `ttl` | 1 hour |

**PITR status**: Enabled on receipts, bundles, passes and subscriptions in prod (verified 2026-08-30).

**Pre-migration backups**: On-demand backups with prefix `pre-migration-20260221` exist in the old management account (887764105431). These were created before the Phase 1.4 data migration to 972912397388 and cover all 11 prod tables. These are a safety net, not a long-term backup strategy.

---

## 3. DynamoDB Table Inventory

Sizes measured in submit-prod (972912397388), February 2026.

### Critical tables (backed up)

| Table | Items | Size | TTL | Backup priority |
|-------|------:|-----:|-----|----------------|
| `prod-env-hmrc-api-requests` | 19,691 | 46 MB | 28 days | HIGH (audit trail) |
| `prod-env-receipts` | 1,156 | 384 KB | 7 years | CRITICAL (HMRC compliance) |
| `prod-env-bundles` | 1,035 | 285 KB | App-managed | CRITICAL (subscription data + salt backup) |

### Important tables (should be backed up)

| Table | Items | Size | TTL | Backup priority |
|-------|------:|-----:|-----|----------------|
| `prod-env-passes` | 1,182 | 367 KB | None | MEDIUM (invitation codes) |
| `prod-env-subscriptions` | 30 | 10 KB | None | HIGH (billing state) |

### Ephemeral tables (not backed up)

| Table | Items | Size | TTL | Notes |
|-------|------:|-----:|-----|-------|
| `prod-env-bundle-post-async-requests` | 0 | 0 | 1 hour | Transient request tracking |
| `prod-env-bundle-delete-async-requests` | 0 | 0 | 1 hour | Transient request tracking |
| `prod-env-hmrc-vat-return-post-async-requests` | 0 | 0 | 1 hour | Transient request tracking |
| `prod-env-hmrc-vat-return-get-async-requests` | 0 | 0 | 1 hour | Transient request tracking |
| `prod-env-hmrc-vat-obligation-get-async-requests` | 0 | 0 | 1 hour | Transient request tracking |

### Derived tables (not backed up)

| Table | Items | Size | Notes |
|-------|------:|-----:|-------|
| `prod-env-bundle-capacity` | ~few | Tiny | Reconciliation Lambda rebuilds from bundles table every 5 minutes |

**Total critical data**: ~23,000 items, ~47 MB. Negligible storage cost (~$0.014/month).

---

## 4. Data Flow Diagram

```
+-----------------+     +-----------------+
|   submit-ci     |     |  submit-prod    |
|  367191799875   |     |  972912397388   |
|                 |     |                 |
|  CI DynamoDB    |     | Prod DynamoDB   |
|       |         |     |       |         |
|  Local Vault    |     |  Local Vault    |
|  (35d/90d/7yr)  |     |  (35d/90d/7yr)  |
|       |         |     |       |         |
+-------|---------+     +-------|---------+
        |                       |
        |   Cross-Account Copy  |
        |    (Daily, 90-day     |
        |     retention)        |
        +-----------+-----------+
                    |
                    v
        +-----------------------+
        |    submit-backup      |
        |    914216784828       |
        |                       |
        |  Cross-Account Vault  |
        |  KMS-encrypted        |
        |  (90-day retention)   |
        +-----------+-----------+
                    |
                    |  Restore Testing
                    |  (Phase 3.3: copy
                    |   back to CI)
                    v
        +-----------------------+
        |   submit-ci           |
        |   (restored tables)   |
        |   -> behaviour tests  |
        +-----------------------+
```

---

## 5. Salt Architecture

The user sub hash salt is the most critical secret in the system. It is used to create HMAC-SHA256 hashes of user `sub` claims from Cognito tokens. These hashes serve as DynamoDB partition keys. If the salt is lost, all user data becomes inaccessible.

### Three recovery paths

| Path | Storage | Location | Recovery method |
|------|---------|----------|----------------|
| **Path 1** (primary) | AWS Secrets Manager | `{env}/submit/user-sub-hash-salt` in each account | Automated copy via `restore-salt.sh` |
| **Path 2** (manual) | Physical card | 8-word passphrase, offline | Operator manually enters passphrase |
| **Path 3** (DynamoDB) | KMS-encrypted item | `system#config/salt-v2` in bundles table | Cross-account restore, may need KMS re-encryption |

### Salt in the backup strategy

The salt is stored in Secrets Manager (Path 1) in each account. It is also backed up as a KMS-encrypted DynamoDB item in the bundles table (Path 3). When the bundles table is backed up to the cross-account vault, the Path 3 salt copy travels with it.

**Cross-account KMS consideration**: The Path 3 DynamoDB item is encrypted with the source account's KMS key (`{env}-env-salt-encryption`). When restoring to a different account, the ciphertext must be re-encrypted with the target account's KMS key. Options:
1. Grant the target account `kms:Decrypt` on the source key (temporary cross-account grant)
2. Decrypt in source, re-encrypt with target key
3. Run migration 003 in the target account to regenerate the Path 3 backup with the new KMS key

### Salt in Secrets Manager

The salt value is a JSON registry with versioned salt values:
```json
{
  "current": "v2",
  "versions": {
    "v1": "base64-encoded-32-byte-value",
    "v2": "base64-encoded-32-byte-value"
  }
}
```

The salt secret is created by `deploy-environment.yml` (idempotent -- only creates if not exists) and validated by `deploy.yml` before Lambda deployment. It is never rotated in normal operation because rotation would orphan all existing user data.

---

## 6. Phase 3.1: Backup Account Setup

**Goal**: Provision the submit-backup account (914216784828) with a cross-account vault, KMS key, and access policies.

**Current state**: Account created and placed in Backup OU. No resources provisioned.

| Step | Description | Details |
|------|-------------|---------|
| 3.1.1 | Create `submit-backup` account | Done. Account 914216784828, Backup OU. |
| 3.1.2 | Assign SSO access | Assign `AdministratorAccess` for initial setup. Create a restricted `BackupVaultAccess` permission set afterward (read-only on vault, no delete). |
| 3.1.3 | Create cross-account vault | `submit-cross-account-vault` in submit-backup (eu-west-2). KMS-encrypted. `RemovalPolicy.RETAIN` (this is the one place where RETAIN is correct -- the vault is the last line of defense). |
| 3.1.4 | Set vault access policy | Allow principals from submit-prod (972912397388) and submit-ci (367191799875) to call `backup:CopyIntoBackupVault`. Deny `backup:DeleteBackupVault` and `backup:DeleteRecoveryPoint` from all principals except the backup account's admin role. |
| 3.1.5 | Create KMS key | Customer-managed key in submit-backup for encrypting backup copies at rest. Enable key rotation. Grant `kms:Encrypt` and `kms:GenerateDataKey` to the source accounts' backup service roles. |
| 3.1.6 | Enable CloudTrail | Audit all API calls in the backup account. Ship logs to S3 within the backup account. |
| 3.1.7 | Downgrade SSO access | Replace `AdministratorAccess` with `BackupVaultAccess` (custom permission set: read vault, list recovery points, start restore jobs, no delete). |

### Vault access policy (draft)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCrossAccountCopy",
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::972912397388:role/prod-env-backup-role",
          "arn:aws:iam::367191799875:role/ci-env-backup-role"
        ]
      },
      "Action": "backup:CopyIntoBackupVault",
      "Resource": "*"
    },
    {
      "Sid": "DenyDelete",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "backup:DeleteBackupVault",
        "backup:DeleteRecoveryPoint"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalAccount": "914216784828"
        }
      }
    }
  ]
}
```

---

## 7. Phase 3.2: Cross-Account Backup Shipping

**Goal**: Configure BackupStack in submit-prod and submit-ci to copy daily backups to the cross-account vault in submit-backup.

| Step | Description | Details |
|------|-------------|---------|
| 3.2.1 | Update BackupStack CDK code | Add a `copyAction` to the daily backup rule that copies to the cross-account vault. Requires the vault ARN and a KMS key ARN from the backup account as CDK context or environment variables. |
| 3.2.2 | Add `passes` and `subscriptions` to backup selection | Currently only receipts, bundles, and hmrc-api-requests are backed up. Add passes and subscriptions tables to the backup selection. |
| 3.2.3 | Create cross-account IAM roles | In submit-prod and submit-ci: update the backup service role with `backup:CopyIntoBackupVault` permission for the backup account's vault ARN. |
| 3.2.4 | Enable PITR on critical tables | Enable Point-in-Time Recovery on: receipts, bundles, passes, subscriptions. Not needed on hmrc-api-requests (28-day TTL, covered by daily backups) or async-request tables (ephemeral). |
| 3.2.5 | Add backup account context to CDK | Add `backupAccountVaultArn` and `backupAccountKmsKeyArn` to `cdk-environment/cdk.json` for both CI and prod contexts. |
| 3.2.6 | Deploy updated BackupStack | Deploy to both CI and prod via `deploy-environment.yml`. |
| 3.2.7 | Verify backup shipping | Trigger a manual backup job. Wait for cross-account copy to complete (check vault in submit-backup). Verify the recovery point appears with correct metadata. |

### BackupStack changes (CDK)

The daily backup rule gains a `copyAction`:

```java
BackupPlanRule.Builder.create()
    .ruleName("DailyBackup")
    .backupVault(this.primaryVault)
    .scheduleExpression(Schedule.cron(...))
    .deleteAfter(Duration.days(props.dailyBackupRetentionDays()))
    .copyActions(List.of(BackupPlanCopyActionProps.builder()
        .destinationBackupVault(BackupVault.fromBackupVaultArn(
            this, "CrossAccountVault", props.crossAccountVaultArn()))
        .deleteAfter(Duration.days(90))
        .build()))
    .build();
```

### Cross-account copy retention

| Source schedule | Local retention | Cross-account retention |
|----------------|----------------|------------------------|
| Daily | 35 days | 90 days |
| Weekly | 90 days | Not copied (local is sufficient) |
| Monthly compliance | 7 years | Not copied (local cold storage is sufficient) |

Daily copies to the backup account provide 90-day retention, which covers the gap between "local vault compromised" and "someone notices." Monthly compliance backups stay local with cold storage (the 7-year HMRC retention is a regulatory requirement better served by the source account's vault with cold storage tiering).

---

## 8. Phase 3.3: Restore Testing (Prod-Replica in CI)

**Goal**: Prove that backups are usable by restoring production data into CI and running the full behaviour test suite, including salt verification.

| Step | Description | Details |
|------|-------------|---------|
| 3.3.1 | Copy prod backup to CI | From the submit-backup vault, start a restore job targeting submit-ci (367191799875). Restore the 5 critical tables with target names like `ci-env-receipts-restored`, `ci-env-bundles-restored`, etc. |
| 3.3.2 | Restore the salt | Copy the prod salt secret from submit-backup or submit-prod into submit-ci as `ci/submit/user-sub-hash-salt-restored`. This ensures the restored data's hashed partition keys match. |
| 3.3.3 | Handle Path 3 KMS re-encryption | The `system#config/salt-v2` item in the restored bundles table is encrypted with prod's KMS key. Either: (a) grant CI account `kms:Decrypt` on prod's salt encryption key, (b) decrypt and re-encrypt with CI's key, or (c) run migration 003 to regenerate. |
| 3.3.4 | Configure CI for restored tables | Point the CI environment at the restored table names. This requires either: (a) environment variable overrides for table names, or (b) renaming restored tables to match CI naming. Option (a) is cleaner for testing. |
| 3.3.5 | Run behaviour tests | `npm run test:submitVatBehaviour-ci` against the restored data. Verify: Lambda cold starts load the restored salt, user data is accessible via hashed partition keys, receipts and bundles resolve correctly. |
| 3.3.6 | Clean up | Delete restored tables (`ci-env-*-restored`). Delete the temporary salt secret. Revert any CI configuration changes. |

### Success criteria

- All 5 critical tables restored without errors
- Salt secret value matches prod (Path 1 verification)
- Lambda functions start successfully with the restored salt
- At least one user's data is accessible (hashed partition key resolves)
- Behaviour tests pass (or fail only for reasons unrelated to data integrity)

---

## 9. Phase 3.4: Automated Restore Testing

**Goal**: Monthly scheduled GitHub Actions workflow that validates backup integrity without manual intervention.

### Workflow: `test-backup-restore.yml`

```
Schedule: Monthly (1st of month, 06:00 UTC -- after the monthly compliance backup at 04:00)

Jobs:
  1. restore-from-backup
     - Authenticate to submit-backup (914216784828) and submit-ci (367191799875)
     - List latest recovery points in cross-account vault
     - Start restore job for critical tables to CI account
     - Wait for restore completion (poll every 60s, timeout 30min)

  2. verify-restore (depends on restore-from-backup)
     - Copy prod salt to CI (temporary secret)
     - Configure CI environment for restored tables
     - Run behaviour test subset (smoke test, not full suite)
     - Report results

  3. cleanup (depends on verify-restore, runs always)
     - Delete restored tables
     - Delete temporary salt secret
     - Post result to Telegram (or SNS topic)

  4. report
     - Create GitHub Actions annotation with pass/fail
     - On failure: create GitHub Issue for investigation
```

### Monitoring

| Signal | Action |
|--------|--------|
| Restore job fails | Investigate vault access policy, KMS permissions, or corrupted recovery point |
| Salt mismatch | Salt has been rotated without updating backups -- investigate |
| Behaviour tests fail | Compare with normal CI results to isolate backup-specific issues |
| Workflow times out | Check DynamoDB restore throughput, increase timeout |

---

## 10. Per-Account Backup Resources

### submit-prod (972912397388)

| Resource | Purpose |
|----------|---------|
| Local vault (`prod-env-primary-vault`) | 35d daily, 90d weekly, 7yr monthly compliance |
| Backup KMS key (`prod-env-backup`) | Encrypts local vault recovery points |
| Salt encryption KMS key (`prod-env-salt-encryption`) | Encrypts Path 3 salt backup in DynamoDB |
| S3 exports bucket | DynamoDB exports with lifecycle to Glacier |
| Backup IAM role (`prod-env-backup-role`) | Service role for backup + cross-account copy |
| Secrets Manager (`prod/submit/user-sub-hash-salt`) | Path 1 salt storage |
| DynamoDB (`system#config/salt-v2` in bundles) | Path 3 salt backup |

### submit-ci (367191799875)

| Resource | Purpose |
|----------|---------|
| Local vault (`ci-env-primary-vault`) | Same schedules, shorter practical retention (test data) |
| Backup KMS key (`ci-env-backup`) | Encrypts local vault recovery points |
| Salt encryption KMS key (`ci-env-salt-encryption`) | Encrypts Path 3 salt backup in DynamoDB |
| S3 exports bucket | DynamoDB exports with lifecycle |
| Backup IAM role (`ci-env-backup-role`) | Service role for backup + cross-account copy |
| Secrets Manager (`ci/submit/user-sub-hash-salt`) | Path 1 salt storage |

### submit-backup (914216784828) -- to be provisioned

| Resource | Purpose |
|----------|---------|
| Cross-account vault (`submit-cross-account-vault`) | Receives daily copies from prod and CI. 90-day retention. |
| KMS key | Encrypts recovery points at rest in the backup vault |
| Vault access policy | Allows copy-in from prod and CI. Denies delete from external accounts. |
| CloudTrail | Audits all API calls |
| IAM (restricted) | No application roles. Read-only vault access for operators. |

---

## 11. Recovery Objectives

| Metric | Target | How achieved |
|--------|--------|-------------|
| **RPO** (Recovery Point Objective) | < 24 hours | Daily backup at 02:00 UTC. Worst case: failure at 01:59 UTC = ~24h of data loss. PITR on critical tables provides continuous recovery (RPO = 0 for point-in-time). |
| **RTO** (Recovery Time Objective) | < 4 hours | DynamoDB restore from backup: ~15-30 min for current data volume. Salt restoration: ~5 min. CDK deployment (if infrastructure lost): ~20 min. Behaviour test validation: ~5 min. Buffer for investigation: ~3 hours. |
| **Backup verification** | Monthly | Automated restore testing (Phase 3.4) validates backup integrity every month. |
| **Compliance retention** | 7 years | Monthly compliance backups with cold storage transition after 90 days. Covers HMRC record-keeping requirements for VAT submissions. |

### RPO by data type

| Data | RPO | Mechanism |
|------|-----|-----------|
| VAT receipts | 0 (continuous) | PITR + daily backup |
| Bundles (subscriptions) | 0 (continuous) | PITR + daily backup |
| Passes (invitation codes) | 0 (continuous) | PITR + daily backup |
| HMRC API requests | < 24 hours | Daily backup only (28-day TTL data, PITR not critical) |
| Async requests | N/A | Ephemeral (1-hour TTL), no backup needed |
| Salt | 0 | Immutable after creation, 3 recovery paths |

### Disaster recovery scenarios

| Scenario | Recovery steps | Estimated RTO |
|----------|---------------|---------------|
| Single table deleted | Restore from PITR or latest local backup | 15-30 min |
| Account compromised | Restore from cross-account vault in submit-backup. Redeploy infrastructure from code. Restore salt from Path 1/2/3. | 2-4 hours |
| Total loss (all accounts) | New AWS Organization. CDK bootstrap. Deploy from git. Restore data from offline backups (if cross-account vault also lost). Restore salt from Path 2 (physical card). | 4-8 hours |

---

## Existing Scripts

| Script | Purpose | Phase |
|--------|---------|-------|
| `scripts/aws-accounts/backup-prod-for-migration.sh` | On-demand DynamoDB backup + salt metadata export | 1.4 (done) |
| `scripts/aws-accounts/restore-salt.sh` | Cross-account salt restoration (Paths 1 and 3) | 1.4 (done) |
| `scripts/aws-accounts/restore-tables-from-backup.sh` | Cross-account DynamoDB table copy via scan+batch-write | 1.4 (done) |
| `scripts/aws-accounts/copy-secrets-to-account.sh` | Cross-account Secrets Manager copy | 1.4 (done) |

### Scripts to create (Phase 3)

| Script | Purpose | Phase |
|--------|---------|-------|
| `scripts/aws-accounts/setup-backup-account.sh` | Provision vault, KMS key, access policy in 914216784828 | 3.1 |
| `scripts/aws-accounts/verify-cross-account-backup.sh` | Trigger manual backup, verify copy appears in backup vault | 3.2 |
| `scripts/aws-accounts/restore-from-backup-vault.sh` | Restore tables from cross-account vault to CI for testing | 3.3 |

---

## Related Documentation

| Document | Content |
|----------|---------|
| `AWS_ACCOUNT_MIGRATION.md` | Account separation and repository separation history (Phase 1 & 2) |
| `_developers/archive/SALT_SECRET_RECOVERY.md` | Salt secret lifecycle, recovery procedures, troubleshooting |
| `_developers/archive/PLAN_SUB_HASH_VERSIONING.md` | Salt versioning registry design |
| `RUNBOOK_INFORMATION_SECURITY.md` | Security incident response including salt compromise |
| `infra/main/java/.../stacks/BackupStack.java` | CDK infrastructure for local backup vault and plans |
| `infra/main/java/.../stacks/DataStack.java` | DynamoDB table definitions including salt encryption KMS key |

---

*Extracted from Phase 3 of the account separation plan and related backup infrastructure. February 2026.*
