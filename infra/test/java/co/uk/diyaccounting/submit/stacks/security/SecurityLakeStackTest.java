/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class SecurityLakeStackTest {

    private static SecurityLakeStack synthSecurityLakeStack(boolean securityServicesEnabled) {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new SecurityLakeStack(
                app,
                "TestSecurityLakeStack",
                SecurityLakeStack.SecurityLakeStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled("true")
                        .sharedNames(sharedNames)
                        .baseImageTag("latest")
                        .securityServicesEnabled(securityServicesEnabled)
                        .build());
    }

    @Test
    void wiresTheNightlyPipelineWhenSecurityServicesEnabled() {
        Template template = Template.fromStack(synthSecurityLakeStack(true));

        // One Glue table per source: Security Hub, GuardDuty, GitHub alerts, lifecycle, WAF,
        // rotation, and the SBOM builds sbom.yml records.
        template.resourceCountIs("AWS::Glue::Table", 7);
        template.resourceCountIs("AWS::Lambda::Function", 1);
        template.resourceCountIs("AWS::Events::Rule", 1);
        // The Lambda construct's two built-in health checks (Errors, log-error-line detection)
        // plus the dedicated lifecycle-days-remaining alarm; the composite fanning the two health
        // checks together is a separate resource type.
        template.resourceCountIs("AWS::CloudWatch::Alarm", 3);
        template.resourceCountIs("AWS::CloudWatch::CompositeAlarm", 1);
        // No SNS topic of its own - the security-findings topic is imported by ARN.
        template.resourceCountIs("AWS::SNS::Topic", 0);

        template.hasResourceProperties(
                "AWS::Events::Rule", Match.objectLike(Map.of("ScheduleExpression", "cron(20 3 * * ? *)")));

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-lifecycle-days-remaining",
                        "MetricName", "LifecycleMinDaysRemaining",
                        "Namespace", "Submit/Security",
                        "ComparisonOperator", "LessThanOrEqualToThreshold",
                        "Threshold", 60)));

        var tables = template.findResources("AWS::Glue::Table");
        var tableNames = tables.values().stream()
                .map(resource -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) resource.get("Properties");
                    @SuppressWarnings("unchecked")
                    var tableInput = (Map<String, Object>) properties.get("TableInput");
                    return (String) tableInput.get("Name");
                })
                .toList();
        assertTrue(tableNames.containsAll(java.util.List.of(
                "security_hub_findings",
                "guardduty_findings",
                "github_alerts",
                "lifecycle",
                "waf_blocks",
                "secret_rotation",
                "sbom_builds")));

        // Every Glue table uses dt partition projection, one JSON object per line.
        for (var resource : tables.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            @SuppressWarnings("unchecked")
            var tableInput = (Map<String, Object>) properties.get("TableInput");
            @SuppressWarnings("unchecked")
            var parameters = (Map<String, Object>) tableInput.get("Parameters");
            assertEquals("true", parameters.get("projection.enabled"));
            assertEquals("json", parameters.get("classification"));
        }
    }

    @Test
    void skipsThePipelineWhenSecurityServicesDisabled() {
        SecurityLakeStack stack = synthSecurityLakeStack(false);
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Glue::Table", 0);
        template.resourceCountIs("AWS::Lambda::Function", 0);
        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 0);
        assertNull(stack.tables);
    }
}
