/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
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
 * Instantiates {@link OperatorSnapshotPublish} standalone in a throwaway stack, the way {@code
 * AnalyticsDashboardTest} keeps its construct's tests independent of {@code AnalyticsStack.java}.
 */
class OperatorSnapshotPublishTest {

    private Template synthOperatorSnapshotPublish(String envName) {
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
        var resultsBucket = Bucket.fromBucketName(stack, "ResultsBucket", sharedNames.analyticsResultsBucketName);

        var props = OperatorSnapshotPublish.OperatorSnapshotPublishProps.builder()
                .idPrefix(sharedNames.envResourceNamePrefix)
                .envName(envName)
                .baseImageTag("test-tag")
                .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                .ecrRepositoryName(sharedNames.ecrRepositoryName)
                .resultsBucket(resultsBucket)
                .lakeBucket(lakeBucket)
                .glueDatabaseName(sharedNames.glueDatabaseName)
                .athenaWorkGroupName(sharedNames.athenaWorkGroupName)
                .build();

        new OperatorSnapshotPublish(stack, props);

        return Template.fromStack(stack);
    }

    @Test
    void createsOneLambdaOneScheduleAndOneAlarm() {
        Template template = synthOperatorSnapshotPublish("prod");

        // The function name is stable across every redeploy of this env-scoped stack, so its
        // log group goes through the idempotent AwsCustomResource path, adding a second Lambda
        // function: the shared create-if-missing/retention singleton provider.
        template.resourceCountIs("AWS::Lambda::Function", 2);
        template.resourceCountIs("AWS::Events::Rule", 1);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 1);
        template.resourceCountIs("AWS::S3::Bucket", 0);

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of("FunctionName", "docs-env-operator-snapshot-publish")));
    }

    @Test
    void prodRunsDailyAndCiRunsWeekly() {
        var prodTemplate = synthOperatorSnapshotPublish("prod");
        prodTemplate.hasResourceProperties(
                "AWS::Events::Rule", Match.objectLike(Map.of("ScheduleExpression", "cron(15 3 * * ? *)")));

        var ciTemplate = synthOperatorSnapshotPublish("ci");
        ciTemplate.hasResourceProperties(
                "AWS::Events::Rule", Match.objectLike(Map.of("ScheduleExpression", "cron(15 3 ? * MON *)")));
    }

    @Test
    void alarmCarriesNoSnsActionAndMatchesTheErrorsMetric() {
        Template template = synthOperatorSnapshotPublish("prod");

        var alarms = template.findResources("AWS::CloudWatch::Alarm");
        assertEquals(1, alarms.size());
        for (Map<String, Object> alarm : alarms.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) alarm.get("Properties");
            assertTrue(!properties.containsKey("AlarmActions"), "alarm should have no SNS action: " + properties);
        }

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-operator-snapshot-publish-errors",
                        "MetricName", "Errors",
                        "Namespace", "AWS/Lambda")));
    }

    @Test
    void lambdaCanWriteOnlyUnderTheSnapshotsPrefixOfTheLake() {
        Template template = synthOperatorSnapshotPublish("prod");

        var found = new java.util.ArrayList<Object>();
        var policies = template.findResources("AWS::IAM::Policy");
        for (Map<String, Object> policy : policies.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.get("Properties");
            @SuppressWarnings("unchecked")
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            @SuppressWarnings("unchecked")
            var statements = (java.util.List<Map<String, Object>>) document.get("Statement");
            for (Map<String, Object> statement : statements) {
                if ("s3:PutObject".equals(statement.get("Action")) && resourceEndsWithSnapshotsGlob(statement.get("Resource"))) {
                    found.add(statement.get("Resource"));
                }
            }
        }
        assertTrue(found.size() == 1, "expected exactly one s3:PutObject statement scoped to /snapshots/*, found: " + found);
    }

    /**
     * The bucket ARN is an imported-by-name {@code Bucket.fromBucketName} reference, so
     * CloudFormation resolves it as an {@code Fn::Join} of the partition ref and the literal
     * bucket name/prefix, not a plain string - unwrap it to check the literal suffix.
     */
    @SuppressWarnings("unchecked")
    private static boolean resourceEndsWithSnapshotsGlob(Object resource) {
        if (resource instanceof String s) return s.endsWith("/snapshots/*");
        if (!(resource instanceof Map<?, ?> map)) return false;
        var joinParts = (java.util.List<Object>) map.get("Fn::Join");
        if (joinParts == null || joinParts.size() < 2) return false;
        var parts = (java.util.List<Object>) joinParts.get(1);
        var lastPart = parts.get(parts.size() - 1);
        return lastPart instanceof String s && s.endsWith("/snapshots/*");
    }
}
