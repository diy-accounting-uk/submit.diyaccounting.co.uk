/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

class ObservabilityStackTest {

    private static ObservabilityStack synthObservabilityStack() {
        return synthObservabilityStack(false);
    }

    private static ObservabilityStack synthObservabilityStack(boolean trustedEventRulesEnabled) {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new ObservabilityStack(
                app,
                "TestObservabilityStack",
                ObservabilityStack.ObservabilityStackProps.builder()
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
                        .cloudTrailLogGroupPrefix("")
                        .cloudTrailLogGroupRetentionPeriodDays("1")
                        .accessLogGroupRetentionPeriodDays(1)
                        .baseImageTag("latest")
                        .trustedEventRulesEnabled(trustedEventRulesEnabled)
                        .build());
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> trustedEventRoleStatements(Template template) {
        var statements = new ArrayList<Map<String, Object>>();
        for (var policy : template.findResources("AWS::IAM::Policy").values()) {
            var properties = (Map<String, Object>) policy.get("Properties");
            var roles = (List<Object>) properties.get("Roles");
            boolean attachedToTheRole =
                    roles.stream().anyMatch(role -> role.toString().contains("TrustedEventRole"));
            if (attachedToTheRole) {
                var document = (Map<String, Object>) properties.get("PolicyDocument");
                statements.addAll((List<Map<String, Object>>) document.get("Statement"));
            }
        }
        return statements;
    }

    @SuppressWarnings("unchecked")
    private static List<String> actionsOf(Map<String, Object> statement) {
        Object action = statement.get("Action");
        return action instanceof List<?> list ? (List<String>) list : List.of((String) action);
    }

    @Test
    void securityFindingsTopicAllowsCloudWatchAlarmsToPublishFromThisAccount() {
        Template template = Template.fromStack(synthObservabilityStack());

        // SecurityDetectionStack's alarms publish to this topic via SnsAction. Without this
        // policy CloudWatch Alarms gets AccessDenied on SNS:Publish, and that denial is itself an
        // AccessDenied CloudTrail event counted by the CIS unauthorized-api-calls metric, making
        // the alarm re-fire on its own failed action.
        template.hasResourceProperties(
                "AWS::SNS::TopicPolicy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Effect",
                                        "Allow",
                                        "Principal",
                                        Map.of("Service", "cloudwatch.amazonaws.com"),
                                        "Action",
                                        "sns:Publish",
                                        "Condition",
                                        Map.of(
                                                "StringEquals",
                                                Map.of("aws:SourceAccount", Map.of("Ref", "AWS::AccountId"))))))))))));
    }

    @Test
    void rumClsP75AlarmWatchesTheNeedsImprovementBoundary() {
        Template template = Template.fromStack(synthObservabilityStack());

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName",
                        Match.stringLikeRegexp(".*-rum-cls-p75"),
                        "Namespace",
                        "AWS/RUM",
                        "MetricName",
                        "WebVitalsCumulativeLayoutShift",
                        "ExtendedStatistic",
                        "p75",
                        "Threshold",
                        0.25,
                        "EvaluationPeriods",
                        2,
                        "ComparisonOperator",
                        "GreaterThanThreshold",
                        "TreatMissingData",
                        "notBreaching")));
    }

    @Test
    void createsNoCloudWatchDashboard() {
        Template template = Template.fromStack(synthObservabilityStack());

        template.resourceCountIs("AWS::CloudWatch::Dashboard", 0);
    }

    @Test
    void trustedEventFunctionRunsOneAtATimeUnderItsFixedRole() {
        Template template = Template.fromStack(synthObservabilityStack());

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        "docs-env-trusted-event-to-github-issue",
                        "ReservedConcurrentExecutions",
                        1,
                        "Timeout",
                        60,
                        "PackageType",
                        "Image")));
        template.hasResourceProperties(
                "AWS::IAM::Role", Match.objectLike(Map.of("RoleName", "docs-env-trusted-event-issue")));
        template.hasResourceProperties(
                "AWS::CloudWatch::CompositeAlarm",
                Match.objectLike(Map.of("AlarmName", Match.stringLikeRegexp(".*-obs-.*health.*"))));
    }

    @Test
    void trustedEventEnvironmentOmitsTheAppIdsUntilTheyAreSet() {
        Template template = Template.fromStack(synthObservabilityStack());

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        "docs-env-trusted-event-to-github-issue",
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "ENVIRONMENT_NAME",
                                        "docs",
                                        "TRUSTED_EVENT_GITHUB_REPO",
                                        "diy-accounting-uk/private.diyaccounting.co.uk",
                                        "TRUSTED_EVENT_LEDGER_DYNAMODB_TABLE_NAME",
                                        "docs-env-trusted-events")))))));
        var functions = template.findResources(
                "AWS::Lambda::Function",
                Map.of("Properties", Map.of("FunctionName", "docs-env-trusted-event-to-github-issue")));
        assertFalse(functions.toString().contains("GITHUB_APP_ID"));
    }

    @Test
    void trustedEventRoleReadsOnlyTheNamedResources() {
        var statements = trustedEventRoleStatements(Template.fromStack(synthObservabilityStack()));

        var byAction = new java.util.HashMap<String, Map<String, Object>>();
        for (var statement : statements) {
            for (String action : actionsOf(statement)) {
                byAction.put(action, statement);
            }
        }
        assertTrue(byAction.containsKey("secretsmanager:GetSecretValue"));
        assertTrue(byAction.containsKey("dynamodb:GetItem"));
        assertEquals(byAction.get("dynamodb:GetItem"), byAction.get("dynamodb:PutItem"));
        assertTrue(byAction.containsKey("acm:DescribeCertificate"));
        assertTrue(byAction.containsKey("logs:PutLogEvents"));
        assertFalse(byAction.containsKey("sts:AssumeRole"), "the root read role belongs to the prod reads");

        // X-Ray has no resource-level form for these two actions; CDK adds them for active tracing.
        for (var statement : statements) {
            var actions = actionsOf(statement);
            if (actions.contains("xray:PutTraceSegments")) {
                assertEquals(
                        List.of("xray:PutTelemetryRecords", "xray:PutTraceSegments"),
                        actions.stream().sorted().toList());
                continue;
            }
            assertFalse(
                    statement.get("Resource").toString().equals("*"), "unexpected wildcard resource for " + actions);
        }
    }

    @Test
    void healthAndAcmRulesExistOnlyWhereTheyAreEnabled() {
        Template defaultProps = Template.fromStack(synthObservabilityStack());
        int defaultRules = defaultProps.findResources("AWS::Events::Rule").size();
        assertEquals(
                0,
                defaultProps
                        .findResources(
                                "AWS::Events::Rule", Map.of("Properties", Map.of("Name", "docs-env-trusted-events")))
                        .size());

        Template enabled = Template.fromStack(synthObservabilityStack(true));
        assertEquals(
                defaultRules + 1, enabled.findResources("AWS::Events::Rule").size());
        enabled.hasResourceProperties(
                "AWS::Events::Rule",
                Match.objectLike(Map.of(
                        "Name",
                        "docs-env-trusted-events",
                        "EventPattern",
                        Map.of(
                                "source",
                                List.of("aws.health", "aws.acm"),
                                "detail-type",
                                List.of(
                                        "AWS Health Event",
                                        "AWS Health Abuse Event",
                                        "ACM Certificate Approaching Expiration",
                                        "ACM Certificate Expired",
                                        "ACM Certificate Renewal Action Required",
                                        "ACM Certificate Revoked")),
                        "Targets",
                        Match.arrayWith(List.of(Match.objectLike(
                                Map.of("Arn", Match.objectLike(Map.of("Fn::GetAtt", Match.anyValue())))))))));
        enabled.hasResourceProperties(
                "AWS::Lambda::Permission",
                Match.objectLike(Map.of("Action", "lambda:InvokeFunction", "Principal", "events.amazonaws.com")));
    }

    @Test
    void stackStaysUnderTheCloudFormationResourceLimit() {
        Template template = Template.fromStack(synthObservabilityStack(true));

        int resourceCount = ((Map<?, ?>) template.toJSON().get("Resources")).size();
        assertTrue(resourceCount < 450, "ObservabilityStack has " + resourceCount + " resources; the limit is 500");
    }
}
