/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.s3.Bucket;

/** Instantiates {@link ActivityEventsCompaction} standalone in a throwaway stack. */
class ActivityEventsCompactionTest {

    private Template synthCompaction() {
        var sharedNames = SubmitSharedNames.forDocs();
        App app = new App();
        Stack stack = new Stack(
                app,
                "TestStack",
                StackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .build());

        new ActivityEventsCompaction(
                stack,
                ActivityEventsCompaction.ActivityEventsCompactionProps.builder()
                        .idPrefix(sharedNames.envResourceNamePrefix)
                        .envName("ci")
                        .baseImageTag("test-tag")
                        .ecrRepositoryArn(sharedNames.ecr.ecrRepositoryArn)
                        .ecrRepositoryName(sharedNames.ecr.ecrRepositoryName)
                        .resultsBucket(Bucket.fromBucketName(
                                stack, "ResultsBucket", sharedNames.analytics.analyticsResultsBucketName))
                        .lakeBucket(Bucket.fromBucketName(
                                stack, "LakeBucket", sharedNames.analytics.analyticsLakeBucketName))
                        .glueDatabaseName(sharedNames.analytics.glueDatabaseName)
                        .athenaWorkGroupName(sharedNames.analytics.athenaWorkGroupName)
                        .build());

        return Template.fromStack(stack);
    }

    private static String policiesText(Template template) {
        return String.valueOf(template.findResources("AWS::IAM::Policy"));
    }

    @Test
    void oneNamedLambdaOneAlarmAndNoSchedule() {
        Template template = synthCompaction();

        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 1);
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        "docs-env-activity-events-compact",
                        "Timeout",
                        900,
                        "Environment",
                        Map.of(
                                "Variables",
                                Match.objectLike(Map.of("ATHENA_WORK_GROUP_NAME", "docs-env-analytics"))))));
    }

    @Test
    void theRoleHoldsNoDeleteAction() {
        var policies = policiesText(synthCompaction());

        assertFalse(policies.contains("s3:Delete"), "the compaction role must not delete: " + policies);
        assertFalse(policies.contains("glue:Delete"), "the compaction role must not delete: " + policies);
    }

    @Test
    void theRoleWritesToTheLakeOnlyUnderTheCompactedPrefix() {
        var policies = policiesText(synthCompaction());

        assertTrue(policies.contains("compacted/activity-events/*"), policies);
        assertFalse(policies.contains("s3:*"), policies);
        assertTrue(
                policies.contains("glue:UpdateTable") && policies.contains("/activity_events_lake"),
                "the view replace must name the read view: " + policies);
    }
}
