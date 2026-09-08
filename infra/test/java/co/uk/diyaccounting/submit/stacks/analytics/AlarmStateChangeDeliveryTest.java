/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
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
 * Instantiates {@link AlarmStateChangeDelivery} standalone in a throwaway stack, the way a
 * concurrently-edited {@code AnalyticsStack.java} cannot be relied on to do yet. This keeps the
 * construct's own tests independent of how (or whether) it has been wired in.
 */
class AlarmStateChangeDeliveryTest {

    private Template synthAlarmStateChangeDelivery() {
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

        var props = AlarmStateChangeDelivery.AlarmStateChangeDeliveryProps.builder()
                .lakeBucket(lakeBucket)
                .glueDatabaseName(sharedNames.glueDatabaseName)
                .sharedNames(sharedNames)
                .envName("docs")
                .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                .baseImageTag("test-tag")
                .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                .ecrRepositoryName(sharedNames.ecrRepositoryName)
                .build();

        new AlarmStateChangeDelivery(stack, "AlarmStateChangeDelivery", props);

        return Template.fromStack(stack);
    }

    @Test
    void createsOneRuleOneStreamAndOneGlueTable() {
        Template template = synthAlarmStateChangeDelivery();

        template.resourceCountIs("AWS::Events::Rule", 1);
        template.resourceCountIs("AWS::KinesisFirehose::DeliveryStream", 1);
        template.resourceCountIs("AWS::Glue::Table", 1);
    }

    @Test
    void ruleMatchesCloudWatchAlarmStateChangeOnTheEnvironmentPrefix() {
        Template template = synthAlarmStateChangeDelivery();

        template.hasResourceProperties(
                "AWS::Events::Rule",
                Match.objectLike(Map.of(
                        "EventPattern",
                        Match.objectLike(Map.of(
                                "source",
                                List.of("aws.cloudwatch"),
                                "detail-type",
                                List.of("CloudWatch Alarm State Change"),
                                "detail",
                                Match.objectLike(Map.of("alarmName", List.of(Map.of("prefix", "docs-")))))))));
    }

    @Test
    void deliveryStreamWritesTheCuratedPrefixWithParquetConversion() {
        Template template = synthAlarmStateChangeDelivery();

        template.hasResourceProperties(
                "AWS::KinesisFirehose::DeliveryStream",
                Match.objectLike(Map.of(
                        "ExtendedS3DestinationConfiguration",
                        Match.objectLike(Map.of(
                                "Prefix",
                                Match.stringLikeRegexp("^curated/alarm-state-changes/.*"),
                                "CompressionFormat",
                                "UNCOMPRESSED",
                                "DataFormatConversionConfiguration",
                                Match.objectLike(Map.of("Enabled", true)))))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void glueTableCarriesTheDeclaredColumns() {
        Template template = synthAlarmStateChangeDelivery();

        var tables = template.findResources("AWS::Glue::Table");
        assertTrue(tables.size() == 1, "expected exactly one Glue table: " + tables.keySet());
        var resource = tables.values().iterator().next();
        var properties = (Map<String, Object>) resource.get("Properties");
        var tableInput = (Map<String, Object>) properties.get("TableInput");
        assertTrue("alarm_state_changes".equals(tableInput.get("Name")));
        var storageDescriptor = (Map<String, Object>) tableInput.get("StorageDescriptor");
        var columns = (List<Map<String, Object>>) storageDescriptor.get("Columns");

        var columnNames = new ArrayList<String>();
        for (var column : columns) {
            columnNames.add(String.valueOf(column.get("Name")));
        }
        for (var expectedName :
                List.of("event_id", "event_ts", "ingest_ts", "alarm_name", "alarm_arn", "family", "deployment_slug",
                        "state", "previous_state", "reason", "region", "namespace", "metric_name", "period_seconds",
                        "threshold", "env", "detail_json")) {
            assertTrue(columnNames.contains(expectedName), "missing column " + expectedName + " in " + columnNames);
        }
    }

    @Test
    void everyLambdaFunctionHasItsOwnExplicitLogGroup() {
        Template template = synthAlarmStateChangeDelivery();

        assertEveryLambdaHasAnExplicitLogGroup(template);
    }

    @SuppressWarnings("unchecked")
    private static void assertEveryLambdaHasAnExplicitLogGroup(Template template) {
        var missing = new ArrayList<String>();
        template.findResources("AWS::Lambda::Function").forEach((id, resource) -> {
            var properties = (Map<String, Object>) resource.get("Properties");
            var loggingConfig = properties == null ? null : (Map<String, Object>) properties.get("LoggingConfig");
            if (loggingConfig == null || !loggingConfig.containsKey("LogGroup")) {
                missing.add(id);
            }
        });
        assertTrue(missing.isEmpty(), "Lambda functions with no explicit log group: " + missing);
    }

    /**
     * Mirrors the check {@code SubmitEnvironmentCdkResourceTest.assertNoUnscopedIamResources}
     * runs over the whole environment: no inline policy statement in this construct grants on
     * every resource, except the X-Ray actions the shared {@code Lambda} construct always adds,
     * which carry no resource-level permissions at all in IAM.
     */
    @Test
    void noIamPolicyStatementGrantsOnEveryResource() {
        Template template = synthAlarmStateChangeDelivery();

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
        return !actions.isEmpty()
                && actions.stream().allMatch(a -> String.valueOf(a).startsWith("xray:"));
    }
}
