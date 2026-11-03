/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

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
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.s3.Bucket;

/** Instantiates {@link ConsoleCapturePublish} standalone in a throwaway stack. */
class ConsoleCapturePublishTest {

    private Template synth(String envName) {
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
        new ConsoleCapturePublish(
                stack,
                ConsoleCapturePublish.ConsoleCapturePublishProps.builder()
                        .idPrefix(envName + "-env")
                        .envName(envName)
                        .baseImageTag("test-tag")
                        .ecrRepositoryArn(sharedNames.ecr.ecrRepositoryArn)
                        .ecrRepositoryName(sharedNames.ecr.ecrRepositoryName)
                        .lakeBucket(lakeBucket)
                        .build());
        return Template.fromStack(stack);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> statementsOfRole(Template template, String roleName) {
        var statements = new ArrayList<Map<String, Object>>();
        for (Map<String, Object> policy :
                template.findResources("AWS::IAM::Policy").values()) {
            var properties = (Map<String, Object>) policy.get("Properties");
            var roles = (List<Object>) properties.get("Roles");
            var attached = roles.stream().anyMatch(role -> String.valueOf(role).contains(roleName));
            if (attached) {
                var document = (Map<String, Object>) properties.get("PolicyDocument");
                statements.addAll((List<Map<String, Object>>) document.get("Statement"));
            }
        }
        return statements;
    }

    private static List<String> actionsOf(List<Map<String, Object>> statements) {
        var actions = new ArrayList<String>();
        for (Map<String, Object> statement : statements) {
            var action = statement.get("Action");
            if (action instanceof List<?> list) {
                list.forEach(each -> actions.add(String.valueOf(each)));
            } else {
                actions.add(String.valueOf(action));
            }
        }
        return actions;
    }

    @Test
    void oneNamedLambdaRunningOnTheExplicitlyNamedRoleAndAnErrorsAlarm() {
        Template template = synth("prod");

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of("FunctionName", "prod-env-console-capture-publish", "Timeout", 300)));
        template.hasResourceProperties(
                "AWS::IAM::Role", Match.objectLike(Map.of("RoleName", "prod-env-console-capture")));
        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 1);
    }

    @Test
    void prodExecutionRoleReadsOnlyAndMayAssumeTheThreeReadRoles() {
        var statements = statementsOfRole(synth("prod"), "ConsoleCapturePublish");
        var actions = actionsOfStatements(statements);

        assertTrue(actions.contains("cloudwatch:GetMetricWidgetImage"));
        assertTrue(actions.contains("cloudwatch:DescribeAlarms"));
        assertTrue(actions.contains("logs:StartQuery"));
        assertTrue(actions.contains("xray:GetServiceGraph"));
        assertTrue(actions.contains("s3:PutObject"));
        assertTrue(actions.contains("sts:AssumeRole"));
        assertTrue(
                actions.stream()
                        .noneMatch(action -> action.startsWith("dynamodb:") || action.startsWith("secretsmanager:")),
                "the capture reads no table and no secret: " + actions);
        var assume = statements.stream()
                .filter(statement -> "sts:AssumeRole".equals(String.valueOf(statement.get("Action"))))
                .findFirst()
                .orElseThrow();
        assertTrue(String.valueOf(assume.get("Resource"))
                .contains("arn:aws:iam::367191799875:role/ci-env-console-capture-read"));
        assertTrue(String.valueOf(assume.get("Resource"))
                .contains("arn:aws:iam::064390746177:role/spreadsheets-console-capture-read"));
        assertTrue(String.valueOf(assume.get("Resource"))
                .contains("arn:aws:iam::283165661847:role/gateway-console-capture-read"));
    }

    @Test
    void prodLambdaCarriesTheRoleArnsAndTheExternalId() {
        synth("prod")
                .hasResourceProperties(
                        "AWS::Lambda::Function",
                        Match.objectLike(Map.of(
                                "Environment",
                                Map.of(
                                        "Variables",
                                        Match.objectLike(Map.of(
                                                "ENVIRONMENT_NAME",
                                                "prod",
                                                "CONSOLE_CAPTURE_EXTERNAL_ID",
                                                "submit-console-capture",
                                                "CONSOLE_CAPTURE_ROLE_ARNS",
                                                Match.stringLikeRegexp("spreadsheets-console-capture-read")))))));
    }

    @Test
    void ciExecutionRoleNeverAssumesAnotherRoleAndHoldsNoRoleArns() {
        var template = synth("ci");
        var actions = actionsOfStatements(statementsOfRole(template, "ConsoleCapturePublish"));

        assertFalse(actions.contains("sts:AssumeRole"), "ci reads ci only: " + actions);
        var functions = template.findResources("AWS::Lambda::Function");
        assertFalse(functions.toString().contains("CONSOLE_CAPTURE_ROLE_ARNS"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void ciCreatesTheReadRoleTrustingTheProdAccountOnlyWithTheExternalIdAndTheProdRole() {
        var template = synth("ci");

        var roles = template.findResources(
                "AWS::IAM::Role",
                Match.objectLike(Map.of("Properties", Map.of("RoleName", "ci-env-console-capture-read"))));
        assertEquals(1, roles.size());
        var properties = (Map<String, Object>) roles.values().iterator().next().get("Properties");
        assertEquals(3600, properties.get("MaxSessionDuration"));
        var trust = String.valueOf(properties.get("AssumeRolePolicyDocument"));
        assertTrue(trust.contains("972912397388"), trust);
        assertTrue(trust.contains("sts:ExternalId=submit-console-capture"), trust);
        assertTrue(trust.contains("aws:PrincipalArn=arn:aws:iam::972912397388:role/prod-env-console-capture"), trust);
        var readActions = actionsOfStatements(statementsOfRole(template, "ConsoleCaptureRead"));
        assertTrue(readActions.contains("cloudwatch:GetMetricWidgetImage"));
        assertTrue(readActions.stream().noneMatch(action -> action.startsWith("s3:") || action.startsWith("sts:")));
    }

    @Test
    void prodCreatesNoReadRole() {
        synth("prod").resourceCountIs("AWS::IAM::Role", 2);
        assertEquals(
                0,
                synth("prod")
                        .findResources(
                                "AWS::IAM::Role",
                                Match.objectLike(
                                        Map.of("Properties", Map.of("RoleName", "prod-env-console-capture-read"))))
                        .size());
    }

    private static List<String> actionsOfStatements(List<Map<String, Object>> statements) {
        return actionsOf(statements);
    }
}
