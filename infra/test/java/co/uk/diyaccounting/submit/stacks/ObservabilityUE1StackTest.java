/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
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

class ObservabilityUE1StackTest {

    private static ObservabilityUE1Stack synthObservabilityUE1Stack() {
        return synthObservabilityUE1Stack(false);
    }

    private static ObservabilityUE1Stack synthObservabilityUE1Stack(boolean trustedEventRulesEnabled) {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new ObservabilityUE1Stack(
                app,
                "TestObservabilityUE1Stack",
                ObservabilityUE1Stack.ObservabilityUE1StackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("us-east-1")
                                .build())
                        .crossRegionReferences(false)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled("true")
                        .sharedNames(sharedNames)
                        .logGroupRetentionPeriodDays(1)
                        .baseImageTag("latest")
                        .trustedEventRulesEnabled(trustedEventRulesEnabled)
                        .build());
    }

    @Test
    void metricsSinkAdmitsTheSpreadsheetsAndGatewayAccountsForMetricsOnly() {
        Template template = Template.fromStack(synthObservabilityUE1Stack());

        template.hasResourceProperties(
                "AWS::Oam::Sink",
                Match.objectLike(Map.of(
                        "Name",
                        Match.stringLikeRegexp(".*-spreadsheets-metrics"),
                        "Policy",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Effect",
                                        "Allow",
                                        "Action",
                                        List.of("oam:CreateLink", "oam:UpdateLink"),
                                        "Condition",
                                        Map.of(
                                                "ForAllValues:StringEquals",
                                                Map.of(
                                                        "oam:ResourceTypes",
                                                        List.of("AWS::CloudWatch::Metric"))))))))))));

        // The principal's account id is asserted separately: CDK renders AccountPrincipal's ARN
        // as an Fn::Join (the partition is a pseudo-parameter, not a literal), not a plain string.
        assertTrue(template.toJSON().toString().contains("064390746177"));
        assertTrue(template.toJSON().toString().contains("283165661847"));
    }

    @Test
    void spreadsheetsRumLcpP75AlarmWatchesTheLinkedAccountsMetric() {
        Template template = Template.fromStack(synthObservabilityUE1Stack());

        assertFlooredDailyP75Alarm(template, ".*-spreadsheets-rum-lcp-p75", "WebVitalsLargestContentfulPaint", 4000);
    }

    @Test
    void spreadsheetsRumInpP75AlarmWatchesTheLinkedAccountsMetric() {
        Template template = Template.fromStack(synthObservabilityUE1Stack());

        assertFlooredDailyP75Alarm(template, ".*-spreadsheets-rum-inp-p75", "WebVitalsInteractionToNextPaint", 500);
    }

    @Test
    void spreadsheetsRumClsP75AlarmWatchesTheLinkedAccountsMetric() {
        Template template = Template.fromStack(synthObservabilityUE1Stack());

        assertFlooredDailyP75Alarm(template, ".*-spreadsheets-rum-cls-p75", "WebVitalsCumulativeLayoutShift", 0.25);
    }

    @Test
    void healthAndAcmForwardRuleExistsOnlyWhereItIsEnabled() {
        Template defaultProps = Template.fromStack(synthObservabilityUE1Stack());
        defaultProps.resourceCountIs("AWS::Events::Rule", 0);

        Template enabled = Template.fromStack(synthObservabilityUE1Stack(true));
        enabled.resourceCountIs("AWS::Events::Rule", 1);
        enabled.hasResourceProperties(
                "AWS::Events::Rule",
                Match.objectLike(Map.of(
                        "Name",
                        "docs-env-trusted-events-forward",
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
                        List.of(Match.objectLike(Map.of("Arn", Match.stringLikeRegexp(".*:event-bus/default")))))));
    }

    private static void assertFlooredDailyP75Alarm(
            Template template, String alarmNameRegex, String metricName, Number threshold) {
        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName",
                        Match.stringLikeRegexp(alarmNameRegex),
                        "Threshold",
                        threshold,
                        "EvaluationPeriods",
                        1,
                        "ComparisonOperator",
                        "GreaterThanThreshold",
                        "TreatMissingData",
                        "notBreaching",
                        "Metrics",
                        Match.arrayWith(List.of(
                                Match.objectLike(Map.of("Expression", "IF(samples >= 10, p75, 0)")),
                                linkedAccountMetric("samples", metricName, "SampleCount"),
                                linkedAccountMetric("p75", metricName, "p75"))))));
    }

    private static Object linkedAccountMetric(String id, String metricName, String statistic) {
        return Match.objectLike(Map.of(
                "Id",
                id,
                "AccountId",
                "064390746177",
                "MetricStat",
                Match.objectLike(Map.of(
                        "Metric",
                        Match.objectLike(Map.of("Namespace", "AWS/RUM", "MetricName", metricName)),
                        "Period",
                        86400,
                        "Stat",
                        statistic))));
    }
}
