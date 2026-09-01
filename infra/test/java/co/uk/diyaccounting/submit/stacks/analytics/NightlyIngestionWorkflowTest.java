/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;

/**
 * Instantiates {@link NightlyIngestionWorkflow} standalone in a throwaway stack with five plain
 * (non-Docker) Lambdas standing in for the real job Lambdas, the same "own tests independent of
 * how it is wired in" pattern {@link DataQualityTest} and {@link AnalyticsDashboardTest} use.
 */
class NightlyIngestionWorkflowTest {

    private Template synthWorkflow() {
        return synthWorkflow("docs");
    }

    private Template synthWorkflow(String envName) {
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

        var stripeReconcileLambda = testLambda(stack, "StripeReconcileLambda", "docs-env-stripe-reconcile");
        var ga4ReportPullLambda = testLambda(stack, "Ga4ReportPullLambda", "docs-env-ga4-report-pull");
        var ga4EventExportPullLambda =
                testLambda(stack, "Ga4EventExportPullLambda", "docs-env-ga4-event-export-pull");
        var dataQualityRunLambda = testLambda(stack, "DataQualityRunLambda", "docs-env-data-quality-run");
        var metricsPublishLambda =
                testLambda(stack, "MetricsPublishLambda", "docs-env-analytics-metrics-publish");

        new NightlyIngestionWorkflow(
                stack,
                NightlyIngestionWorkflow.NightlyIngestionWorkflowProps.builder()
                        .idPrefix("docs-env")
                        .envName(envName)
                        .stateMachineName("docs-env-analytics-nightly")
                        .stripeReconcileLambda(stripeReconcileLambda)
                        .ga4ReportPullLambda(ga4ReportPullLambda)
                        .ga4EventExportPullLambda(ga4EventExportPullLambda)
                        .dataQualityRunLambda(dataQualityRunLambda)
                        .metricsPublishLambda(metricsPublishLambda)
                        .build());

        return Template.fromStack(stack);
    }

    private static Function testLambda(Stack stack, String id, String functionName) {
        return Function.Builder.create(stack, id)
                .functionName(functionName)
                .runtime(Runtime.NODEJS_24_X)
                .handler("index.handler")
                .code(Code.fromInline("exports.handler = async () => {};"))
                .build();
    }

    @Test
    void createsExactlyOneStateMachineAndOneSchedule() {
        Template template = synthWorkflow();

        template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
        template.resourceCountIs("AWS::Scheduler::Schedule", 1);
        template.hasResourceProperties(
                "AWS::StepFunctions::StateMachine",
                Match.objectLike(Map.of("StateMachineName", "docs-env-analytics-nightly", "StateMachineType", "STANDARD")));
    }

    @Test
    void noEventsRuleOrSqsQueueRemainsForAnyJob() {
        Template template = synthWorkflow();

        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::SQS::Queue", 0);
    }

    @Test
    void definitionRunsThreeIngestionJobsInParallelThenDataQualityThenMetricsPublishThenSucceed() {
        Template template = synthWorkflow();

        var definitionText = joinedDefinitionString(template);

        // State names appear in the definition text in the order the Chain wires them: the
        // Parallel branch's three tasks, then data quality, then metrics publish. Each state's
        // own definition is keyed as "<name>":{ - distinct from the "Next":"<name>" reference to
        // it, which appears earlier (the Parallel state's own "Next" points at "data quality
        // run" before its Branches array even starts), so indexOf on the bare name would find
        // the wrong occurrence.
        int parallelIndex = definitionText.indexOf("\"Run ingestion jobs\":{");
        int stripeIndex = definitionText.indexOf("\"Stripe reconciliation\":{");
        int ga4ReportIndex = definitionText.indexOf("\"GA4 report pull\":{");
        int ga4EventIndex = definitionText.indexOf("\"GA4 event export pull\":{");
        int dataQualityIndex = definitionText.indexOf("\"data quality run\":{");
        int metricsPublishIndex = definitionText.indexOf("\"metrics publish\":{");

        assertTrue(parallelIndex >= 0, "expected the parallel branch state");
        assertTrue(stripeIndex > parallelIndex, "Stripe task should be nested inside the parallel branch");
        assertTrue(ga4ReportIndex > parallelIndex, "GA4 report pull task should be nested inside the parallel branch");
        assertTrue(
                ga4EventIndex > parallelIndex, "GA4 event export pull task should be nested inside the parallel branch");
        assertTrue(dataQualityIndex > parallelIndex, "data quality should run after the parallel branch");
        assertTrue(metricsPublishIndex > dataQualityIndex, "metrics publish should run after data quality");

        // Exactly three LambdaInvoke tasks named as the ingestion jobs sit in the parallel
        // branch: the definition contains no fourth job's state key between the parallel
        // branch's open and the data quality task.
        var parallelBranchSlice = definitionText.substring(parallelIndex, dataQualityIndex);
        assertEquals(1, countOccurrences(parallelBranchSlice, "\"Stripe reconciliation\":{"));
        assertEquals(1, countOccurrences(parallelBranchSlice, "\"GA4 report pull\":{"));
        assertEquals(1, countOccurrences(parallelBranchSlice, "\"GA4 event export pull\":{"));

        assertTrue(definitionText.contains("\"Type\":\"Parallel\""), "expected a Parallel state");
        assertTrue(definitionText.contains("\"Type\":\"Succeed\""), "expected a Succeed state");
        assertTrue(definitionText.contains("\"End\":true"), "expected exactly one terminal state");
    }

