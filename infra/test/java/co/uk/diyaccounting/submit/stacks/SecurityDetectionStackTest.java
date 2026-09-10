/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

        // 3 hand-written detectors (scan, GetItem volume, salt read) plus the fourteen CIS
        // CloudWatch metric filter controls.
        template.resourceCountIs("AWS::Logs::MetricFilter", 17);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 17);

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
            assertTrue(
                    alarmActions != null && alarmActions.size() == 1, "expected exactly one SNS action: " + properties);
        }

        // Both metric filters read the same CloudTrail log group ObservabilityStack writes to.
        template.hasResourceProperties(
                "AWS::Logs::MetricFilter", Match.objectLike(Map.of("LogGroupName", "docs-env-cloud-trail")));

        // The Scan filter pattern is scoped to the five customer data tables, not every DynamoDB
        // table in the account.
        var metricFilters = template.findResources("AWS::Logs::MetricFilter");
        boolean scanFilterScopedToCustomerTables = metricFilters.values().stream()
                .anyMatch(resource -> {
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
        assertTrue(
                saltReadFilterScoped,
                "expected the salt-read metric filter pattern to reference GetSecretValue,"
                        + " the salt secret, the docs-* environment role prefix, and the"
                        + " submit-docs-deployment-role exception");

        // One of the fourteen CIS CloudWatch metric filter controls, as a representative check
        // that the loop wired both the filter and the alarm through to the shared topic.
        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-cis-root-account-usage",
                        "MetricName", "CisRootAccountUsage",
                        "Namespace", "Submit/Security")));
        boolean rootUsageFilterScoped = metricFilters.values().stream().anyMatch(resource -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            var filterPattern = (String) properties.get("FilterPattern");
            return filterPattern.contains("userIdentity.type") && filterPattern.contains("Root");
        });
        assertTrue(rootUsageFilterScoped, "expected a CIS metric filter pattern matching root account usage");
    }

    @Test
    void skipsAlarmCreationWhenCloudTrailDisabled() {
        Template template = Template.fromStack(synthSecurityDetectionStack("false"));

        template.resourceCountIs("AWS::Logs::MetricFilter", 0);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 0);
    }

    @Test
    void deployCisFiltersExcludeDeployRolesWithTypeGuard() {
        Template template = Template.fromStack(synthSecurityDetectionStack("true"));
        var metricFilters = template.findResources("AWS::Logs::MetricFilter");

        // S3BucketPolicyChanges filter must include type check and deploy role exclusions.
        boolean s3FilterCorrect = metricFilters.values().stream().anyMatch(resource -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            var filterPattern = (String) properties.get("FilterPattern");
            return filterPattern.contains("PutBucketPolicy")
                    && filterPattern.contains("$.userIdentity.type != \"AssumedRole\"")
                    && filterPattern.contains("cdk-hnb659fds-*")
                    && filterPattern.contains("submit-docs-deployment-role")
                    && filterPattern.contains("submit-docs-github-actions-role");
        });
        assertTrue(
                s3FilterCorrect,
                "expected S3BucketPolicyChanges filter to include type guard and deploy role exclusions, pattern: "
                        + metricFilters.values().stream()
                                .map(r -> (String) ((Map<String, Object>) r.get("Properties")).get("FilterPattern"))
                                .filter(p -> p.contains("PutBucketPolicy"))
                                .findFirst()
                                .orElse("NOT FOUND"));

        // RootAccountUsage filter must not include sessionIssuer checks (guards accounts without
        // sessionContext).
        boolean rootFilterCorrect = metricFilters.values().stream().anyMatch(resource -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            var filterPattern = (String) properties.get("FilterPattern");
            return filterPattern.contains("userIdentity.type")
                    && filterPattern.contains("Root")
                    && !filterPattern.contains("sessionIssuer");
        });
        assertTrue(
                rootFilterCorrect,
                "expected RootAccountUsage filter to omit sessionIssuer guard (Root has no sessionContext)");
    }

    @Test
    void envWildcardExclusionAppliesOnlyToTheTwoControlsProvenNoisyFromCdkHelperRoles() {
        Template template = Template.fromStack(synthSecurityDetectionStack("true"));
        var metricFilters = template.findResources("AWS::Logs::MetricFilter");

        // CDK's per-stack helper Lambdas (e.g. the CustomS3AutoDeleteObjects custom resource
        // that empties a bucket before DESTROY) each get their own dynamically named IAM role,
        // so the deploy-role exclusion can't list them by exact name. An "<env>-*" wildcard
        // catches them, confined to the two controls it was actually written for,
        // RouteTableChanges and S3BucketPolicyChanges, so it cannot silently widen back onto
        // the other six.
        Map<String, String> eventNameByControl = Map.of(
                "UnauthorizedApiCalls", "UnauthorizedAccess",
                "IamPolicyChanges", "PutRolePolicy",
                "S3BucketPolicyChanges", "PutBucketPolicy",
                "SecurityGroupChanges", "AuthorizeSecurityGroupIngress",
                "NaclChanges", "CreateNetworkAcl",
                "NetworkGatewayChanges", "CreateCustomerGateway",
                "RouteTableChanges", "CreateRouteTable",
                "VpcChanges", "CreateVpc");
        Set<String> controlsWithEnvWildcard = Set.of("RouteTableChanges", "S3BucketPolicyChanges");

        for (var entry : eventNameByControl.entrySet()) {
            String control = entry.getKey();
            String eventName = entry.getValue();
            String pattern = metricFilters.values().stream()
                    .map(resource -> {
                        @SuppressWarnings("unchecked")
                        var properties = (Map<String, Object>) resource.get("Properties");
                        return (String) properties.get("FilterPattern");
                    })
                    .filter(p -> p.contains(eventName))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("no metric filter pattern found for " + eventName));

            boolean hasEnvWildcard = pattern.contains("sessionIssuer.userName != \"docs-*\"");
            if (controlsWithEnvWildcard.contains(control)) {
                assertTrue(
                        hasEnvWildcard,
                        control + " must exclude roles named with the docs- environment prefix, was: " + pattern);
            } else {
                assertTrue(
                        !hasEnvWildcard,
                        control + " must NOT carry the docs- environment-prefix wildcard (only"
                                + " RouteTableChanges and S3BucketPolicyChanges do), was: " + pattern);
                // Still guarded by the three exact deploy-role name patterns.
                assertTrue(
                        pattern.contains("cdk-hnb659fds-*")
                                && pattern.contains("submit-docs-deployment-role")
                                && pattern.contains("submit-docs-github-actions-role"),
                        control + " must still exclude the three exact deploy-role names, was: " + pattern);
            }
        }
    }

    @Test
    void routeTableChangesFilterIsScopedToEc2ToAvoidApiGatewaysOwnCreateRoute() {
        Template template = Template.fromStack(synthSecurityDetectionStack("true"));
        var metricFilters = template.findResources("AWS::Logs::MetricFilter");

        // API Gateway V2 has its own CreateRoute and DeleteRoute operations. Without an
        // eventSource guard, every API Gateway route a deploy creates or replaces counts as a
        // CIS route-table change.
        String pattern = metricFilters.values().stream()
                .map(resource -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return (String) properties.get("FilterPattern");
                })
                .filter(p -> p.contains("CreateRouteTable"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no metric filter pattern found for RouteTableChanges"));
        assertTrue(
                pattern.contains("$.eventSource = ec2.amazonaws.com"),
                "expected the RouteTableChanges filter pattern to scope to eventSource ec2.amazonaws.com, was: "
                        + pattern);
    }

    @Test
    void deployRoleExclusionGuardsTheWholeEventNameChainNotJustItsLastClause() {
        Template template = Template.fromStack(synthSecurityDetectionStack("true"));
        var metricFilters = template.findResources("AWS::Logs::MetricFilter");
        List<String> patterns = metricFilters.values().stream()
                .map(resource -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return (String) properties.get("FilterPattern");
                })
                .toList();

        // One distinctive event name per one of the eight controls whose deploy-role exclusion
        // is appended to the pattern. The event-name chain must be wrapped in its own
        // parentheses before the guard, so the rendered pattern starts "{ ((": otherwise "&&"
        // binds only to the chain's last clause and every earlier event name matches
        // unconditionally.
        Map<String, String> guardedControlEventNames = Map.of(
                "UnauthorizedApiCalls", "UnauthorizedAccess",
                "IamPolicyChanges", "PutRolePolicy",
                "S3BucketPolicyChanges", "PutBucketPolicy",
                "SecurityGroupChanges", "AuthorizeSecurityGroupIngress",
                "NaclChanges", "CreateNetworkAcl",
                "NetworkGatewayChanges", "CreateCustomerGateway",
                "RouteTableChanges", "CreateRouteTable",
                "VpcChanges", "CreateVpc");

        for (var entry : guardedControlEventNames.entrySet()) {
            String pattern = patterns.stream()
                    .filter(p -> p.contains(entry.getValue()))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("no metric filter pattern found for " + entry.getKey()));
            assertTrue(
                    pattern.startsWith("{ (("),
                    entry.getKey() + " pattern must wrap its event-name chain before the guard, was: " + pattern);
            assertTrue(
                    pattern.contains("cdk-hnb659fds-*"),
                    entry.getKey() + " pattern must still carry the deploy-role exclusion, was: " + pattern);
        }
    }
}
