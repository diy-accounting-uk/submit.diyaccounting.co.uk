/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
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
                                                Map.of(
                                                        "aws:SourceAccount",
                                                        Map.of("Ref", "AWS::AccountId"))))))))))));
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
}
