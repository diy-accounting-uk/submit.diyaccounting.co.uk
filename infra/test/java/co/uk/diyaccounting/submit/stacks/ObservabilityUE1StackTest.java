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
                        .build());
    }

    @Test
    void spreadsheetsMetricsSinkAdmitsTheSpreadsheetsAccountForMetricsOnly() {
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
    }

}
