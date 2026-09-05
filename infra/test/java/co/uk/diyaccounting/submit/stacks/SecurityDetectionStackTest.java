/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class SecurityDetectionStackTest {

    private static SecurityDetectionStack synthSecurityDetectionStack(String cloudTrailEnabled) {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new SecurityDetectionStack(
                app,
                "TestSecurityDetectionStack",
                SecurityDetectionStack.SecurityDetectionStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .cloudTrailLogGroupPrefix("")
                        .build());
    }

    @Test
    void wiresScanAndGetItemVolumeAlarmsWhenCloudTrailEnabled() {
        Template template = Template.fromStack(synthSecurityDetectionStack("true"));

        template.resourceCountIs("AWS::Logs::MetricFilter", 3);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 3);

        // The stack imports ObservabilityStack's topic by ARN rather than creating its own.
        template.resourceCountIs("AWS::SNS::Topic", 0);

        // Scan alarm: any occurrence (threshold 1, GreaterThanOrEqualToThreshold) against the
        // Submit/Security namespace's DynamoDbCustomerTableScan metric, routed to one SNS action.
        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-dynamodb-customer-table-scan",
                        "MetricName", "DynamoDbCustomerTableScan",
                        "Namespace", "Submit/Security",
                        "ComparisonOperator", "GreaterThanOrEqualToThreshold",
                        "Threshold", 1)));

        // GetItem volume alarm: > 1000 in 5 minutes, routed to one SNS action.
        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-dynamodb-customer-table-getitem-volume",
                        "MetricName", "DynamoDbCustomerTableGetItem",
                        "Namespace", "Submit/Security",
                        "ComparisonOperator", "GreaterThanThreshold",
                        "Threshold", 1000)));

        var alarms = template.findResources("AWS::CloudWatch::Alarm");
        for (Map<String, Object> alarm : alarms.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) alarm.get("Properties");
            @SuppressWarnings("unchecked")
            var alarmActions = (List<Object>) properties.get("AlarmActions");
            assertTrue(alarmActions != null && alarmActions.size() == 1, "expected exactly one SNS action: " + properties);
        }

        // Both metric filters read the same CloudTrail log group ObservabilityStack writes to.
        template.hasResourceProperties(
                "AWS::Logs::MetricFilter", Match.objectLike(Map.of("LogGroupName", "docs-env-cloud-trail")));

        // The Scan filter pattern is scoped to the five customer data tables, not every DynamoDB
        // table in the account.
        var metricFilters = template.findResources("AWS::Logs::MetricFilter");
        boolean scanFilterScopedToCustomerTables = metricFilters.values().stream().anyMatch(resource -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            var filterPattern = (String) properties.get("FilterPattern");
            return filterPattern.contains("\"Scan\"")
                    && filterPattern.contains("docs-env-receipts")
                    && filterPattern.contains("docs-env-bundles")
                    && filterPattern.contains("docs-env-passes")
                    && filterPattern.contains("docs-env-subscriptions")
                    && filterPattern.contains("docs-env-hmrc-api-requests");
        });
        assertTrue(
                scanFilterScopedToCustomerTables,
                "expected the Scan metric filter pattern to name all five customer data tables");

        // Salt secret unexpected-read alarm: any occurrence (threshold 1,
        // GreaterThanOrEqualToThreshold) against the Submit/Security namespace's
        // SaltSecretUnexpectedRead metric, routed to one SNS action.
        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-salt-secret-unexpected-read",
                        "MetricName", "SaltSecretUnexpectedRead",
                        "Namespace", "Submit/Security",
                        "ComparisonOperator", "GreaterThanOrEqualToThreshold",
                        "Threshold", 1)));

        // The salt-read filter pattern targets GetSecretValue on the salt secret and excludes
        // sessions whose role name starts with the environment name ("docs").
        boolean saltReadFilterScoped = metricFilters.values().stream().anyMatch(resource -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            var filterPattern = (String) properties.get("FilterPattern");
            return filterPattern.contains("\"GetSecretValue\"")
                    && filterPattern.contains("user-sub-hash-salt")
                    && filterPattern.contains("docs-*")
                    && filterPattern.contains("submit-docs-deployment-role");
        });
        assertTrue(saltReadFilterScoped, "expected the salt-read metric filter pattern to reference GetSecretValue,"
                + " the salt secret, the docs-* environment role prefix, and the"
                + " submit-docs-deployment-role exception");
    }

    @Test
    void skipsAlarmCreationWhenCloudTrailDisabled() {
        Template template = Template.fromStack(synthSecurityDetectionStack("false"));

        template.resourceCountIs("AWS::Logs::MetricFilter", 0);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 0);
    }
}
