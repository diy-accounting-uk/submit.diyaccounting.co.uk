# Backup Strategy Implementation Plan

**Issue**: #398 - No backups are taken outside AWS internals
**Priority**: Important for HMRC approval
**Author**: Claude
**Date**: January 2026

---

## Executive Summary

This document describes a comprehensive backup strategy with:
1. **Phase 1**: Same-region local backups with PITR and AWS Backup
2. **Phase 2**: Multi-account backup strategy with dedicated backup account
3. **Disaster Recovery**: Scripts and procedures for account loss scenarios
4. **Monitoring**: Operations dashboard integration and backup health alarms


```
Set up monthly calendar reminder for salt backup
launch

```

---

## Current State (verified 2026-08-25)

All 11 `prod-env-*` DynamoDB tables have point-in-time recovery (PITR) switched off. AWS Backup
covers 3 of the 11 tables. The `submit-backup` account (914216784828) holds zero backup vaults.
The daily check meant to catch this has failed every run since it started.

| Table | Approx. items | PITR | AWS Backup plan |
|---|---|---|---|
| prod-env-receipts | 4,642 | Disabled | Yes |
| prod-env-bundles | 292 | Disabled | Yes |
| prod-env-hmrc-api-requests | 457 | Disabled | Yes |
| prod-env-passes | 7,515 | Disabled | No |
| prod-env-subscriptions | 172 | Disabled | No |
| prod-env-bundle-capacity | 1 | Disabled | No |
| prod-env-bundle-post-async-requests | 0 | Disabled | No |
| prod-env-bundle-delete-async-requests | 0 | Disabled | No |
| prod-env-hmrc-vat-return-post-async-requests | 0 | Disabled | No |
| prod-env-hmrc-vat-return-get-async-requests | 0 | Disabled | No |
| prod-env-hmrc-vat-obligation-get-async-requests | 0 | Disabled | No |

`prod-env-passes` holds more rows than `prod-env-receipts` and has no PITR, no AWS Backup
coverage, and TTL disabled. It has no recovery path at all.

The 11 `ci-env-*` tables in the submit-ci account also have PITR disabled. CI does have its own
AWS Backup plan and vault (`ci-env-primary-vault`, 162 recovery points), so the 3-of-11 coverage
gap is the same shape as prod.

This account is the destination the multi-account phase below depends on.

**Why PITR is off.** Commit `99dadc4e` (2026-01-10) added PITR using CDK `Table` constructs.
Commit `31559ee8` (2026-01-18), nine days later, replaced all 11 tables with
`KindCdk.ensureTable()`, an `AwsCustomResource` that calls the DynamoDB `createTable` API
directly and does nothing if the table already exists. That custom resource takes no PITR
parameter and has no update path to a live table. Turning PITR on again needs either a new
custom-resource call (an `updateContinuousBackups` call, for example) or moving these tables back
onto real CDK `Table` constructs. It is no longer the one-line `.pointInTimeRecovery(true)` this
document originally proposed in section 1.1 below. The custom resource also has no `onDelete`
handler, so a stack teardown never deletes the underlying table either. The removal-policy
checklist item further down is moot for the same reason.

**Why the daily check hasn't stopped this.** `.github/workflows/verify-backups.yml` has run 69
times since 2026-05-07 and failed every time. It correctly reports `DISABLED` for the three
tables it checks, in every run. It also reports the backup vault "not found." That part is a
naming bug, not a real gap. See "The verify-backups check is broken" further down.

The phase checklist later in this document still ticks off several PITR and DR items. Those
checkmarks recorded intent from January 2026, before the `ensureTable` refactor undid the PITR
part of it. The checklist has been corrected to match what's actually deployed.

The workspace `CLAUDE.md` states that data protection comes from backups, specifically 35-day
PITR, and not from CloudFormation `RemovalPolicy.RETAIN`. That is why every stack uses `DESTROY`.
With PITR off on all 11 prod tables, that argument currently has nothing behind it for 8 of the
11 tables, and only an AWS Backup local vault (not PITR, and not cross-account) behind the other
3.

---

## What to do, in order

Everything below is verified. This section is the whole backlog for backups — nothing about
backups is tracked anywhere else, and nothing here is in flight.

**1. Fix the vault-name bug in `verify-backups.yml`.** One line. `ENV_PREFIX` is already
`prod-env`, so `VAULT_NAME="${ENV_PREFIX}-env-primary-vault"` at line 156 asks for
`prod-env-env-primary-vault`. Drop the extra `-env`. Do this first: the workflow has failed all
69 runs since 2026-05-07, so the daily red tells nobody anything. Fixing it restores the signal
before anything is changed that the signal should verify.

**2. Decide how PITR gets back on.** Not a one-line prop. Commit `31559ee8` (2026-01-18) moved all
tables from CDK `Table` constructs to `KindCdk.ensureTable`, an `AwsCustomResource` wrapping a raw
`createTable` with no PITR parameter, which is what dropped the `pointInTimeRecovery(true)` added
nine days earlier in `99dadc4e`. `ensureTable` also no-ops against an existing table, so a
parameter added there would never reach the live ones. Either add an explicit
`updateContinuousBackups` custom-resource call, or move these tables back to `Table` constructs.
Both are real changes; pick deliberately.

**3. Widen backup coverage beyond three tables.** The `prod-env-critical-tables` selection names
receipts, bundles and hmrc-api-requests by ARN. The other eight have no PITR, no snapshots and no
cross-account copy. `prod-env-passes` holds 7,515 items against receipts' 4,642 — the larger table
is the unprotected one, and its TTL is disabled too.

**4. Decide whether the `submit-backup` account is real.** Account 914216784828 holds zero backup
vaults. Until it holds something, the workspace `CLAUDE.md` claim of cross-account copies does not
describe anything that exists.

**5. Reconcile `CLAUDE.md` with whatever is decided.** It states that data protection comes from
PITR and cross-account copies rather than `RemovalPolicy.RETAIN`, and that is the stated reason
every stack uses `DESTROY`. Either the protection catches up with the claim, or the claim changes.

## Current State Assessment

### What Exists Today

| Resource | Current Protection | Gap |
|----------|-------------------|-----|
| DynamoDB Tables | TTL-based expiry only | No PITR, no cross-region backup |
| Secrets Manager | AWS-managed replication | Needs cross-region replica |
| Cognito User Pool | AWS-managed | User list export only (passwords cannot be exported) |
| S3 Static Assets | Single region | No cross-region replication |

