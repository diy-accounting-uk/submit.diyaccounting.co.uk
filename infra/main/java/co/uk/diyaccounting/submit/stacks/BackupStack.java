/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.ArrayList;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.backup.BackupPlan;
import software.amazon.awscdk.services.backup.BackupPlanCopyActionProps;
import software.amazon.awscdk.services.backup.BackupPlanRule;
import software.amazon.awscdk.services.backup.BackupResource;
import software.amazon.awscdk.services.backup.BackupSelection;
import software.amazon.awscdk.services.backup.BackupVault;
import software.amazon.awscdk.services.backup.BackupVaultEvents;
import software.amazon.awscdk.services.backup.IBackupVault;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.kms.Key;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.StorageClass;
import software.amazon.awscdk.services.s3.Transition;
import software.amazon.awscdk.services.sns.Topic;
import software.constructs.Construct;

/**
 * BackupStack creates AWS Backup infrastructure for DynamoDB tables.
 *
 * <p>Architecture:
 * - Local backup vault within the deployment account, holding daily, weekly and monthly recovery points
 * - Daily and monthly recovery points are copied into the vault in the dedicated backup account, which
 *   the deployment account can write to but cannot delete from
 * - S3 bucket for DynamoDB exports
 */
public class BackupStack extends Stack {

    public BackupVault primaryVault;
    public BackupPlan backupPlan;
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

        /**
         * ARN of the vault in the backup account that receives copies, e.g.
         * arn:aws:backup:eu-west-2:914216784828:backup-vault:submit-cross-account-vault. Empty means
         * recovery points stay in this account only.
         */
        java.util.Optional<String> crossAccountBackupVaultArn();

        // Alert topic for notifications (optional - configured at application level)
        // Using Optional to properly handle nullable Topic
        java.util.Optional<Topic> alertTopic();

