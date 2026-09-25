/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class ActivityStackTest {

    private static ActivityStack synthActivityStack() {
        App app = new App();
        SubmitSharedNames.SubmitSharedNamesProps sharedNamesProps = new SubmitSharedNames.SubmitSharedNamesProps();
        sharedNamesProps.hostedZoneName = "example.com";
        sharedNamesProps.envName = "ci";
        sharedNamesProps.subDomainName = "submit";
        sharedNamesProps.deploymentName = "ci-activitytest";
        sharedNamesProps.regionName = "eu-west-2";
        sharedNamesProps.awsAccount = "111111111111";
        SubmitSharedNames sharedNames = new SubmitSharedNames(sharedNamesProps);

        var props = ActivityStack.ActivityStackProps.builder()
                .env(Environment.builder()
                        .account("111111111111")
                        .region("eu-west-2")
                        .build())
                .crossRegionReferences(false)
                .envName("ci")
                .deploymentName("ci-activitytest")
                .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                .cloudTrailEnabled("false")
                .sharedNames(sharedNames)
                .baseImageTag("latest")
                .build();

        return new ActivityStack(app, "TestActivityStack", props);
    }

    @Test
    void stackCreatesTheTelegramForwarderAndTheSignInActivityPublishFunctions() {
        Template template = Template.fromStack(synthActivityStack());

        template.resourceCountIs("AWS::Lambda::Function", 2);
        template.hasResourceProperties(
                "AWS::Lambda::Function", Match.objectLike(Map.of("FunctionName", "ci-env-sign-in-activity-publish")));
    }

    @Test
    void signInActivityPublishReadsExactlyTheThreeAppClientIdParameters() {
        Template template = Template.fromStack(synthActivityStack());

        Set<String> expectedParameterArns = Set.of(
                "arn:aws:ssm:eu-west-2:111111111111:parameter/submit/ci/submit-app-client-id",
                "arn:aws:ssm:eu-west-2:111111111111:parameter/submit/ci/spreadsheets-diya-gl-app-client-id",
                "arn:aws:ssm:eu-west-2:111111111111:parameter/submit/ci/mcp-app-client-id");

        Set<String> grantedResources = new HashSet<>();
        for (Map<String, Object> statement : policyStatementsForFunction(template, "ci-env-sign-in-activity-publish")) {
            var action = statement.get("Action");
            boolean isSsmGetParameter = action instanceof List<?> actions
                    ? actions.stream().anyMatch(a -> "ssm:GetParameter".equals(a))
                    : "ssm:GetParameter".equals(action);
            if (!isSsmGetParameter) continue;

            var resource = statement.get("Resource");
            if (resource instanceof List<?> resources) {
                resources.forEach(r -> grantedResources.add(String.valueOf(r)));
            } else {
                grantedResources.add(String.valueOf(resource));
            }
        }

        assertEquals(expectedParameterArns, grantedResources);
    }

    @Test
    void signInActivityPublishGetsReadWriteOnTheSecurityStateTable() {
        Template template = Template.fromStack(synthActivityStack());

        Set<String> grantedActions = actionsGrantedOnResourceContaining(
                template, "ci-env-sign-in-activity-publish", "ci-env-security-state");

        assertTrue(grantedActions.contains("dynamodb:GetItem"), "expected a GetItem grant on the security state table");
        assertTrue(grantedActions.contains("dynamodb:PutItem"), "expected a PutItem grant on the security state table");
    }

    @Test
    void signInActivityPublishGetsSaltSecretAccess() {
        Template template = Template.fromStack(synthActivityStack());

        Set<String> grantedActions =
                actionsGrantedOnResourceContaining(template, "ci-env-sign-in-activity-publish", "user-sub-hash-salt");

        assertTrue(grantedActions.contains("secretsmanager:GetSecretValue"));
    }

    @Test
    void signInActivityPublishHasAnErrorsAlarm() {
        Template template = Template.fromStack(synthActivityStack());

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of("AlarmName", "check-ci-env-sign-in-activity-publish-errors")));
    }

    /**
     * The Lambda function's own {@code Role} property names its auto-created role by logical id
     * ({@code Fn::GetAtt: [<RoleLogicalId>, "Arn"]}), which is the reliable link from a function
     * to its IAM policies - unlike guessing from the logical id's naming convention.
     */
    @SuppressWarnings("unchecked")
    private static String findFunctionRoleLogicalId(Template template, String functionName) {
        for (var entry : template.findResources("AWS::Lambda::Function").entrySet()) {
            var properties = (Map<String, Object>) entry.getValue().get("Properties");
            if (!functionName.equals(properties.get("FunctionName"))) continue;
            var role = (Map<String, Object>) properties.get("Role");
            var getAtt = (List<Object>) role.get("Fn::GetAtt");
            return String.valueOf(getAtt.get(0));
        }
        throw new AssertionError("no Lambda function named " + functionName);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> policyStatementsForFunction(Template template, String functionName) {
        String roleLogicalId = findFunctionRoleLogicalId(template, functionName);
        List<Map<String, Object>> statements = new java.util.ArrayList<>();
        for (Map<String, Object> policy :
                template.findResources("AWS::IAM::Policy").values()) {
            var properties = (Map<String, Object>) policy.get("Properties");
            var roles = (List<Object>) properties.get("Roles");
            boolean belongsToFunction = roles.stream().anyMatch(r -> roleLogicalId.equals(refLogicalId(r)));
            if (!belongsToFunction) continue;

            var document = (Map<String, Object>) properties.get("PolicyDocument");
            statements.addAll((List<Map<String, Object>>) document.get("Statement"));
        }
        return statements;
    }

    private static String refLogicalId(Object roleRef) {
        if (!(roleRef instanceof Map<?, ?> ref)) return null;
        return String.valueOf(ref.get("Ref"));
    }

    @SuppressWarnings("unchecked")
    private static Set<String> actionsGrantedOnResourceContaining(
            Template template, String functionName, String resourceSubstring) {
        Set<String> actions = new HashSet<>();
        for (Map<String, Object> statement : policyStatementsForFunction(template, functionName)) {
            var resource = statement.get("Resource");
            boolean matches;
            if (resource instanceof List<?> resources) {
                matches = resources.stream().anyMatch(r -> String.valueOf(r).contains(resourceSubstring));
            } else {
                matches = String.valueOf(resource).contains(resourceSubstring);
            }
            if (!matches) continue;

            var action = statement.get("Action");
            if (action instanceof List<?> actionList) {
                actionList.forEach(a -> actions.add(String.valueOf(a)));
            } else {
                actions.add(String.valueOf(action));
            }
        }
        assertFalse(actions.isEmpty(), "expected at least one statement whose resource contains " + resourceSubstring);
        return actions;
    }
}