    @Test
    void everyTaskRetriesOnTaskFailedTwiceWithSixtySecondIntervalAndBackoffTwo() {
        Template template = synthWorkflow();

        var definitionText = joinedDefinitionString(template);

        // Five tasks, one States.TaskFailed retry shape each (interval 60 is unique to this
        // retry: retryOnServiceExceptions adds its own separate retry, interval 2, for AWS
        // Lambda service errors, which every LambdaInvoke task carries in addition to this one).
        assertEquals(
                5,
                countOccurrences(
                        definitionText,
                        "\"ErrorEquals\":[\"States.TaskFailed\"],\"IntervalSeconds\":60,\"MaxAttempts\":2,\"BackoffRate\":2"),
                "expected one States.TaskFailed retry, interval 60s, 2 attempts, backoff rate 2, per task");
    }

    @Test
    void scheduleTargetsTheStateMachineWithNoFlexibleTimeWindow() {
        Template template = synthWorkflow();

        template.hasResourceProperties(
                "AWS::Scheduler::Schedule",
                Match.objectLike(Map.of(
                        "FlexibleTimeWindow", Match.objectLike(Map.of("Mode", "OFF")),
                        "Target", Match.objectLike(Map.of("Arn", Match.anyValue())))));
    }

    @Test
    void scheduleRunsDailyInProdAndWeeklyElsewhere() {
        Template ciTemplate = synthWorkflow("docs");
        ciTemplate.hasResourceProperties(
                "AWS::Scheduler::Schedule",
                Match.objectLike(Map.of("ScheduleExpression", "cron(15 2 ? * MON *)")));

        Template prodTemplate = synthWorkflow("prod");
        prodTemplate.hasResourceProperties(
                "AWS::Scheduler::Schedule",
                Match.objectLike(Map.of("ScheduleExpression", "cron(15 2 * * ? *)")));
    }

    @Test
    void executionsFailedAlarmExistsWithNoSnsActionInBothEnvironments() {
        for (String envName : List.of("docs", "prod")) {
            Template template = synthWorkflow(envName);
            template.hasResourceProperties(
                    "AWS::CloudWatch::Alarm",
                    Match.objectLike(Map.of(
                            "AlarmName",
                            "docs-env-analytics-nightly-failed",
                            "Namespace",
                            "AWS/States",
                            "MetricName",
                            "ExecutionsFailed",
                            "ComparisonOperator",
                            "GreaterThanOrEqualToThreshold",
                            "Threshold",
                            1)));

            var alarms = template.findResources(
                    "AWS::CloudWatch::Alarm",
                    Map.of("Properties", Map.of("AlarmName", "docs-env-analytics-nightly-failed")));
            for (Map<String, Object> alarm : alarms.values()) {
                @SuppressWarnings("unchecked")
                var properties = (Map<String, Object>) alarm.get("Properties");
                assertFalse(properties.containsKey("AlarmActions"), "alarm should have no SNS action");
            }
        }
    }

    @Test
    void executionsMissedAlarmExistsOnlyInProd() {
        Template ciTemplate = synthWorkflow("docs");
        assertEquals(
                0,
                ciTemplate
                        .findResources(
                                "AWS::CloudWatch::Alarm",
                                Map.of(
                                        "Properties",
                                        Map.of("AlarmName", "docs-env-analytics-nightly-missed")))
                        .size(),
                "ci's weekly cadence would false-positive the missed-execution alarm, so it is skipped");

        Template prodTemplate = synthWorkflow("prod");
        prodTemplate.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName",
                        "docs-env-analytics-nightly-missed",
                        "Namespace",
                        "AWS/States",
                        "MetricName",
                        "ExecutionsStarted",
                        "ComparisonOperator",
                        "LessThanThreshold",
                        "Threshold",
                        1,
                        "TreatMissingData",
                        "breaching")));
    }

    private static int countOccurrences(String text, String needle) {
        int count = 0;
        int index = 0;
        while ((index = text.indexOf(needle, index)) != -1) {
            count++;
            index += needle.length();
        }
        return count;
    }

    @SuppressWarnings("unchecked")
    private static String joinedDefinitionString(Template template) {
        var stateMachines = template.findResources("AWS::StepFunctions::StateMachine");
        assertEquals(1, stateMachines.size());
        var resource = stateMachines.values().iterator().next();
        var properties = (Map<String, Object>) resource.get("Properties");
        var definitionString = properties.get("DefinitionString");
        if (definitionString instanceof String s) {
            return s;
        }
        var join = (Map<String, Object>) definitionString;
        var parts = (List<Object>) join.get("Fn::Join");
        var pieces = (List<Object>) parts.get(1);
        var builder = new StringBuilder();
        for (Object piece : pieces) {
            if (piece instanceof String s) {
                builder.append(s);
            } else {
                // A token (e.g. a Lambda ARN via Fn::GetAtt): irrelevant to the state-ordering
                // assertions here, so a placeholder keeps index arithmetic well-defined without
                // needing to resolve the intrinsic.
                builder.append("<token>");
            }
        }
        return builder.toString();
    }
}
