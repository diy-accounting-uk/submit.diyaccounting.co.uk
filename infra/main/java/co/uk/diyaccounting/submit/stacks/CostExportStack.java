/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.stacks.analytics.CostFocusIngestion;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.bcmdataexports.CfnExport;
import software.amazon.awscdk.services.iam.AccountPrincipal;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.IPrincipal;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.StorageClass;
import software.amazon.awscdk.services.s3.Transition;
import software.constructs.Construct;

/**
 * The FOCUS 1.2 cost export in the management account (887764105431): the bucket it lands in, and
 * the {@code AWS::BCMDataExports::Export} itself.
 *
 * <p>Deploys into the management account, not a deployment account, so it has its own CDK app
 * ({@code SubmitCostReporting}) rather than sitting in {@code SubmitEnvironment}, the same reason
 * {@link CrossAccountBackupVaultStack} has {@code SubmitBackupAccount}. Unlike the backup account,
 * the management account already trusts this repository's GitHub Actions through
 * {@code root-github-actions-role} and {@code root-deployment-role}, so no bootstrap access stack
 * is needed here: the existing role chain can already assume the CDK bootstrap deploy roles in
 * 887764105431.
 *
 * <p>The export writes Parquet under {@code focus/} in this bucket on AWS's own refresh cadence.
 * {@code CostFocusIngestion} in each deployment account's {@code AnalyticsStack} copies new
 * objects into that account's own analytics lake nightly, which is why this stack's bucket policy
 * names each deployment account's copy role by ARN rather than granting the account as a whole.
 */
public class CostExportStack extends Stack {

    /** Table name for the CUR2/Data Exports "FOCUS 1.2 with AWS columns" table. */
    public static final String FOCUS_TABLE_NAME = "FOCUS_1_2_AWS";

    /** Prefix the export writes under, inside {@link #bucket}. */
    public static final String EXPORT_S3_PREFIX = "focus";

    public final Bucket bucket;
    public final CfnExport export;

    @Value.Immutable
    public interface CostExportStackProps extends StackProps {

        @Override
        Environment getEnv();

        /** Physical name for the export bucket, e.g. diy-accounting-cost-focus-887764105431. */
        String bucketName();

        /** Name the export itself is given in Billing and Cost Management. */
        String exportName();

        /**
         * ARNs of the IAM roles in the deployment accounts that read this bucket nightly to copy
         * the export into their own analytics lake, e.g.
         * arn:aws:iam::972912397388:role/prod-env-cost-focus-copy-role.
         */
        List<String> readerRoleArns();

        static ImmutableCostExportStackProps.Builder builder() {
            return ImmutableCostExportStackProps.builder();
        }
    }

    public CostExportStack(Construct scope, String id, CostExportStackProps props) {
        super(scope, id, props);

        // ============================================================================
        // Bucket
        // ============================================================================
        this.bucket = Bucket.Builder.create(this, "FocusExportBucket")
                .bucketName(props.bucketName())
                .encryption(BucketEncryption.S3_MANAGED)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .versioned(false)
                .lifecycleRules(List.of(LifecycleRule.builder()
                        .id("archive-after-180-days")
                        .transitions(List.of(Transition.builder()
                                .storageClass(StorageClass.GLACIER_INSTANT_RETRIEVAL)
                                .transitionAfter(Duration.days(180))
                                .build()))
                        .build()))
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .build();

        // Data Exports needs to read back its own delivery to validate it, alongside the write.
        this.bucket.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowBcmDataExportsDelivery")
                .effect(Effect.ALLOW)
                .principals(List.of(new ServicePrincipal("bcm-data-exports.amazonaws.com")))
                .actions(List.of("s3:PutObject", "s3:GetBucketPolicy"))
                .resources(List.of(this.bucket.getBucketArn(), this.bucket.getBucketArn() + "/*"))
                .conditions(Map.of(
                        "StringEquals", Map.of("aws:SourceAccount", this.getAccount()),
                        "StringLike",
                                Map.of(
                                        "aws:SourceArn",
                                        "arn:aws:bcm-data-exports:%s:%s:export/*"
                                                .formatted(this.getRegion(), this.getAccount()))))
                .build());

