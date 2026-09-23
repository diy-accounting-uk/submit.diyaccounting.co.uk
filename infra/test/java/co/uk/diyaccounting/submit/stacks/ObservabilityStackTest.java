/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class ObservabilityStackTest {

    private static ObservabilityStack synthObservabilityStack() {
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
                        .build());
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
    void dashboardGraphsSpreadsheetsRumLcpCrossAccountAndCrossRegion()
            throws com.fasterxml.jackson.core.JsonProcessingException {
        Template template = Template.fromStack(synthObservabilityStack());

        Map<String, Object> dashboardResource = template.findResources("AWS::CloudWatch::Dashboard")
                .values()
                .iterator()
                .next();
        @SuppressWarnings("unchecked")
        Map<String, Object> dashboardProperties = (Map<String, Object>) dashboardResource.get("Properties");
        // DashboardBody is not a plain string here: it embeds other widgets' unresolved tokens
        // (the live-deployment SSM lookup), so CDK renders the whole property as an Fn::Join.
        // Serializing that structure back to JSON still surfaces every literal substring in it.
        String dashboardBodyJson = new ObjectMapper().writeValueAsString(dashboardProperties.get("DashboardBody"));

        // The widget's metric definition carries the spreadsheets account and its RUM app
        // monitor's Region so it renders even though this dashboard's own stack is eu-west-2.
        assertTrue(dashboardBodyJson.contains("Spreadsheets RUM p75 LCP (ms)"));
        assertTrue(dashboardBodyJson.contains("WebVitalsLargestContentfulPaint"));
        assertTrue(dashboardBodyJson.contains("064390746177"));
        assertTrue(dashboardBodyJson.contains("us-east-1"));
    }

    @Test
    void dashboardGraphsGatewayRumWebVitalsCrossAccountAndCrossRegion()
            throws com.fasterxml.jackson.core.JsonProcessingException {
        Template template = Template.fromStack(synthObservabilityStack());

        Map<String, Object> dashboardResource = template.findResources("AWS::CloudWatch::Dashboard")
                .values()
                .iterator()
                .next();
        @SuppressWarnings("unchecked")
        Map<String, Object> dashboardProperties = (Map<String, Object>) dashboardResource.get("Properties");
        // DashboardBody is not a plain string here: it embeds other widgets' unresolved tokens
        // (the live-deployment SSM lookup), so CDK renders the whole property as an Fn::Join.
        // Serializing that structure back to JSON still surfaces every literal substring in it.
        String dashboardBodyJson = new ObjectMapper().writeValueAsString(dashboardProperties.get("DashboardBody"));

        // The widgets' metric definitions carry the gateway account and its RUM app
        // monitor's Region so they render even though this dashboard's own stack is eu-west-2.
        assertTrue(dashboardBodyJson.contains("Gateway RUM p75 LCP (ms)"));
        assertTrue(dashboardBodyJson.contains("Gateway RUM p75 INP (ms)"));
        assertTrue(dashboardBodyJson.contains("Gateway RUM p75 CLS"));
        assertTrue(dashboardBodyJson.contains("WebVitalsLargestContentfulPaint"));
        assertTrue(dashboardBodyJson.contains("WebVitalsInteractionToNextPaint"));
        assertTrue(dashboardBodyJson.contains("WebVitalsCumulativeLayoutShift"));
        assertTrue(dashboardBodyJson.contains("283165661847"));
        assertTrue(dashboardBodyJson.contains("us-east-1"));
    }
}
