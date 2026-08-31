/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.glue.CfnDatabase;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;

/**
 * Exercises {@link CloudFrontAccessLogs} in a standalone test stack rather than through
 * {@code AnalyticsStack}: this construct is not wired into any owned stack yet (see
 * PLAN_USAGE_DATA_PIPELINE.md WP-11), so the wiring test lives here until it lands.
 */
class CloudFrontAccessLogsTest {

    private static final String ACCOUNT = "111111111111";

    private static Template synth(SubmitSharedNames sharedNames) {
        App app = new App();
        Stack stack = new Stack(
                app,
                "TestCloudFrontAccessLogsStack",
                StackProps.builder()
                        .env(Environment.builder()
                                .account(ACCOUNT)
                                .region("eu-west-2")
                                .build())
                        .build());

        Bucket lakeBucket = Bucket.Builder.create(stack, "Lake")
                .bucketName(sharedNames.analyticsLakeBucketName)
                .encryption(BucketEncryption.S3_MANAGED)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .build();

        CfnDatabase glueDatabase = CfnDatabase.Builder.create(stack, "GlueDatabase")
                .catalogId(stack.getAccount())
                .databaseInput(CfnDatabase.DatabaseInputProperty.builder()
                        .name(sharedNames.glueDatabaseName)
                        .build())
                .build();

        new CloudFrontAccessLogs(
                stack,
                CloudFrontAccessLogs.CloudFrontAccessLogsProps.builder()
                        .envResourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .lakeBucketName(sharedNames.analyticsLakeBucketName)
                        .lakeBucket(lakeBucket)
                        .glueDatabaseName(sharedNames.glueDatabaseName)
                        .glueDatabase(glueDatabase)
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void shouldNotCreateAnAclEnabledLoggingBucketNowThatOnlyTheV2ParquetDeliveryRemains() {
        var sharedNames = SubmitSharedNames.forDocs();
        Template template = synth(sharedNames);

        var buckets = template.findResources("AWS::S3::Bucket");
        boolean hasObjectWriterBucket = buckets.values().stream().anyMatch(resource -> {
            @SuppressWarnings("unchecked")
            var props = (Map<String, Object>) resource.get("Properties");
            return String.valueOf(props).contains("ObjectWriter");
        });
        assertFalse(hasObjectWriterBucket, "expected no AWS::S3::Bucket with ObjectOwnership: ObjectWriter");
    }

    @Test
    void shouldCatalogueCloudFrontRequestsWithProjectionAndAnInjectedDistributionPartition() {
        var sharedNames = SubmitSharedNames.forDocs();
        Template template = synth(sharedNames);

        template.resourceCountIs("AWS::Glue::Table", 1);
        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "DatabaseName",
                        sharedNames.glueDatabaseName,
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "cloudfront_requests",
                                "Parameters",
                                Match.objectLike(Map.of(
                                        "classification", "parquet",
                                        "projection.enabled", "true",
                                        "projection.distribution_id.type", "injected")),
                                "PartitionKeys",
                                Match.arrayWith(List.of(
                                        Match.objectLike(Map.of("Name", "distribution_id", "Type", "string")))))))));
    }

    @Test
    void shouldExcludePersonalDataFromTheTableDescriptionOnlyAsAWarningNotAColumnDrop() {
        var sharedNames = SubmitSharedNames.forDocs();
        Template template = synth(sharedNames);

        // c_ip stays in the table (it's the raw operational record); the GDPR constraint is that
        // no view built on top of it may select the column, which the description calls out since
        // there is no way to enforce it at the Glue-table level itself.
        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Description",
                                Match.stringLikeRegexp("(?=.*c_ip)(?=.*personal data).*"),
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(
                                                List.of(
                                                        Match.objectLike(
                                                                Map.of("Name", "c_ip", "Type", "string")))))))))));
    }

    @Test
    void shouldAuthoriseCloudWatchLogsDeliveryToWriteUnderRawCloudfrontOnTheLakeBucket() {
        var sharedNames = SubmitSharedNames.forDocs();
        Template template = synth(sharedNames);

        var policies = template.findResources("AWS::S3::BucketPolicy");
        boolean grantsWrite = policies.values().stream().anyMatch(resource -> {
            @SuppressWarnings("unchecked")
            var props = (Map<String, Object>) resource.get("Properties");
            var document = String.valueOf(props.get("PolicyDocument"));
            return document.contains("delivery.logs.amazonaws.com")
                    && document.contains("s3:PutObject")
                    && document.contains("raw/cloudfront/");
        });
        assertTrue(
                grantsWrite,
                "expected a bucket policy granting delivery.logs.amazonaws.com s3:PutObject "
                        + "under raw/cloudfront/ on the lake bucket");
    }
}
