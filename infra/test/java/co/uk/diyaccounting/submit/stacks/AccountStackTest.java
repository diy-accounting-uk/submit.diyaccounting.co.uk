/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Template;

class AccountStackTest {

    private static final String TEST_GITHUB_APP_ID = "123456";
    private static final String TEST_GITHUB_APP_INSTALLATION_ID = "78901234";
    private static final String EXPECTED_PRIVATE_KEY_SECRET_ID = "docs/submit/github/ops_app_private_key";

    private static AccountStack synthAccountStack(String githubAppId) {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        var builder = AccountStack.AccountStackProps.builder()
                .env(Environment.builder()
                        .account("111111111111")
                        .region("eu-west-2")
                        .build())
                .crossRegionReferences(false)
                .envName("docs")
                .deploymentName("docs")
                .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                .cloudTrailEnabled("false")
                .sharedNames(sharedNames)
                .baseImageTag("latest")
                .cognitoUserPoolArn("arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_TestPool");
        if (githubAppId != null) {
            builder.githubAppId(githubAppId).githubAppInstallationId(TEST_GITHUB_APP_INSTALLATION_ID);
        }
        return new AccountStack(app, "TestAccountStack", builder.build());
    }

    @Test
    @SuppressWarnings("unchecked")
    void supportTicketLambdaReadsOnlyTheGithubAppPrivateKeySecret() {
        AccountStack stack = synthAccountStack(TEST_GITHUB_APP_ID);
        Template template = Template.fromStack(stack);

        var supportFunctions = template.findResources("AWS::Lambda::Function").values().stream()
                .map(resource -> (Map<String, Object>) resource.get("Properties"))
                .filter(properties -> String.valueOf(properties.get("FunctionName")).contains("support-ticket-post"))
                .toList();
        assertEquals(1, supportFunctions.size(), "expected exactly one support-ticket-post Lambda");
        var environment = (Map<String, Object>) supportFunctions.get(0).get("Environment");
        var variables = (Map<String, Object>) environment.get("Variables");
        assertEquals(TEST_GITHUB_APP_ID, variables.get("GITHUB_APP_ID"));
        assertEquals(TEST_GITHUB_APP_INSTALLATION_ID, variables.get("GITHUB_APP_INSTALLATION_ID"));
        assertEquals(EXPECTED_PRIVATE_KEY_SECRET_ID, variables.get("GITHUB_APP_PRIVATE_KEY_SECRET_ID"));
        assertEquals("diy-accounting-uk/spreadsheets.diyaccounting.co.uk", variables.get("SUPPORT_GITHUB_REPO"));

        List<String> githubSecretResources = githubSecretReadResources(template);
        assertEquals(
                List.of("arn:aws:secretsmanager:eu-west-2:111111111111:secret:" + EXPECTED_PRIVATE_KEY_SECRET_ID + "-*"),
                githubSecretResources,
                "the support Lambda may read only the diya-ops App's private key");
    }

    @Test
    void noSupportTicketLambdaWithoutItsToken() {
        AccountStack stack = synthAccountStack(null);
        Template template = Template.fromStack(stack);

        assertNull(stack.supportTicketPostLambda);
        var supportFunctions = template.findResources("AWS::Lambda::Function").values().stream()
                .map(resource -> (Map<?, ?>) resource.get("Properties"))
                .filter(properties -> String.valueOf(properties.get("FunctionName")).contains("support-ticket-post"))
                .toList();
        assertEquals(List.of(), supportFunctions);
        assertEquals(List.of(), githubSecretReadResources(template));
    }

    @Test
    @SuppressWarnings("unchecked")
    void operatorSnapshotGetLambdaCanReadSaltSecret() {
        AccountStack stack = synthAccountStack(null);
        Template template = Template.fromStack(stack);

        var snapshotGetFunctions = template.findResources("AWS::Lambda::Function").values().stream()
                .map(resource -> (Map<String, Object>) resource.get("Properties"))
                .filter(properties -> String.valueOf(properties.get("FunctionName")).contains("operator-snapshot-get"))
                .toList();
        assertEquals(1, snapshotGetFunctions.size(), "expected exactly one operator-snapshot-get Lambda");
        var roleRef = (Map<String, Object>) snapshotGetFunctions.get(0).get("Role");
        var roleLogicalId = String.valueOf(((List<Object>) roleRef.get("Fn::GetAtt")).get(0));

        var saltSecretReadResources = template.findResources("AWS::IAM::Policy").values().stream()
                .map(policy -> (Map<String, Object>) policy.get("Properties"))
                .filter(properties -> ((List<Map<String, Object>>) properties.get("Roles")).stream()
                        .anyMatch(role -> roleLogicalId.equals(String.valueOf(role.get("Ref")))))
                .map(properties -> (Map<String, Object>) properties.get("PolicyDocument"))
                .flatMap(document -> ((List<Map<String, Object>>) document.get("Statement")).stream())
                .filter(statement -> String.valueOf(statement.get("Action")).contains("secretsmanager:GetSecretValue"))
                .map(statement -> statement.get("Resource"))
                .flatMap(resource -> resource instanceof List<?> list
                        ? list.stream().map(String::valueOf)
                        : Stream.of(String.valueOf(resource)))
                .filter(resource -> resource.contains("/submit/user-sub-hash-salt"))
                .toList();
        assertEquals(
                1,
                saltSecretReadResources.size(),
                "the operator snapshot GET Lambda's own role must be able to read the user-sub-hash-salt secret");
    }

    // Every Secrets Manager read this stack grants on a GitHub token; the salt and email-hash
    // secret grants the bundle Lambdas carry are not GitHub tokens and are left out.
    @SuppressWarnings("unchecked")
    private static List<String> githubSecretReadResources(Template template) {
        return template.findResources("AWS::IAM::Policy").values().stream()
                .map(policy -> (Map<String, Object>) policy.get("Properties"))
                .map(properties -> (Map<String, Object>) properties.get("PolicyDocument"))
                .flatMap(document -> ((List<Map<String, Object>>) document.get("Statement")).stream())
                .filter(statement -> String.valueOf(statement.get("Action")).contains("secretsmanager:GetSecretValue"))
                .map(statement -> statement.get("Resource"))
                .flatMap(resource -> resource instanceof List<?> list
                        ? list.stream().map(String::valueOf)
                        : Stream.of(String.valueOf(resource)))
                .filter(resource -> resource.contains("/submit/github/"))
                .toList();
    }
}
