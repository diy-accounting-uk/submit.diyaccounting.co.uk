/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.s3.Bucket;

class CostFocusIngestionTest {

    private static Template synthTemplate() {
        App app = new App();
        Stack stack = new Stack(
                app,
                "TestStack",
                StackProps.builder()
                        .env(Environment.builder()
                                .account("972912397388")
                                .region("eu-west-2")
                                .build())
                        .build());

        var lakeBucket = Bucket.fromBucketName(stack, "LakeBucket", "prod-env-analytics-lake-972912397388");

        new CostFocusIngestion(
                stack,
                CostFocusIngestion.CostFocusIngestionProps.builder()
                        .idPrefix("prod-env")
                        .focusExportBucketName("diy-accounting-cost-focus-887764105431")
                        .focusExportS3Prefix("focus")
                        .lakeBucket(lakeBucket)
                        .curatedPrefix("curated/cost/focus")
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void copyLambdaHasAFixedRoleNameCostExportStackCanTrust() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::IAM::Role", Match.objectLike(Map.of("RoleName", "prod-env-cost-focus-copy-role")));
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of("FunctionName", "prod-env-cost-focus-copy", "Handler", "index.handler")));
    }

    @Test
    void functionReadsTheExportBucketAndTheDestinationFromEnvironment() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "FOCUS_EXPORT_BUCKET_NAME",
                                        "diy-accounting-cost-focus-887764105431",
                                        "ANALYTICS_LAKE_BUCKET_NAME",
                                        "prod-env-analytics-lake-972912397388",
                                        "COST_FOCUS_CURATED_PREFIX",
                                        "curated/cost/focus")))))));
    }

    @Test
    void scheduleRunsNightlyAndTargetsTheLambda() {
        Template template = synthTemplate();

        template.resourceCountIs("AWS::Scheduler::Schedule", 1);
        template.hasResourceProperties(
                "AWS::Scheduler::Schedule", Match.objectLike(Map.of("ScheduleExpression", "cron(45 2 * * ? *)")));
    }

    @Test
    void errorsAlarmWatchesTheCopyLambda() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "prod-env-cost-focus-copy-errors",
                        "MetricName", "Errors",
                        "Namespace", "AWS/Lambda")));
    }
}
