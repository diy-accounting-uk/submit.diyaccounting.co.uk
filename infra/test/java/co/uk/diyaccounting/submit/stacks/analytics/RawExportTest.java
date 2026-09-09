/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.s3.Bucket;

/**
 * Instantiates {@link RawExport} standalone in a throwaway stack, the way a
 * concurrently-edited {@code AnalyticsStack.java} cannot be relied on to do yet. This keeps the
 * construct's own tests independent of how (or whether) it has been wired in.
 */
class RawExportTest {

    private Template synthRawExport() {
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

        var lakeBucket = Bucket.fromBucketName(stack, "LakeBucket", sharedNames.analyticsLakeBucketName);
        var resultsBucket = Bucket.fromBucketName(stack, "ResultsBucket", sharedNames.analyticsResultsBucketName);

        var props = RawExport.RawExportProps.builder()
                .idPrefix(sharedNames.envResourceNamePrefix)
                .envName("docs")
                .baseImageTag("test-tag")
                .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                .ecrRepositoryName(sharedNames.ecrRepositoryName)
                .resultsBucket(resultsBucket)
                .lakeBucket(lakeBucket)
                .glueDatabaseName(sharedNames.glueDatabaseName)
                .athenaWorkGroupName(sharedNames.athenaWorkGroupName)
                .build();

        new RawExport(stack, props);

        return Template.fromStack(stack);
    }

    @Test
    void createsOneLambdaNoScheduleOrDlqAndOneAlarm() {
        Template template = synthRawExport();

        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::SQS::Queue", 0);
        // The function name is stable across every redeploy of this env-scoped stack, so its log
        // group goes through the idempotent AwsCustomResource path, adding a second Lambda
        // function: the shared create-if-missing/retention singleton provider.
        template.resourceCountIs("AWS::Lambda::Function", 2);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 1);

        template.hasResourceProperties(
                "AWS::Lambda::Function", Match.objectLike(Map.of("FunctionName", "docs-env-raw-export-publish")));
    }

    @Test
    void publishLambdaIsGrantedOnlyItsOwnExportsPrefix() {
        Template template = synthRawExport();

        var policies = template.findResources("AWS::IAM::Policy");
        boolean foundExportsGrant = false;
        for (Map<String, Object> policy : policies.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.get("Properties");
            @SuppressWarnings("unchecked")
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) document.get("Statement");
            for (Map<String, Object> statement : statements) {
                var action = statement.get("Action");
                if (!"s3:PutObject".equals(action)) continue;
                var resource = String.valueOf(statement.get("Resource"));
                if (resource.contains("exports")) {
                    foundExportsGrant = true;
                    assertFalse(
                            resource.contains("curated"),
                            "the export Lambda's S3 grant should not reach curated/: " + resource);
                }
            }
        }
        assertTrue(foundExportsGrant, "expected an s3:PutObject grant scoped to the exports/ prefix");
    }

    @Test
    void alarmCarriesNoSnsAction() {
        Template template = synthRawExport();

        var alarms = template.findResources("AWS::CloudWatch::Alarm");
        for (var resource : alarms.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            assertTrue(properties.get("AlarmActions") == null, "no alarm here should carry an SNS action");
        }
    }
}