        static ImmutableBackupStackProps.Builder builder() {
            return ImmutableBackupStackProps.builder();
        }
    }

    public BackupStack(Construct scope, String id, BackupStackProps props) {
        this(scope, id, null, props);
    }

    public BackupStack(Construct scope, String id, StackProps stackProps, BackupStackProps props) {
        super(scope, id, stackProps);

        // ============================================================================
        // KMS Key for Backup Encryption
        // ============================================================================

        this.backupKmsKey = Key.Builder.create(this, props.resourceNamePrefix() + "-BackupKey")
                .alias("alias/" + props.resourceNamePrefix() + "-backup")
                .enableKeyRotation(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .pendingWindow(Duration.days(7)) // Minimum window before key deletion
                .description("KMS key for backup encryption - " + props.resourceNamePrefix())
                .build();

        // ============================================================================
        // S3 Bucket for DynamoDB Exports
        // ============================================================================

        // No explicit bucketName — S3 names are globally unique; hardcoding causes collisions during account migration
        this.backupExportsBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-BackupExports")
                .encryption(BucketEncryption.KMS)
                .encryptionKey(backupKmsKey)
                .versioned(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(List.of(LifecycleRule.builder()
                        .id("TransitionToIA")
                        .transitions(List.of(
                                Transition.builder()
                                        .storageClass(StorageClass.INFREQUENT_ACCESS)
                                        .transitionAfter(Duration.days(30))
                                        .build(),
                                Transition.builder()
                                        .storageClass(StorageClass.GLACIER)
                                        .transitionAfter(Duration.days(90))
                                        .build()))
                        .build()))
                .build();

        // ============================================================================
        // Primary Backup Vault (local to deployment account - no cross-region)
        // ============================================================================

        BackupVault.Builder vaultBuilder = BackupVault.Builder.create(
                        this, props.resourceNamePrefix() + "-PrimaryVault")
                .backupVaultName(props.resourceNamePrefix() + "-primary-vault")
                .encryptionKey(backupKmsKey)
                .removalPolicy(RemovalPolicy.DESTROY);

        // Add notification topic if provided
        props.alertTopic().ifPresent(topic -> vaultBuilder
                .notificationTopic(topic)
                .notificationEvents(List.of(
                        BackupVaultEvents.BACKUP_JOB_FAILED,
                        BackupVaultEvents.COPY_JOB_FAILED,
                        BackupVaultEvents.RESTORE_JOB_FAILED)));

        this.primaryVault = vaultBuilder.build();

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
        // Cross-account copy destination
        // ============================================================================

        // A copy job runs under this role in this account and writes into a vault owned by the backup
        // account. That needs permission on both sides: the destination vault's access policy names
        // this role, and the role itself needs CopyFromBackupVault and CopyIntoBackupVault. The
        // managed backup policy already carries them, but a custom policy on the role keeps the
        // dependency visible and survives a swap to a narrower managed policy.
        IBackupVault crossAccountVault = props.crossAccountBackupVaultArn()
                .filter(arn -> !arn.isBlank())
                .map(arn -> {
                    backupRole.addToPolicy(PolicyStatement.Builder.create()
                            .sid("CopyRecoveryPointsToBackupAccount")
                            .effect(Effect.ALLOW)
                            .actions(List.of("backup:CopyFromBackupVault", "backup:CopyIntoBackupVault"))
                            .resources(List.of(this.primaryVault.getBackupVaultArn(), arn))
                            .build());

                    // The copy is re-encrypted with the backup account's key. Its key policy grants
                    // this role, and a cross-account grant needs the same allow on the identity side.
                    backupRole.addToPolicy(PolicyStatement.Builder.create()
                            .sid("UseBackupAccountKeyForCopies")
                            .effect(Effect.ALLOW)
                            .actions(List.of(
                                    "kms:Encrypt",
                                    "kms:Decrypt",
                                    "kms:ReEncrypt*",
                                    "kms:GenerateDataKey*",
                                    "kms:DescribeKey",
                                    "kms:CreateGrant"))
                            .resources(List.of(backupAccountKeyWildcardArn(arn)))
                            .build());

                    return (IBackupVault) BackupVault.fromBackupVaultArn(this, "CrossAccountVault", arn);
                })
                .orElse(null);

        // ============================================================================
        // Backup Plan - Daily, Weekly, Monthly, copied to the backup account
        // ============================================================================

        List<BackupPlanRule> backupRules = new ArrayList<>();

        // Daily backup at 02:00 UTC
        backupRules.add(BackupPlanRule.Builder.create()
                .ruleName("DailyBackup")
                .backupVault(this.primaryVault)
                .scheduleExpression(Schedule.cron(software.amazon.awscdk.services.events.CronOptions.builder()
                        .hour("2")
                        .minute("0")
                        .build()))
                .deleteAfter(Duration.days(props.dailyBackupRetentionDays()))
                .copyActions(copyToBackupAccount(crossAccountVault, props.dailyBackupRetentionDays()))
                .startWindow(Duration.hours(1))
                .completionWindow(Duration.hours(2))
                .build());

        // Weekly backup (Sundays at 03:00 UTC)
        backupRules.add(BackupPlanRule.Builder.create()
                .ruleName("WeeklyBackup")
                .backupVault(this.primaryVault)
                .scheduleExpression(Schedule.cron(software.amazon.awscdk.services.events.CronOptions.builder()
                        .weekDay("SUN")
                        .hour("3")
                        .minute("0")
                        .build()))
                .deleteAfter(Duration.days(props.weeklyBackupRetentionDays()))
                .startWindow(Duration.hours(1))
                .completionWindow(Duration.hours(3))
                .build());

        // Monthly backup (1st of month at 04:00 UTC) - HMRC compliance retention
        backupRules.add(BackupPlanRule.Builder.create()
                .ruleName("MonthlyCompliance")
                .backupVault(this.primaryVault)
                .scheduleExpression(Schedule.cron(software.amazon.awscdk.services.events.CronOptions.builder()
                        .day("1")
                        .hour("4")
                        .minute("0")
                        .build()))
                .deleteAfter(Duration.days(props.complianceRetentionDays()))
                .moveToColdStorageAfter(Duration.days(90))
                .copyActions(copyToBackupAccount(crossAccountVault, props.complianceRetentionDays()))
                .startWindow(Duration.hours(1))
                .completionWindow(Duration.hours(4))
                .build());

        this.backupPlan = BackupPlan.Builder.create(this, props.resourceNamePrefix() + "-BackupPlan")
                .backupPlanName(props.resourceNamePrefix() + "-backup-plan")
                .backupPlanRules(backupRules)
                .build();

        // ============================================================================
        // Backup Selection - Critical Tables
        // ============================================================================

        ITable receiptsTable =
                importTable("ImportedReceiptsTable", props.sharedNames().receiptsTableName);
        ITable bundlesTable = importTable("ImportedBundlesTable", props.sharedNames().bundlesTableName);
        ITable hmrcApiRequestsTable =
                importTable("ImportedHmrcApiRequestsTable", props.sharedNames().hmrcApiRequestsTableName);
        ITable passesTable = importTable("ImportedPassesTable", props.sharedNames().passesTableName);
        ITable subscriptionsTable =
                importTable("ImportedSubscriptionsTable", props.sharedNames().subscriptionsTableName);

        BackupSelection.Builder.create(this, props.resourceNamePrefix() + "-CriticalTablesSelection")
                .backupPlan(this.backupPlan)
                .role(backupRole)
                .resources(List.of(
                        BackupResource.fromDynamoDbTable(receiptsTable),
                        BackupResource.fromDynamoDbTable(bundlesTable),
                        BackupResource.fromDynamoDbTable(hmrcApiRequestsTable),
                        BackupResource.fromDynamoDbTable(passesTable),
                        BackupResource.fromDynamoDbTable(subscriptionsTable)))
                .backupSelectionName(props.resourceNamePrefix() + "-critical-tables")
                .build();

        // ============================================================================
        // Outputs
        // ============================================================================
        cfnOutput(this, "PrimaryVaultArn", this.primaryVault.getBackupVaultArn());
        cfnOutput(this, "PrimaryVaultName", this.primaryVault.getBackupVaultName());
        cfnOutput(this, "BackupPlanId", this.backupPlan.getBackupPlanId());
        cfnOutput(this, "BackupExportsBucket", this.backupExportsBucket.getBucketName());
        cfnOutput(this, "BackupKmsKeyArn", this.backupKmsKey.getKeyArn());
        cfnOutput(this, "BackupRoleArn", backupRole.getRoleArn());
        cfnOutput(
                this,
                "CrossAccountCopyVaultArn",
                props.crossAccountBackupVaultArn().orElse("none"));

        infof(
                "BackupStack %s created for %s copying to %s",
                this.getNode().getId(),
                props.sharedNames().dashedDeploymentDomainName,
                props.crossAccountBackupVaultArn().orElse("no cross-account vault"));
    }

    private ITable importTable(String constructId, String tableName) {
        return Table.fromTableArn(
                this,
                constructId,
                String.format("arn:aws:dynamodb:%s:%s:table/%s", this.getRegion(), this.getAccount(), tableName));
    }

    /**
     * Copies stay in warm storage: AWS Backup will not copy a recovery point that has already moved
     * to a cold tier, so a cold transition on the copy buys nothing and risks the copy failing.
     */
    private static List<BackupPlanCopyActionProps> copyToBackupAccount(IBackupVault vault, int retentionDays) {
        if (vault == null) {
            return null;
        }
        return List.of(BackupPlanCopyActionProps.builder()
                .destinationBackupVault(vault)
                .deleteAfter(Duration.days(retentionDays))
                .build());
    }

    /** Every key in the backup account's region, since the key is created by a stack in that account. */
    private static String backupAccountKeyWildcardArn(String vaultArn) {
        String[] parts = vaultArn.split(":");
        if (parts.length < 6) {
            throw new IllegalArgumentException("Not a backup vault ARN: " + vaultArn);
        }
        return String.format("arn:%s:kms:%s:%s:key/*", parts[1], parts[3], parts[4]);
    }
}
