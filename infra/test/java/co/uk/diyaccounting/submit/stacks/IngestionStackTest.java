/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.events.CronOptions;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;

class IngestionStackTest {

    private static IngestionStack synthIngestionStack() {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new IngestionStack(
                app,
                "TestIngestionStack",
                IngestionStack.IngestionStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .baseImageTag("latest")
                        .build());
    }

    @Test
    void stackHasNoOrchestrationResourcesUntilAJobRegisters() {
        IngestionStack ingestionStack = synthIngestionStack();
        Template template = Template.fromStack(ingestionStack);

        // Importing the lake bucket by name creates no bucket of its own, and no job Lambda
        // exists yet to schedule.
        template.resourceCountIs("AWS::S3::Bucket", 0);
        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::SQS::Queue", 0);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 0);
    }

    @Test
    void registerScheduledJobWiresRetryingRuleDlqAndBothAlarms() {
        IngestionStack ingestionStack = synthIngestionStack();
        var jobLambda = Function.Builder.create(ingestionStack, "TestJobLambda")
                .functionName("docs-env-test-job")
                .runtime(Runtime.NODEJS_24_X)
                .handler("index.handler")
                .code(Code.fromInline("exports.handler = async () => {};"))
                .build();

        ingestionStack.registerScheduledJob(
                "TestJob",
                "docs-env-test-job",
                jobLambda,
                Schedule.cron(
                        CronOptions.builder().minute("15").hour("2").build()),
                "Test ingestion job");

        Template template = Template.fromStack(ingestionStack);

        template.resourceCountIs("AWS::SQS::Queue", 1);
        template.hasResourceProperties(
                "AWS::SQS::Queue",
                Match.objectLike(Map.of("QueueName", "docs-env-test-job-dlq", "MessageRetentionPeriod", 1209600)));

        template.resourceCountIs("AWS::Events::Rule", 1);
        template.hasResourceProperties(
                "AWS::Events::Rule",
                Match.objectLike(Map.of(
                        "Name",
                        "docs-env-test-job-schedule",
                        "ScheduleExpression",
                        "cron(15 2 * * ? *)",
                        "Targets",
                        Match.arrayWith(List.of(Match.objectLike(Map.of(
                                "RetryPolicy", Match.objectLike(Map.of("MaximumRetryAttempts", 3)),
                                "DeadLetterConfig", Match.objectLike(Map.of("Arn", Match.anyValue())))))))));

        // Both alarms carry no AlarmActions: the account-wide alarm-state-change rule in
        // OpsStack forwards every CloudWatch alarm to Telegram.
        template.resourceCountIs("AWS::CloudWatch::Alarm", 2);
        var alarms = template.findResources("AWS::CloudWatch::Alarm");
        assertTrue(alarms.size() == 2, "expected exactly two alarms");
        for (Map<String, Object> alarm : alarms.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) alarm.get("Properties");
            assertFalse(properties.containsKey("AlarmActions"), "alarm should have no SNS action: " + properties);
        }

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-test-job-errors",
                        "MetricName", "Errors",
                        "Namespace", "AWS/Lambda",
                        "ComparisonOperator", "GreaterThanOrEqualToThreshold",
                        "Threshold", 1)));

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-test-job-dlq-depth",
                        "MetricName", "ApproximateNumberOfMessagesVisible",
                        "Namespace", "AWS/SQS",
                        "ComparisonOperator", "GreaterThanOrEqualToThreshold",
                        "Threshold", 1)));
    }
}