### Resources NOT Backed Up (By Design)

| Resource | Reason | Recovery Strategy |
|----------|--------|-------------------|
| **Cognito User Pool** | AWS Cognito does not support password/credential export due to security constraints. User passwords are stored in hashed form and cannot be extracted. | In DR scenario: (1) Export user metadata via `aws cognito-idp list-users`, (2) Import users to new pool without passwords, (3) Force password reset for all users via email. Users retain their `sub` identity. |
| **OAuth Tokens (HMRC)** | Tokens are short-lived (4 hours) and regenerated on user login. | Users re-authenticate with HMRC after DR. No backup needed. |
| **Session State** | Stored in browser sessionStorage, not persisted server-side. | Users restart their session after DR. No backup needed. |

### Critical Data Assets

| Asset | Criticality | Recovery Priority | Retention Requirement |
|-------|-------------|-------------------|----------------------|
| Receipts Table | **Critical** | RTO: 4 hours | 7 years (HMRC requirement) |
| Bundles Table | High | RTO: 4 hours | Duration of subscription |
| User Sub Hash Salt | **Critical** | RTO: 1 hour | Indefinite (data integrity) |
| HMRC Client Secret | **Critical** | RTO: 1 hour | Until rotated |
| HMRC API Requests | Medium | RTO: 24 hours | 90 days |
| Async Request Tables | Low | RTO: 24 hours | 7 days |

### Secrets Manager Backup Strategy

AWS Secrets Manager secrets require special handling:

1. **USER_SUB_HASH_SALT**: This salt is used to hash Cognito user `sub` values before storing in DynamoDB. **If lost, all user data mappings become irrecoverable.** This is the most critical secret.

2. **HMRC_CLIENT_SECRET**: OAuth client secret for HMRC API access. Can be regenerated via HMRC Developer Hub if lost, but requires manual re-registration.

**Backup Methods**:

| Method | Implementation | Frequency |
|--------|---------------|-----------|
| Cross-region replica | Use Secrets Manager replication to eu-west-1 | Real-time |
| Encrypted export | Run `scripts/backup-salts.sh` to export to backup account S3 | Monthly |
| Manual secure storage | Store in password manager (1Password/Bitwarden) | On creation/rotation |

**Existing Script**: `scripts/backup-salts.sh` - Already in place for salt backup.

**Recommended Action**: Enable Secrets Manager cross-region replication:
```bash
aws secretsmanager replicate-secret-to-regions \
    --secret-id prod/submit/user_sub_hash_salt \
    --add-replica-regions Region=eu-west-1
```

### Cognito User Pool Backup Strategy

AWS Cognito does not support full backup/restore of user pools. Passwords are stored in a one-way hashed format and cannot be exported.

**What CAN be backed up**:
- User attributes (email, sub, custom attributes)
- User metadata (creation date, status, MFA settings)
- Group memberships

**What CANNOT be backed up**:
- User passwords (by AWS security design)
- MFA device configurations

**Export Script** (add to `scripts/export-cognito-users.sh`):
```bash
#!/bin/bash
# Export Cognito users (metadata only, no passwords)
USER_POOL_ID="$1"
OUTPUT_FILE="cognito-users-$(date +%Y%m%d).json"

aws cognito-idp list-users \
    --user-pool-id "$USER_POOL_ID" \
    --output json > "$OUTPUT_FILE"

echo "Exported to $OUTPUT_FILE"
```

**DR Recovery Process for Cognito**:
1. Create new User Pool with same configuration
2. Import user metadata from backup
3. Trigger password reset emails to all users
4. Update application Cognito configuration

---

## Architecture Overview

### Phase 1: Same-Region Local Backups

```
Deployment Account (eu-west-2)
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  DynamoDB Tables ──────┬─────► PITR (35-day window)    │
│  (receipts, bundles)   │       (quick recovery from    │
│                        │        accidental deletion)   │
│                        │                                │
│                        └─────► AWS Backup              │
│                                └─► Local Vault         │
│                                    (daily snapshots)   │
│                                                         │
│  S3 Backup Bucket ──────────► DynamoDB exports         │
│  (versioned)                  (JSON archives)          │
│       │                                                 │
│       └─────────────────────► Ship to Backup Account   │
│                               (cross-account copy)     │
│                                                         │
└─────────────────────────────────────────────────────────┘

Note: No cross-region vault within deployment account.
Multi-region redundancy is handled by the backup account.
```

### Phase 2: Multi-Account Backup Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS Organizations                                │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │ CI Account  │  │Prod Account │  │ Backup Account              │ │
│  │ (eu-west-2) │  │ (eu-west-2) │  │ (Multi-Region Storage)      │ │
│  │             │  │             │  │                             │ │
│  │ AWS Backup  │  │ AWS Backup  │  │ ┌─────────────────────────┐ │ │
│  │  │          │  │  │          │──│─▶│ Central Backup Vault  │ │ │
│  │  └─►Local   │  │  └─►Local   │  │ │ (WORM/Compliance Mode) │ │ │
│  │     Vault   │  │       Vault │  │ │                         │ │ │
│  │             │  │             │  │ │ ┌─────────────────────┐ │ │ │
│  │ S3 Exports  │  │ S3 Exports  │  │ │ │ S3 Archive Bucket  │ │ │ │
│  │  │          │  │  │          │──│─▶│ (Multi-Region)       │ │ │ │
│  │  └──────────│──│──└──────────│──│─▶│ (Object Lock)       │ │ │ │
│  │             │  │             │  │ │ └─────────────────────┘ │ │ │
│  └─────────────┘  └─────────────┘  │ └─────────────────────────┘ │ │
│                                     └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### DR Philosophy

**Account loss and region loss are treated identically**: In either scenario, we deploy
a fresh PROD account seeded from the backup account archives.

**No cross-region failover**: We accept downtime during extreme events (AWS region loss)
rather than maintaining complex multi-region active infrastructure. A sustained eu-west-2
or us-east-1 outage is an unreasonably rare event; we would wait it out and redeploy to
our usual regions when available.

**Data locality matters**: Our customers operate in the UK. Being explicit about eu-west-2
deployment is more valuable than offering theoretical multi-region flexibility. GDPR
compliance and data residency are clearer with explicit region targeting.

**Code changes acceptable for region change**: If we ever needed to deploy outside
eu-west-2/us-east-1 (e.g., persistent region loss), we accept that this requires
code changes to retarget the deployment.

