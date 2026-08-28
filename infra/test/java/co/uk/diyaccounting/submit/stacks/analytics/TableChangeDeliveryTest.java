/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.s3.Bucket;

/**
 * Instantiates {@link TableChangeDelivery} standalone in a throwaway stack, the way a
 * concurrently-edited {@code AnalyticsStack.java} cannot be relied on to do yet. This keeps the
 * construct's own tests independent of how (or whether) it has been wired in.
 */
class TableChangeDeliveryTest {

    private Template synthTableChangeDelivery() {
        var sharedNames = SubmitSharedNames.forDocs();
        App app = new App();
        Stack stack = new Stack(
                app,
                "TestStack",
                StackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .build());

        var lakeBucket = Bucket.fromBucketName(stack, "LakeBucket", sharedNames.analyticsLakeBucketName);

        var props = TableChangeDelivery.TableChangeDeliveryProps.builder()
                .lakeBucket(lakeBucket)
                .glueDatabaseName(sharedNames.glueDatabaseName)
                .sharedNames(sharedNames)
                .envName("docs")
                .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                .baseImageTag("test-tag")
                .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                .ecrRepositoryName(sharedNames.ecrRepositoryName)
                .build();

        new TableChangeDelivery(stack, "TableChangeDelivery", props);

        return Template.fromStack(stack);
    }

    @Test
    void createsOneDeliveryStreamAndGlueTablePerStreamedTable() {
        Template template = synthTableChangeDelivery();

        template.resourceCountIs("AWS::KinesisFirehose::DeliveryStream", 4);
        template.resourceCountIs("AWS::Glue::Table", 4);
        template.resourceCountIs("AWS::Lambda::EventSourceMapping", 4);
    }

    @Test
    void deliveryStreamsConvertToParquetUnderTheirOwnCuratedPrefix() {
        Template template = synthTableChangeDelivery();

        template.hasResourceProperties(
                "AWS::KinesisFirehose::DeliveryStream",
                Match.objectLike(Map.of(
                        "ExtendedS3DestinationConfiguration",
                        Match.objectLike(Map.of(
                                "Prefix",
                                Match.stringLikeRegexp("^curated/tables/receipts/.*"),
                                "CompressionFormat",
                                "UNCOMPRESSED",
                                "DataFormatConversionConfiguration",
                                Match.objectLike(Map.of("Enabled", true)))))));
    }

    @Test
    void eventSourceMappingsReportBatchItemFailuresAndBisectOnError() {
        Template template = synthTableChangeDelivery();

        template.hasResourceProperties(
                "AWS::Lambda::EventSourceMapping",
                Match.objectLike(Map.of(
                        "StartingPosition",
                        "LATEST",
                        "BatchSize",
                        100,
                        "BisectBatchOnFunctionError",
                        true,
                        "MaximumRetryAttempts",
                        3,
                        "FunctionResponseTypes",
                        List.of("ReportBatchItemFailures"))));
    }

    @Test
    void consumerLambdaCarriesStreamTargetsForAllFourTables() throws Exception {
        Template template = synthTableChangeDelivery();
        var sharedNames = SubmitSharedNames.forDocs();

        var functions = template.findResources("AWS::Lambda::Function");
        boolean found = false;
        for (Map<String, Object> function : functions.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) function.get("Properties");
            if (properties == null) continue;
            @SuppressWarnings("unchecked")
            var environment = (Map<String, Object>) properties.get("Environment");
            if (environment == null) continue;
            @SuppressWarnings("unchecked")
            var variables = (Map<String, Object>) environment.get("Variables");
            if (variables == null || !variables.containsKey("STREAM_TARGETS")) continue;

            found = true;
            String json = String.valueOf(variables.get("STREAM_TARGETS"));
            JsonNode targets = new ObjectMapper().readTree(json);
            assertEquals(4, targets.size());
            assertTrue(targets.has(sharedNames.receiptsTableName));
            assertTrue(targets.has(sharedNames.bundlesTableName));
            assertTrue(targets.has(sharedNames.subscriptionsTableName));
            assertTrue(targets.has(sharedNames.passesTableName));
        }
        assertTrue(found, "Expected one Lambda function with a STREAM_TARGETS environment variable");
    }

    /**
     * Mirrors the check {@code SubmitEnvironmentCdkResourceTest.assertNoUnscopedIamResources}
     * runs over the whole environment: no inline policy statement in this construct grants on
     * every resource, except the X-Ray actions the shared {@code Lambda} construct always adds,
     * which carry no resource-level permissions at all in IAM.
     */
    @Test
    void noIamPolicyStatementGrantsOnEveryResource() {
        Template template = synthTableChangeDelivery();

        var offenders = new ArrayList<String>();
        var policies = template.findResources("AWS::IAM::Policy");
        for (Map.Entry<String, Map<String, Object>> policy : policies.entrySet()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.getValue().get("Properties");
            if (properties == null) continue;
            @SuppressWarnings("unchecked")
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            if (document == null) continue;
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) document.get("Statement");
            if (statements == null) continue;
            for (Map<String, Object> statement : statements) {
                if (!"*".equals(statement.get("Resource"))) continue;
                if (isResourceLevelExemptAction(statement.get("Action"))) continue;
                offenders.add(policy.getKey() + " " + statement.get("Action"));
            }
        }
        assertTrue(offenders.isEmpty(), "IAM statements granting on every resource: " + offenders);
    }

    private static boolean isResourceLevelExemptAction(Object action) {
        List<?> actions = action instanceof List<?> list ? list : List.of(String.valueOf(action));
        return !actions.isEmpty() && actions.stream().allMatch(a -> String.valueOf(a).startsWith("xray:"));
    }
}
