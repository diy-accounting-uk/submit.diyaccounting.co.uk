/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

/** Instantiates {@link PassFiguresPublish} standalone in a throwaway stack. */
class PassFiguresPublishTest {

    private Template synthPassFiguresPublish(String envName) {
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

        var lakeBucket = Bucket.fromBucketName(stack, "LakeBucket", sharedNames.analytics.analyticsLakeBucketName);
        var resultsBucket =
                Bucket.fromBucketName(stack, "ResultsBucket", sharedNames.analytics.analyticsResultsBucketName);

        new PassFiguresPublish(
                stack,
                PassFiguresPublish.PassFiguresPublishProps.builder()
                        .idPrefix(sharedNames.envResourceNamePrefix)
                        .envName(envName)
                        .baseImageTag("test-tag")
                        .ecrRepositoryArn(sharedNames.ecr.ecrRepositoryArn)
                        .ecrRepositoryName(sharedNames.ecr.ecrRepositoryName)
                        .resultsBucket(resultsBucket)
                        .lakeBucket(lakeBucket)
                        .passesTableName(sharedNames.data.passesTableName)
                        .glueDatabaseName(sharedNames.analytics.glueDatabaseName)
                        .athenaWorkGroupName(sharedNames.analytics.athenaWorkGroupName)
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void oneNamedLambdaOneAlarmAndNoScheduleInProdAndCi() {
        for (var envName : List.of("prod", "ci")) {
            Template template = synthPassFiguresPublish(envName);
            template.resourceCountIs("AWS::Lambda::Function", 2);
            template.resourceCountIs("AWS::Events::Rule", 0);
            template.resourceCountIs("AWS::CloudWatch::Alarm", 1);
            template.hasResourceProperties(
                    "AWS::Lambda::Function",
                    Match.objectLike(Map.of(
                            "FunctionName",
                            "docs-env-pass-figures-publish",
                            "Environment",
                            Map.of(
                                    "Variables",
                                    Match.objectLike(Map.of("PASSES_DYNAMODB_TABLE_NAME", "docs-env-passes"))))));
        }
    }

    @Test
    void lambdaReadsAndWritesItemsByKeyAndNeverQueriesOrScansTheTable() {
        var policies = synthPassFiguresPublish("prod").findResources("AWS::IAM::Policy");
        var dynamoActions = new java.util.ArrayList<String>();
        for (Map<String, Object> policy : policies.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.get("Properties");
            @SuppressWarnings("unchecked")
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) document.get("Statement");
            for (Map<String, Object> statement : statements) {
                var action = statement.get("Action");
                var actions = action instanceof List<?> list ? list : List.of(action);
                for (Object each : actions) {
                    if (String.valueOf(each).startsWith("dynamodb:")) {
                        dynamoActions.add(String.valueOf(each));
                    }
                }
            }
        }
        assertEquals(List.of("dynamodb:BatchGetItem", "dynamodb:PutItem"), dynamoActions);
        assertFalse(dynamoActions.contains("dynamodb:Scan"));
        assertTrue(dynamoActions.stream().noneMatch(a -> a.contains("Query")));
    }
}
