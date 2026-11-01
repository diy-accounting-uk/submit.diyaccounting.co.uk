/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
 * Instantiates {@link AnalyticsDashboard} standalone in a throwaway stack, the way a
 * concurrently-edited {@code AnalyticsStack.java} cannot be relied on to do yet. This keeps the
 * construct's own tests independent of how (or whether) it has been wired in.
 */
class AnalyticsDashboardTest {

    private Template synthAnalyticsDashboard() {
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

        var lakeBucket = Bucket.fromBucketName(stack, "LakeBucket", sharedNames.analytics.analyticsLakeBucketName);
        var resultsBucket =
                Bucket.fromBucketName(stack, "ResultsBucket", sharedNames.analytics.analyticsResultsBucketName);

        var props = AnalyticsDashboard.AnalyticsDashboardProps.builder()
                .idPrefix(sharedNames.envResourceNamePrefix)
                .envName("docs")
                .sharedNames(sharedNames)
                .baseImageTag("test-tag")
                .ecrRepositoryArn(sharedNames.ecr.ecrRepositoryArn)
                .ecrRepositoryName(sharedNames.ecr.ecrRepositoryName)
                .resultsBucket(resultsBucket)
                .lakeBucket(lakeBucket)
                .glueDatabaseName(sharedNames.analytics.glueDatabaseName)
                .athenaWorkGroupName(sharedNames.analytics.athenaWorkGroupName)
                .build();

        new AnalyticsDashboard(stack, props);

        return Template.fromStack(stack);
    }

    @Test
    void createsOneLambdaNoScheduleOrDlqAndTwoAlarms() {
        Template template = synthAnalyticsDashboard();

        // The metrics-publish function name is stable across every redeploy of this env-scoped
        // stack, so its log group goes through the idempotent AwsCustomResource path, adding a
        // second Lambda function: the shared create-if-missing/retention singleton provider.
        template.resourceCountIs("AWS::Lambda::Function", 2);
        // No schedule or DLQ: IngestionStack's NightlyIngestionWorkflow state machine invokes
        // this Lambda directly as the last step of the nightly chain.
        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::SQS::Queue", 0);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 2);
        template.resourceCountIs("AWS::CloudWatch::Dashboard", 0);

        // Importing both buckets by name creates no bucket of its own.
        template.resourceCountIs("AWS::S3::Bucket", 0);

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of("FunctionName", "docs-env-analytics-metrics-publish")));
    }

    @Test
    void alarmsCarryNoSnsActionAndMatchTheErrorsAndChargesMetrics() {
        Template template = synthAnalyticsDashboard();

        var alarms = template.findResources("AWS::CloudWatch::Alarm");
        assertEquals(2, alarms.size());
        for (Map<String, Object> alarm : alarms.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) alarm.get("Properties");
            assertTrue(!properties.containsKey("AlarmActions"), "alarm should have no SNS action: " + properties);
        }

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-analytics-metrics-publish-errors",
                        "MetricName", "Errors",
                        "Namespace", "AWS/Lambda")));

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-charges-without-activation",
                        "MetricName", "ChargesWithoutActivation",
                        "Namespace", "Submit/Analytics",
                        "Period", 86400,
                        "Statistic", "Sum",
                        "Threshold", 0,
                        "EvaluationPeriods", 1,
                        "ComparisonOperator", "GreaterThanThreshold",
                        "TreatMissingData", "notBreaching")));
    }

    @Test
    void putMetricDataIsConditionedOnTheAnalyticsNamespace() {
        Template template = synthAnalyticsDashboard();

        template.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "cloudwatch:PutMetricData",
                                        "Resource",
                                        "*",
                                        "Condition",
                                        Map.of(
                                                "StringEquals",
                                                Map.of("cloudwatch:namespace", "Submit/Analytics")))))))))));
    }

    /**
     * Mirrors {@code SubmitEnvironmentCdkResourceTest.assertNoUnscopedIamResources}, with one
     * addition: {@code cloudwatch:PutMetricData} is also exempt. CloudWatch metrics carry no
     * ARN at all, so a namespace condition (asserted separately above) is the narrowest grant
     * this action can ever take; a bare Resource: "*" for it is not a scoping mistake.
     */
    @Test
    void noIamPolicyStatementGrantsOnEveryResourceWithoutAnExemptCondition() {
        Template template = synthAnalyticsDashboard();

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
                && actions.stream()
                        .allMatch(a -> String.valueOf(a).startsWith("xray:") || "cloudwatch:PutMetricData".equals(a));
    }
}