### Disaster Recovery Flow

```
1. Total loss of PROD account OR eu-west-2 region detected
2. Create new AWS account (if account lost) or wait for region recovery
3. Pull backup archives from backup account (multi-region resilient)
4. Deploy CDK stacks to new/recovered account
5. Restore DynamoDB tables from backup archives
6. Restore secrets (from secure offline storage)
7. Trigger Cognito password reset for all users
8. Update DNS to point to new deployment
```

---

## Phase 1: Same-Region Local Backups

### 1.1 Enable Point-in-Time Recovery (PITR)

**Not done.** This was implemented in commit `99dadc4e` (2026-01-10) and removed nine days later
in commit `31559ee8`, when all 11 tables in `DataStack.java` moved from CDK `Table` constructs to
`KindCdk.ensureTable()`, an `AwsCustomResource` wrapping a raw `createTable` call. The snippet
below shows the CDK `Table.Builder` approach this document originally proposed. It no longer
matches `DataStack.java`, which builds every table through `ensureTable()` instead. See "Current
State" above for what re-enabling PITR now requires.

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java` (superseded snippet)

Update each critical table:

```java
// Receipts Table (Critical)
this.receiptsTable = Table.Builder.create(this, props.resourceNamePrefix() + "-ReceiptsTable")
        .tableName(props.sharedNames().receiptsTableName)
        .partitionKey(Attribute.builder().name("hashedSub").type(AttributeType.STRING).build())
        .sortKey(Attribute.builder().name("receiptId").type(AttributeType.STRING).build())
        .billingMode(BillingMode.PAY_PER_REQUEST)
        .timeToLiveAttribute("ttl")
        .pointInTimeRecovery(true)  // Enable PITR
        .removalPolicy(props.envName().equals("prod") ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
        .build();
```

### 1.2 Create BackupStack (Environment Stack)

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/BackupStack.java`

```java
/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.backup.*;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.iam.*;
import software.amazon.awscdk.services.kms.Key;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.sns.Topic;
import software.constructs.Construct;

public class BackupStack extends Stack {

    public BackupVault primaryVault;
    public BackupPlan dailyBackupPlan;
    public Bucket backupExportsBucket;
    public Key backupKmsKey;

    @Value.Immutable
    public interface BackupStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        // Note: No DR region - multi-region redundancy handled by backup account

        // Retention settings (days)
        @Value.Default
        default int dailyBackupRetentionDays() {
            return 35;
        }

        @Value.Default
        default int weeklyBackupRetentionDays() {
            return 90;
        }

        @Value.Default
        default int monthlyBackupRetentionDays() {
            return 365;
        }

        @Value.Default
        default int complianceRetentionDays() {
            return 2555; // 7 years for HMRC compliance
        }

        // Optional: Backup account ID for cross-account replication
        String backupAccountId();

        // Alert topic for notifications
        Topic alertTopic();

        static ImmutableBackupStackProps.Builder builder() {
            return ImmutableBackupStackProps.builder();
        }
    }

    public BackupStack(Construct scope, String id, BackupStackProps props) {
        this(scope, id, null, props);
    }

    public BackupStack(Construct scope, String id, StackProps stackProps, BackupStackProps props) {
        super(scope, id, stackProps);

        boolean isProd = props.envName().equals("prod");

        // ============================================================================
        // KMS Key for Backup Encryption (cross-account capable)
        // ============================================================================

        this.backupKmsKey = Key.Builder.create(this, props.resourceNamePrefix() + "-BackupKey")
                .alias("alias/" + props.resourceNamePrefix() + "-backup")
                .enableKeyRotation(true)
                .removalPolicy(isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .description("KMS key for backup encryption - " + props.resourceNamePrefix())
                .build();

        // Allow backup service and cross-account access if backup account configured
        if (props.backupAccountId() != null && !props.backupAccountId().isEmpty()) {
            backupKmsKey.addToResourcePolicy(PolicyStatement.Builder.create()
                    .principals(List.of(
                            new ArnPrincipal("arn:aws:iam::" + props.backupAccountId() + ":root"),
                            new ServicePrincipal("backup.amazonaws.com")))
                    .actions(List.of("kms:Decrypt", "kms:GenerateDataKey", "kms:CreateGrant"))
                    .resources(List.of("*"))
                    .build());
        }

        // ============================================================================
        // S3 Bucket for DynamoDB Exports
        // ============================================================================

        this.backupExportsBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-BackupExports")
                .bucketName(props.sharedNames().dashedDeploymentDomainName + "-backup-exports")
                .encryption(BucketEncryption.KMS)
                .encryptionKey(backupKmsKey)
                .versioned(true)
                .removalPolicy(isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .autoDeleteObjects(!isProd)
                .lifecycleRules(List.of(
                        software.amazon.awscdk.services.s3.LifecycleRule.builder()
                                .id("TransitionToIA")
                                .transitions(List.of(
                                        software.amazon.awscdk.services.s3.Transition.builder()
                                                .storageClass(software.amazon.awscdk.services.s3.StorageClass.INFREQUENT_ACCESS)
                                                .transitionAfter(Duration.days(30))
                                                .build(),
                                        software.amazon.awscdk.services.s3.Transition.builder()
                                                .storageClass(software.amazon.awscdk.services.s3.StorageClass.GLACIER)
                                                .transitionAfter(Duration.days(90))
                                                .build()))
                                .build()))
                .build();

        // ============================================================================
        // Primary Backup Vault
        // ============================================================================

        this.primaryVault = BackupVault.Builder.create(this, props.resourceNamePrefix() + "-PrimaryVault")
                .backupVaultName(props.resourceNamePrefix() + "-primary-vault")
                .encryptionKey(backupKmsKey)
                .removalPolicy(isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .notificationTopic(props.alertTopic())
                .notificationEvents(List.of(
                        BackupVaultEvents.BACKUP_JOB_FAILED,
                        BackupVaultEvents.COPY_JOB_FAILED,
                        BackupVaultEvents.RESTORE_JOB_FAILED))
                .build();

        // ============================================================================
        // IAM Role for AWS Backup
        // ============================================================================

        Role backupRole = Role.Builder.create(this, props.resourceNamePrefix() + "-BackupRole")
                .roleName(props.resourceNamePrefix() + "-backup-role")
                .assumedBy(new ServicePrincipal("backup.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSBackupServiceRolePolicyForBackup"),
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSBackupServiceRolePolicyForRestores")))
                .build();

        // ============================================================================
        // Backup Plan - Daily, Weekly, Monthly
        // ============================================================================

        List<BackupPlanRule> backupRules = new java.util.ArrayList<>();

        // Daily backup at 02:00 UTC (local vault only - cross-account copy handled separately)
        backupRules.add(BackupPlanRule.Builder.create()
                .ruleName("DailyBackup")
                .backupVault(this.primaryVault)
                .scheduleExpression(Schedule.cron(software.amazon.awscdk.services.events.CronOptions.builder()
                        .hour("2").minute("0").build()))
                .deleteAfter(Duration.days(props.dailyBackupRetentionDays()))
                .startWindow(Duration.hours(1))
                .completionWindow(Duration.hours(2))
                .build());

        // Note: Cross-account copy to backup account is configured via:
        // 1. S3 cross-account replication for exports
        // 2. AWS Backup cross-account copy jobs (configured in backup account)

        // Weekly backup (Sundays at 03:00 UTC)
        backupRules.add(BackupPlanRule.Builder.create()
                .ruleName("WeeklyBackup")
                .backupVault(this.primaryVault)
                .scheduleExpression(Schedule.cron(software.amazon.awscdk.services.events.CronOptions.builder()
                        .weekDay("SUN").hour("3").minute("0").build()))
                .deleteAfter(Duration.days(props.weeklyBackupRetentionDays()))
                .startWindow(Duration.hours(1))
                .completionWindow(Duration.hours(3))
                .build());

        // Monthly backup (1st of month at 04:00 UTC) - HMRC compliance
        backupRules.add(BackupPlanRule.Builder.create()
                .ruleName("MonthlyCompliance")
                .backupVault(this.primaryVault)
                .scheduleExpression(Schedule.cron(software.amazon.awscdk.services.events.CronOptions.builder()
                        .day("1").hour("4").minute("0").build()))
                .deleteAfter(Duration.days(props.complianceRetentionDays()))
                .moveToColdStorageAfter(Duration.days(90))
                .startWindow(Duration.hours(1))
                .completionWindow(Duration.hours(4))
                .build());

        this.dailyBackupPlan = BackupPlan.Builder.create(this, props.resourceNamePrefix() + "-BackupPlan")
                .backupPlanName(props.resourceNamePrefix() + "-backup-plan")
                .backupPlanRules(backupRules)
                .build();

        // ============================================================================
        // Backup Selection - Critical Tables
        // ============================================================================

        ITable receiptsTable = Table.fromTableArn(this, "ImportedReceiptsTable",
                String.format("arn:aws:dynamodb:%s:%s:table/%s",
                        this.getRegion(), this.getAccount(), props.sharedNames().receiptsTableName));

        ITable bundlesTable = Table.fromTableArn(this, "ImportedBundlesTable",
                String.format("arn:aws:dynamodb:%s:%s:table/%s",
                        this.getRegion(), this.getAccount(), props.sharedNames().bundlesTableName));

        ITable hmrcApiRequestsTable = Table.fromTableArn(this, "ImportedHmrcApiRequestsTable",
                String.format("arn:aws:dynamodb:%s:%s:table/%s",
                        this.getRegion(), this.getAccount(), props.sharedNames().hmrcApiRequestsTableName));

        BackupSelection.Builder.create(this, props.resourceNamePrefix() + "-CriticalTablesSelection")
                .backupPlan(this.dailyBackupPlan)
                .role(backupRole)
                .resources(List.of(
                        BackupResource.fromDynamoDbTable(receiptsTable),
                        BackupResource.fromDynamoDbTable(bundlesTable),
                        BackupResource.fromDynamoDbTable(hmrcApiRequestsTable)))
                .backupSelectionName(props.resourceNamePrefix() + "-critical-tables")
                .build();

        // ============================================================================
        // Outputs
        // ============================================================================
        cfnOutput(this, "PrimaryVaultArn", this.primaryVault.getBackupVaultArn());
        cfnOutput(this, "BackupPlanId", this.dailyBackupPlan.getBackupPlanId());
        cfnOutput(this, "BackupExportsBucket", this.backupExportsBucket.getBucketName());
        cfnOutput(this, "BackupKmsKeyArn", this.backupKmsKey.getKeyArn());

        infof("BackupStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
```

### 1.3 Update SubmitEnvironment.java

Add BackupStack to the environment application:

```java
// In SubmitEnvironment.java, after DataStack:

// Create BackupStack (local backups only - cross-account shipping configured separately)
BackupStack backupStack = new BackupStack(
        app,
        sharedNames.environmentName + "-" + sharedNames.deploymentName + "-backup",
        ImmutableBackupStackProps.builder()
                .env(environment)
                .envName(props.environmentName())
                .deploymentName(props.deploymentName())
                .resourceNamePrefix(resourceNamePrefix)
                .cloudTrailEnabled(props.cloudTrailEnabled())
                .sharedNames(sharedNames)
                .alertTopic(observabilityStack.alertTopic)
                .backupAccountId(props.backupAccountId()) // For cross-account S3 replication
                .build());
backupStack.addDependency(dataStack);
backupStack.addDependency(observabilityStack);
```

---

## Phase 2: Multi-Account Backup Strategy

### 2.1 Dedicated Backup Account Setup

**One-time setup script**: `scripts/setup-backup-account.sh`

```bash
#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Setup dedicated backup AWS account
# Run this once to initialize the backup account

set -e

BACKUP_ACCOUNT_ID="${1:-}"
BACKUP_REGION="${2:-eu-west-2}"
DR_REGION="${3:-eu-west-1}"

if [ -z "$BACKUP_ACCOUNT_ID" ]; then
    echo "Usage: $0 <backup-account-id> [backup-region] [dr-region]"
    exit 1
fi

echo "=== Setting up Backup Account $BACKUP_ACCOUNT_ID ==="

# Assume role in backup account (requires cross-account access)
# You'll need to configure AWS credentials for the backup account

echo "1. Creating KMS key for backup encryption..."
KMS_KEY_ARN=$(aws kms create-key \
    --description "Central backup encryption key" \
    --region "$BACKUP_REGION" \
    --query 'KeyMetadata.Arn' \
    --output text)

aws kms create-alias \
    --alias-name "alias/central-backup-key" \
    --target-key-id "$KMS_KEY_ARN" \
    --region "$BACKUP_REGION"

echo "   KMS Key: $KMS_KEY_ARN"

echo "2. Creating central backup vault..."
aws backup create-backup-vault \
    --backup-vault-name "central-backup-vault" \
    --encryption-key-arn "$KMS_KEY_ARN" \
    --region "$BACKUP_REGION" \
    --backup-vault-tags Purpose=central-backups,ManagedBy=scripts

echo "3. Creating DR backup vault in $DR_REGION..."
DR_KMS_KEY_ARN=$(aws kms create-key \
    --description "DR backup encryption key" \
    --region "$DR_REGION" \
    --query 'KeyMetadata.Arn' \
    --output text)

aws kms create-alias \
    --alias-name "alias/dr-backup-key" \
    --target-key-id "$DR_KMS_KEY_ARN" \
    --region "$DR_REGION"

aws backup create-backup-vault \
    --backup-vault-name "central-dr-vault" \
    --encryption-key-arn "$DR_KMS_KEY_ARN" \
    --region "$DR_REGION" \
    --backup-vault-tags Purpose=disaster-recovery,ManagedBy=scripts

echo "4. Creating S3 bucket for DynamoDB exports..."
BUCKET_NAME="diyaccounting-central-backups-${BACKUP_ACCOUNT_ID}"
aws s3 mb "s3://${BUCKET_NAME}" --region "$BACKUP_REGION"

# Enable versioning
aws s3api put-bucket-versioning \
    --bucket "$BUCKET_NAME" \
    --versioning-configuration Status=Enabled \
    --region "$BACKUP_REGION"

# Enable Object Lock (must be done at bucket creation for WORM)
# Note: For existing buckets, you'd need to create a new bucket with Object Lock

echo "5. Creating IAM policy for cross-account access..."
cat > /tmp/backup-account-policy.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowCrossAccountBackupCopy",
            "Effect": "Allow",
            "Principal": {
                "AWS": [
                    "arn:aws:iam::PROD_ACCOUNT_ID:root",
                    "arn:aws:iam::CI_ACCOUNT_ID:root"
                ]
            },
            "Action": "backup:CopyIntoBackupVault",
            "Resource": "arn:aws:backup:*:BACKUP_ACCOUNT_ID:backup-vault:*"
        }
    ]
}
EOF

echo "=== Backup Account Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Update source accounts with backup account ID: $BACKUP_ACCOUNT_ID"
echo "2. Configure KMS key policies for cross-account access"
echo "3. Update deploy workflows with cross-account copy actions"
```

### 2.2 Cross-Account S3 Replication

**File**: `scripts/setup-s3-replication.sh`

```bash
#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Configure S3 cross-account replication for backup exports

set -e

SOURCE_BUCKET="$1"
DEST_BUCKET="$2"
DEST_ACCOUNT_ID="$3"
ROLE_ARN="$4"

if [ -z "$SOURCE_BUCKET" ] || [ -z "$DEST_BUCKET" ] || [ -z "$DEST_ACCOUNT_ID" ] || [ -z "$ROLE_ARN" ]; then
    echo "Usage: $0 <source-bucket> <dest-bucket> <dest-account-id> <replication-role-arn>"
    exit 1
fi

echo "Configuring S3 replication from $SOURCE_BUCKET to $DEST_BUCKET..."

# Create replication configuration
cat > /tmp/replication-config.json << EOF
{
    "Role": "$ROLE_ARN",
    "Rules": [
        {
            "ID": "BackupReplication",
            "Status": "Enabled",
            "Priority": 1,
            "DeleteMarkerReplication": {
                "Status": "Disabled"
            },
            "Filter": {
                "Prefix": "exports/"
            },
            "Destination": {
                "Bucket": "arn:aws:s3:::$DEST_BUCKET",
                "Account": "$DEST_ACCOUNT_ID",
                "AccessControlTranslation": {
                    "Owner": "Destination"
                },
                "ReplicationTime": {
                    "Status": "Enabled",
                    "Time": {
                        "Minutes": 15
                    }
                },
                "Metrics": {
                    "Status": "Enabled",
                    "EventThreshold": {
                        "Minutes": 15
                    }
                }
            }
        }
    ]
}
EOF

aws s3api put-bucket-replication \
    --bucket "$SOURCE_BUCKET" \
    --replication-configuration file:///tmp/replication-config.json

echo "S3 replication configured successfully"
```

---

## Disaster Recovery Procedures

### Scenario 1: Total Loss of PROD AWS Account

**Use Case**: PROD account compromised/deleted, need to restore from backup account.

**Script**: `scripts/dr-restore-from-backup-account.sh`

```bash
#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Disaster Recovery: Restore from backup account to new PROD account
#
# Prerequisites:
# - New AWS account created
# - AWS credentials configured for new account
# - Access to backup account

set -e

NEW_ACCOUNT_ID="${1:-}"
BACKUP_ACCOUNT_ID="${2:-}"
RESTORE_POINT="${3:-latest}"
REGION="${4:-eu-west-2}"

if [ -z "$NEW_ACCOUNT_ID" ] || [ -z "$BACKUP_ACCOUNT_ID" ]; then
    echo "Usage: $0 <new-account-id> <backup-account-id> [restore-point] [region]"
    echo ""
    echo "restore-point: 'latest' or specific recovery point ARN"
    exit 1
fi

echo "=============================================="
echo "DISASTER RECOVERY: Restore to New Account"
echo "=============================================="
echo "New Account:    $NEW_ACCOUNT_ID"
echo "Backup Account: $BACKUP_ACCOUNT_ID"
echo "Restore Point:  $RESTORE_POINT"
echo "Region:         $REGION"
echo "=============================================="
echo ""

# Step 1: List available recovery points
echo "Step 1: Listing available recovery points in backup account..."
aws backup list-recovery-points-by-backup-vault \
    --backup-vault-name "central-backup-vault" \
    --region "$REGION" \
    --max-results 10 \
    --query 'RecoveryPoints[*].[RecoveryPointArn,CreationDate,ResourceType]' \
    --output table

if [ "$RESTORE_POINT" = "latest" ]; then
    echo ""
    echo "Getting latest recovery point..."
    RECOVERY_POINT_ARN=$(aws backup list-recovery-points-by-backup-vault \
        --backup-vault-name "central-backup-vault" \
        --region "$REGION" \
        --max-results 1 \
        --query 'RecoveryPoints[0].RecoveryPointArn' \
        --output text)
    echo "Using recovery point: $RECOVERY_POINT_ARN"
else
    RECOVERY_POINT_ARN="$RESTORE_POINT"
fi

# Step 2: Create IAM role for restore in new account
echo ""
echo "Step 2: Creating restore IAM role in new account..."
cat > /tmp/restore-role-trust.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "backup.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

RESTORE_ROLE_ARN=$(aws iam create-role \
    --role-name "BackupRestoreRole" \
    --assume-role-policy-document file:///tmp/restore-role-trust.json \
    --query 'Role.Arn' \
    --output text 2>/dev/null || \
    aws iam get-role --role-name "BackupRestoreRole" --query 'Role.Arn' --output text)

aws iam attach-role-policy \
    --role-name "BackupRestoreRole" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores" || true

echo "Restore role: $RESTORE_ROLE_ARN"

# Step 3: Create local backup vault in new account
echo ""
echo "Step 3: Creating backup vault in new account..."
aws backup create-backup-vault \
    --backup-vault-name "prod-submit-primary-vault" \
    --region "$REGION" \
    --backup-vault-tags Environment=prod,Purpose=primary || true

# Step 4: Copy recovery point to new account
echo ""
echo "Step 4: Copying recovery point to new account..."
COPY_JOB_ID=$(aws backup start-copy-job \
    --recovery-point-arn "$RECOVERY_POINT_ARN" \
    --source-backup-vault-name "central-backup-vault" \
    --destination-backup-vault-arn "arn:aws:backup:${REGION}:${NEW_ACCOUNT_ID}:backup-vault:prod-submit-primary-vault" \
    --iam-role-arn "$RESTORE_ROLE_ARN" \
    --region "$REGION" \
    --query 'CopyJobId' \
    --output text)

echo "Copy job started: $COPY_JOB_ID"
echo "Waiting for copy to complete..."

# Wait for copy to complete
while true; do
    STATUS=$(aws backup describe-copy-job \
        --copy-job-id "$COPY_JOB_ID" \
        --region "$REGION" \
        --query 'CopyJob.State' \
        --output text)
    echo "  Status: $STATUS"
    if [ "$STATUS" = "COMPLETED" ]; then
        break
    elif [ "$STATUS" = "FAILED" ]; then
        echo "ERROR: Copy job failed!"
        exit 1
    fi
    sleep 30
done

# Step 5: Get the copied recovery point ARN
echo ""
echo "Step 5: Getting copied recovery point..."
COPIED_RECOVERY_POINT=$(aws backup describe-copy-job \
    --copy-job-id "$COPY_JOB_ID" \
    --region "$REGION" \
    --query 'CopyJob.DestinationRecoveryPointArn' \
    --output text)

echo "Copied recovery point: $COPIED_RECOVERY_POINT"

# Step 6: Restore DynamoDB tables
echo ""
echo "Step 6: Restoring DynamoDB tables..."

# Extract table name from recovery point
RESOURCE_ARN=$(aws backup describe-recovery-point \
    --backup-vault-name "prod-submit-primary-vault" \
    --recovery-point-arn "$COPIED_RECOVERY_POINT" \
    --region "$REGION" \
    --query 'ResourceArn' \
    --output text)

TABLE_NAME=$(echo "$RESOURCE_ARN" | sed 's/.*table\///')
RESTORE_TABLE_NAME="${TABLE_NAME}"

echo "Restoring table: $RESTORE_TABLE_NAME"

RESTORE_JOB_ID=$(aws backup start-restore-job \
    --recovery-point-arn "$COPIED_RECOVERY_POINT" \
    --iam-role-arn "$RESTORE_ROLE_ARN" \
    --metadata "{\"targetTableName\":\"$RESTORE_TABLE_NAME\"}" \
    --region "$REGION" \
    --query 'RestoreJobId' \
    --output text)

echo "Restore job started: $RESTORE_JOB_ID"
echo ""
echo "=============================================="
echo "DISASTER RECOVERY INITIATED"
echo "=============================================="
echo "Monitor restore job: aws backup describe-restore-job --restore-job-id $RESTORE_JOB_ID --region $REGION"
echo ""
echo "Next steps after restore completes:"
echo "1. Verify data in restored table"
echo "2. Run CDK deployment to recreate infrastructure"
echo "3. Update DNS records"
echo "4. Verify application functionality"
```

### Scenario 2: Accidental Data Deletion

**Script**: `scripts/restore-dynamodb-pitr.sh`

This script checks PITR status before restoring and exits if it finds `DISABLED`. It will not
work on any prod or ci table today; see "Current State" above. It becomes usable again once
PITR is re-enabled on the target table.

```bash
#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025-2026 DIY Accounting Ltd
#
# Restore DynamoDB table using Point-in-Time Recovery

set -e

TABLE_NAME="$1"
RESTORE_DATETIME="$2"
TARGET_TABLE="${3:-${TABLE_NAME}-restored}"

if [ -z "$TABLE_NAME" ] || [ -z "$RESTORE_DATETIME" ]; then
    echo "Usage: $0 <table-name> <restore-datetime> [target-table-name]"
    echo ""
    echo "Example: $0 prod-submit-receipts '2026-01-08T12:00:00Z'"
    exit 1
fi

echo "Restoring $TABLE_NAME to $TARGET_TABLE at $RESTORE_DATETIME..."

# Check PITR status
PITR_STATUS=$(aws dynamodb describe-continuous-backups \
    --table-name "$TABLE_NAME" \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
    --output text)

if [ "$PITR_STATUS" != "ENABLED" ]; then
    echo "ERROR: PITR is not enabled on $TABLE_NAME"
    exit 1
fi

# Restore table
aws dynamodb restore-table-to-point-in-time \
    --source-table-name "$TABLE_NAME" \
    --target-table-name "$TARGET_TABLE" \
    --restore-date-time "$RESTORE_DATETIME"

echo "Restore initiated. Monitor with:"
echo "  aws dynamodb describe-table --table-name $TARGET_TABLE --query 'Table.TableStatus'"
```

---

## Monitoring & Alerting

### Add to OpsStack.java

```java
// ============================================================================
// Backup Monitoring Alarms
// ============================================================================

// Alarm: Backup job failed
Alarm backupFailedAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-BackupFailedAlarm")
        .alarmName(props.resourceNamePrefix() + "-backup-job-failed")
        .alarmDescription("AWS Backup job failed")
        .metric(Metric.Builder.create()
                .namespace("AWS/Backup")
                .metricName("NumberOfBackupJobsFailed")
                .dimensionsMap(Map.of(
                        "BackupVaultName", props.resourceNamePrefix() + "-primary-vault"))
                .statistic("Sum")
                .period(Duration.hours(24))
                .build())
        .threshold(1)
        .evaluationPeriods(1)
        .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
        .treatMissingData(TreatMissingData.NOT_BREACHING)
        .build();
backupFailedAlarm.addAlarmAction(new SnsAction(this.alertTopic));

// Alarm: No backup in 48 hours (missed scheduled backup)
Alarm noBackupAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-NoBackupAlarm")
        .alarmName(props.resourceNamePrefix() + "-no-recent-backup")
        .alarmDescription("No successful backup in 48 hours")
        .metric(Metric.Builder.create()
                .namespace("AWS/Backup")
                .metricName("NumberOfBackupJobsCompleted")
                .dimensionsMap(Map.of(
                        "BackupVaultName", props.resourceNamePrefix() + "-primary-vault"))
                .statistic("Sum")
                .period(Duration.hours(48))
                .build())
        .threshold(1)
        .evaluationPeriods(1)
        .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
        .treatMissingData(TreatMissingData.BREACHING)
        .build();
noBackupAlarm.addAlarmAction(new SnsAction(this.alertTopic));
```

### Add to ObservabilityStack Dashboard

```java
// Add backup metrics row to dashboardRows:
dashboardRows.add(List.of(
    GraphWidget.Builder.create()
            .title("Backup Jobs (24h)")
            .left(List.of(
                Metric.Builder.create()
                    .namespace("AWS/Backup")
                    .metricName("NumberOfBackupJobsCompleted")
                    .statistic("Sum")
                    .period(Duration.hours(1))
                    .color("#2ca02c")
                    .label("Completed")
                    .build(),
                Metric.Builder.create()
                    .namespace("AWS/Backup")
                    .metricName("NumberOfBackupJobsFailed")
                    .statistic("Sum")
                    .period(Duration.hours(1))
                    .color("#d62728")
                    .label("Failed")
                    .build()
            ))
            .width(8)
            .height(6)
            .build(),

    SingleValueWidget.Builder.create()
            .title("Last Backup Status")
            .metrics(List.of(
                Metric.Builder.create()
                    .namespace("AWS/Backup")
                    .metricName("NumberOfBackupJobsCompleted")
                    .statistic("Sum")
                    .period(Duration.hours(24))
                    .build()
            ))
            .width(4)
            .height(6)
            .build()
));
```

---

## GitHub Actions Integration

### The verify-backups check is broken

The vault-not-found result this workflow reports is a naming bug, not a real gap. Line 83 sets
`ENV_PREFIX=prod-env`. Line 156 then builds:

```
VAULT_NAME="${{ env.ENV_PREFIX }}-env-primary-vault"
```

That produces `prod-env-env-primary-vault`, with "env" appearing twice. No vault has ever existed
under that name. The real vault, `prod-env-primary-vault`, exists, holds 162 recovery points, and
has been running its daily plan for the three tables `prod-env-critical-tables` selects.

`aws backup describe-backup-vault` for a name that doesn't exist returns `AccessDeniedException`,
not `ResourceNotFoundException`. This was confirmed by running the same call as an account
administrator against both the doubled name and a made-up one. Line 161 pipes that error to
`/dev/null`, so the workflow can't tell a bad name from a real permissions gap. Fixing the vault
check needs two changes: drop the extra `-env` from line 156, and confirm the role the workflow
assumes carries `backup:DescribeBackupVault` and `backup:ListBackupJobs` explicitly. A search of
the OIDC deploy role setup and `BackupStack.java` found no such grant, though the doubled name
alone explains every failure seen so far.

The PITR check does not need fixing. It has correctly reported `DISABLED` on every one of the 69
runs since the workflow started on 2026-05-07. It has been telling the truth about the real gap
the whole time. Nobody was reading a check that has never once gone green.

### Workflow: Verify Backups

**File**: `.github/workflows/verify-backups.yml`

```yaml
name: Verify Backups

on:
  schedule:
    - cron: '0 8 * * *'  # Daily at 8 AM UTC
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  verify-prod-backups:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (PROD)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_PROD_ROLE_ARN }}
          aws-region: eu-west-2

      - name: Verify PITR status
        run: |
          echo "=== Checking PITR Status ==="
          for TABLE in prod-submit-receipts prod-submit-bundles prod-submit-hmrc-api-requests; do
            STATUS=$(aws dynamodb describe-continuous-backups \
              --table-name "$TABLE" \
              --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
              --output text 2>/dev/null || echo "TABLE_NOT_FOUND")
            if [ "$STATUS" = "ENABLED" ]; then
              echo "✅ $TABLE: PITR enabled"
            else
              echo "❌ $TABLE: PITR status = $STATUS"
              exit 1
            fi
          done

      - name: Verify recent backups
        run: |
          echo "=== Checking Recent Backup Jobs ==="
          VAULT_NAME="prod-submit-primary-vault"

          # Check for backups in last 48 hours
          CUTOFF=$(date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ)

          RECENT_BACKUPS=$(aws backup list-backup-jobs \
            --by-backup-vault-name "$VAULT_NAME" \
            --by-created-after "$CUTOFF" \
            --by-state COMPLETED \
            --query 'BackupJobs | length(@)' \
            --output text)

          if [ "$RECENT_BACKUPS" -gt 0 ]; then
            echo "✅ Found $RECENT_BACKUPS completed backup(s) in last 48 hours"
          else
            echo "❌ No completed backups in last 48 hours!"
            exit 1
          fi

      - name: Verify backup vault health
        run: |
          echo "=== Backup Vault Status ==="
          aws backup describe-backup-vault \
            --backup-vault-name "prod-submit-primary-vault" \
            --query '{Name:BackupVaultName,RecoveryPoints:NumberOfRecoveryPoints}' \
            --output table

      - name: Summary
        if: always()
        run: |
          echo "=== Backup Verification Complete ==="
          echo "See AWS Backup console for detailed metrics"
```

### Workflow: Export DynamoDB to S3

**File**: `.github/workflows/export-dynamodb.yml`

```yaml
name: Export DynamoDB Tables

on:
  schedule:
    - cron: '0 5 1 * *'  # Monthly on 1st at 5 AM UTC
  workflow_dispatch:
    inputs:
      table_name:
        description: 'Table to export (leave empty for all critical tables)'
        required: false
        type: string

permissions:
  id-token: write
  contents: read

jobs:
  export-tables:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        table:
          - prod-submit-receipts
          - prod-submit-bundles
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_PROD_ROLE_ARN }}
          aws-region: eu-west-2

      - name: Export ${{ matrix.table }}
        if: inputs.table_name == '' || inputs.table_name == matrix.table
        run: |
          TABLE_ARN="arn:aws:dynamodb:eu-west-2:${{ secrets.AWS_ACCOUNT_ID }}:table/${{ matrix.table }}"
          BUCKET="prod.submit.diyaccounting.co.uk-backup-exports"
          PREFIX="exports/${{ matrix.table }}/$(date +%Y/%m)"

          echo "Exporting ${{ matrix.table }} to s3://${BUCKET}/${PREFIX}/"

          EXPORT_ARN=$(aws dynamodb export-table-to-point-in-time \
            --table-arn "$TABLE_ARN" \
            --s3-bucket "$BUCKET" \
            --s3-prefix "$PREFIX" \
            --export-format DYNAMODB_JSON \
            --query 'ExportDescription.ExportArn' \
            --output text)

          echo "Export started: $EXPORT_ARN"
          echo "export_arn=$EXPORT_ARN" >> $GITHUB_OUTPUT

      - name: Wait for export completion
        if: inputs.table_name == '' || inputs.table_name == matrix.table
        run: |
          EXPORT_ARN="${{ steps.export.outputs.export_arn }}"
          while true; do
            STATUS=$(aws dynamodb describe-export \
              --export-arn "$EXPORT_ARN" \
              --query 'ExportDescription.ExportStatus' \
              --output text)
            echo "Export status: $STATUS"
            if [ "$STATUS" = "COMPLETED" ]; then
              echo "✅ Export completed successfully"
              break
            elif [ "$STATUS" = "FAILED" ]; then
              echo "❌ Export failed"
              exit 1
            fi
            sleep 60
          done
```

---

## Implementation Checklist

### Phase 0: Secrets & Identity Backup

- [ ] Enable Secrets Manager cross-region replication for USER_SUB_HASH_SALT
- [ ] Enable Secrets Manager cross-region replication for HMRC_CLIENT_SECRET
- [x] Create `scripts/export-cognito-users.sh` for Cognito metadata export
- [ ] Store USER_SUB_HASH_SALT in secure password manager (1Password/Bitwarden)
- [x] Document Cognito DR recovery process (password reset flow)

### Phase 1: Local Backups (within deployment account)

- [ ] Enable PITR on receiptsTable: removed by the `ensureTable` refactor (`31559ee8`), currently DISABLED in prod and ci
- [ ] Enable PITR on bundlesTable: same, currently DISABLED
- [ ] Enable PITR on hmrcApiRequestsTable: same, currently DISABLED
- [ ] Set RETAIN removal policy for prod tables: moot, since `ensureTable`'s custom resource has no removal policy and no `onDelete`, so CDK never deletes these tables either way
- [x] Create BackupStack.java with local vault (no cross-region): verified deployed in both accounts (`prod-env-primary-vault`, `ci-env-primary-vault`, 162 recovery points each)
- [x] Create S3 bucket for exports (in BackupStack): verified present in prod
- [x] Add BackupStack to SubmitEnvironment.java: verified, backup plans run daily in both accounts
- [x] Deploy to CI environment and verify: done; PITR is still off on ci-env tables, same gap as prod
- [x] Deploy to PROD environment: done
- [x] Verify backup jobs execute (AWS console): confirmed: both vaults show 162 recovery points, only the 3 selected tables each

**Coverage gap, not a deployment gap.** Only `prod-env-critical-tables` (receipts, bundles,
hmrc-api-requests) is in the backup selection. The other 8 tables, including `prod-env-passes`
(7,515 items, more than receipts), have no PITR, no AWS Backup coverage, and no export.

### Phase 2: Multi-Account Strategy

- [x] Create dedicated backup AWS account: `submit-backup` (914216784828) exists but holds zero backup vaults
- [x] Create setup-backup-account.yml workflow
- [ ] Run setup-backup-account workflow (requires backup account)
- [ ] Configure cross-account KMS access
- [ ] Configure S3 cross-account replication
- [ ] Test cross-account backup copy
- [ ] Document backup account access procedures

### Phase 3: Monitoring & Alerting

- [ ] Add backup failure alarm to OpsStack
- [ ] Add no-recent-backup alarm to OpsStack
- [ ] Add backup metrics to ObservabilityStack dashboard
- [ ] Test alarm notifications
- [x] Create verify-backups.yml workflow: deployed, but its vault check has a naming bug; see "The verify-backups check is broken" above
- [ ] Create export-dynamodb.yml workflow

### Phase 4: Disaster Recovery

- [x] Create `scripts/dr-restore-from-backup-account.sh` script
- [x] Create `scripts/restore-dynamodb-pitr.sh` script
- [x] Create `scripts/setup-backup-account.sh` script
- [x] Create `scripts/setup-s3-replication.sh` script
- [x] Document DR procedures in BACKUP_STRATEGY_PLAN.md
- [ ] Conduct DR drill (restore from backup)
- [ ] Document lessons learned

---

## Cost Estimate

| Resource | Monthly Cost (estimate) |
|----------|------------------------|
| DynamoDB PITR (3 tables) | ~$0.20/GB stored |
| AWS Backup (daily, 35-day retention) | ~$0.05/GB |
| Cross-region data transfer | ~$0.02/GB |
| S3 exports (Glacier) | ~$0.004/GB |
| Secrets Manager replica | ~$0.40/secret |
| **Total (assuming 1GB data)** | **~$5-10/month** |

---

## Compliance Mapping

This table describes the design intent, not current status. See "Current State" at the top of
this document for what's actually deployed: PITR is off on all 11 prod tables, there is no
cross-region backup, and Object Lock is not configured anywhere.

| HMRC Requirement | Intended solution |
|-----------------|----------|
| 7-year VAT record retention | Monthly backups with 7-year retention |
| Data integrity | PITR enables point-in-time recovery |
| Business continuity | Cross-region backups in eu-west-1 |
| Audit trail | AWS Backup job history |
| Ransomware protection | Object Lock in COMPLIANCE mode |
