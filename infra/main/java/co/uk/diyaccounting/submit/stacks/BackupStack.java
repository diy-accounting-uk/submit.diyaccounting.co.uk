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
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.backup.BackupPlan;
import software.amazon.awscdk.services.backup.BackupPlanRule;
import software.amazon.awscdk.services.backup.BackupResource;
import software.amazon.awscdk.services.backup.BackupSelection;
import software.amazon.awscdk.services.backup.BackupVault;
import software.amazon.awscdk.services.backup.BackupVaultEvents;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.iam.ManagedPolicy;
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
 * - Local backup vault within deployment account (no cross-region)
 * - Daily, weekly, and monthly backup schedules
 * - S3 bucket for DynamoDB exports (shipped to backup account)
 * - Multi-region redundancy handled by dedicated backup account
 *
 * <p>See BACKUP_STRATEGY_PLAN.md for full architecture documentation.
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

        // Apply cost allocation tags
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("Stack", "BackupStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

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
        // Backup Plan - Daily, Weekly, Monthly (local vault only)
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

        ITable receiptsTable = Table.fromTableArn(
                this,
                "ImportedReceiptsTable",
                String.format(
                        "arn:aws:dynamodb:%s:%s:table/%s",
                        this.getRegion(), this.getAccount(), props.sharedNames().receiptsTableName));

        ITable bundlesTable = Table.fromTableArn(
                this,
                "ImportedBundlesTable",
                String.format(
                        "arn:aws:dynamodb:%s:%s:table/%s",
                        this.getRegion(), this.getAccount(), props.sharedNames().bundlesTableName));

        ITable hmrcApiRequestsTable = Table.fromTableArn(
                this,
                "ImportedHmrcApiRequestsTable",
                String.format(
                        "arn:aws:dynamodb:%s:%s:table/%s",
                        this.getRegion(), this.getAccount(), props.sharedNames().hmrcApiRequestsTableName));

        BackupSelection.Builder.create(this, props.resourceNamePrefix() + "-CriticalTablesSelection")
                .backupPlan(this.backupPlan)
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
        cfnOutput(this, "PrimaryVaultName", this.primaryVault.getBackupVaultName());
        cfnOutput(this, "BackupPlanId", this.backupPlan.getBackupPlanId());
        cfnOutput(this, "BackupExportsBucket", this.backupExportsBucket.getBucketName());
        cfnOutput(this, "BackupKmsKeyArn", this.backupKmsKey.getKeyArn());

        infof(
                "BackupStack %s created successfully for %s (local vault, no cross-region)",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
