/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class ScanDetectionStackTest {

    private static ScanDetectionStack synthScanDetectionStack() {
        return synthScanDetectionStack(20);
    }

    private static ScanDetectionStack synthScanDetectionStack(int threshold) {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        var props = ScanDetectionStack.ScanDetectionStackProps.builder()
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
                .scanDetection404PerMinute(threshold)
                .build();

        return new ScanDetectionStack(app, "TestScanDetectionStack", props);
    }

    @Test
    void stackHoldsOneLambdaOneScheduleAndTwoAlarms() {
        Template template = Template.fromStack(synthScanDetectionStack());

        // The job Lambda, plus the shared create-if-missing log-group provider Lambda that
        // ensureLogGroupWithDependency adds (matching IngestionStack's own count).
        template.resourceCountIs("AWS::Lambda::Function", 2);
        template.resourceCountIs("AWS::Events::Rule", 1);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 2);

        template.hasResourceProperties(
                "AWS::Lambda::Function", Match.objectLike(Map.of("FunctionName", "docs-env-scan-detect-404")));
    }

    @Test
    void lambdaHasAnExplicitLogGroup() {
        Template template = Template.fromStack(synthScanDetectionStack());
        var missing = new ArrayList<String>();
        template.findResources("AWS::Lambda::Function").forEach((id, resource) -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            @SuppressWarnings("unchecked")
            var loggingConfig = properties == null ? null : (Map<String, Object>) properties.get("LoggingConfig");
            if (loggingConfig != null && loggingConfig.containsKey("LogGroup")) return;
            missing.add(id);
        });
        assertTrue(missing.isEmpty(), "Lambda functions with no explicit log group: " + missing);
    }

    @Test
    void scheduleRunsEveryFiveMinutes() {
        Template template = Template.fromStack(synthScanDetectionStack());
        template.hasResourceProperties(
                "AWS::Events::Rule",
                Match.objectLike(Map.of(
                        "Name", "docs-env-scan-detect-404-schedule", "ScheduleExpression", "rate(5 minutes)")));
    }

    @Test
    void bothAlarmsCarryNoAlarmActions() {
        Template template = Template.fromStack(synthScanDetectionStack());
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
                        "AlarmName", "docs-env-scan-detect-404-errors",
                        "MetricName", "Errors",
                        "Threshold", 1)));
        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-scan-detect-404-missed",
                        "MetricName", "Invocations",
                        "ComparisonOperator", "LessThanThreshold",
                        "Threshold", 1)));
    }

    @Test
    void thresholdIsPassedThroughAsAnEnvironmentVariable() {
        Template template = Template.fromStack(synthScanDetectionStack(37));
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "Environment",
                        Match.objectLike(
                                Map.of("Variables", Match.objectLike(Map.of("SCAN_DETECTION_404_PER_MINUTE", "37")))))));
    }

    @Test
    void noIamStatementGrantsOnEveryResource() {
        Template template = Template.fromStack(synthScanDetectionStack());
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
                offenders.add(policy.getKey() + " " + statement.get("Action"));
            }
        }
        assertTrue(offenders.isEmpty(), "IAM statements granting on every resource: " + offenders);
    }
}