        if (!props.readerRoleArns().isEmpty()) {
            List<String> roleArns = props.readerRoleArns();
            List<String> accountIds =
                    roleArns.stream().map(arn -> arn.split(":")[4]).distinct().toList();
            List<IPrincipal> accountPrincipals = accountIds.stream()
                    .map(accountId -> (IPrincipal) new AccountPrincipal(accountId))
                    .toList();

            this.bucket.addToResourcePolicy(PolicyStatement.Builder.create()
                    .sid("AllowDeploymentAccountsToReadTheExport")
                    .effect(Effect.ALLOW)
                    .principals(List.copyOf(accountPrincipals))
                    .actions(List.of("s3:GetObject"))
                    .resources(List.of(this.bucket.getBucketArn() + "/" + EXPORT_S3_PREFIX + "/*"))
                    .conditions(Map.of("ArnLike", Map.of("aws:PrincipalArn", roleArns)))
                    .build());
            this.bucket.addToResourcePolicy(PolicyStatement.Builder.create()
                    .sid("AllowDeploymentAccountsToListTheExport")
                    .effect(Effect.ALLOW)
                    .principals(List.copyOf(accountPrincipals))
                    .actions(List.of("s3:ListBucket"))
                    .resources(List.of(this.bucket.getBucketArn()))
                    .conditions(Map.of(
                            "StringLike", Map.of("s3:prefix", EXPORT_S3_PREFIX + "/*"),
                            "ArnLike", Map.of("aws:PrincipalArn", roleArns)))
                    .build());
        }

        // ============================================================================
        // FOCUS 1.2 Data Export
        // ============================================================================
        // TIME_GRANULARITY is the only table configuration FOCUS 1.2 exposes (no
        // INCLUDE_RESOURCES/split-cost-allocation options as CUR 2.0 has). DAILY matches the
        // nightly copy job's own cadence: an hourly grain would only be re-aggregated to a day
        // downstream anyway.
        //
        // The Data Exports API rejects "SELECT *", so the column list is explicit, and must use
        // the FOCUS API's own PascalCase column names (verified against the live table
        // dictionary) rather than the lowercase snake_case Glue and Athena conventionally use.
        // CostFocusTables derives its Glue column names from this same list, so the query and
        // the table it feeds cannot drift apart on spelling.
        this.export = CfnExport.Builder.create(this, "FocusExport")
                .export(CfnExport.ExportProperty.builder()
                        .name(props.exportName())
                        .description("FOCUS 1.2 cost and usage export for the whole organisation")
                        .dataQuery(CfnExport.DataQueryProperty.builder()
                                .queryStatement("SELECT " + String.join(", ", CostFocusIngestion.FOCUS_1_2_COLUMNS)
                                        + " FROM " + FOCUS_TABLE_NAME)
                                .tableConfigurations(Map.of(FOCUS_TABLE_NAME, Map.of("TIME_GRANULARITY", "DAILY")))
                                .build())
                        .destinationConfigurations(CfnExport.DestinationConfigurationsProperty.builder()
                                .s3Destination(CfnExport.S3DestinationProperty.builder()
                                        .s3Bucket(props.bucketName())
                                        .s3Prefix(EXPORT_S3_PREFIX)
                                        .s3Region(this.getRegion())
                                        .s3OutputConfigurations(CfnExport.S3OutputConfigurationsProperty.builder()
                                                .outputType("CUSTOM")
                                                .format("PARQUET")
                                                .compression("PARQUET")
                                                .overwrite("OVERWRITE_REPORT")
                                                .build())
                                        .build())
                                .build())
                        // Data Exports has no fixed daily cron of its own: SYNCHRONOUS refreshes
                        // as AWS's own cost data updates, several times a day, which is the
                        // closest this API gets to "monthly report, refreshed daily".
                        .refreshCadence(CfnExport.RefreshCadenceProperty.builder()
                                .frequency("SYNCHRONOUS")
                                .build())
                        .build())
                .build();
        this.export.getNode().addDependency(this.bucket);

        cfnOutput(this, "FocusExportBucketName", this.bucket.getBucketName());
        cfnOutput(this, "FocusExportBucketArn", this.bucket.getBucketArn());
        cfnOutput(this, "FocusExportArn", this.export.getAttrExportArn());

        infof("CostExportStack created FOCUS 1.2 export %s into bucket %s", props.exportName(), props.bucketName());
    }
}
