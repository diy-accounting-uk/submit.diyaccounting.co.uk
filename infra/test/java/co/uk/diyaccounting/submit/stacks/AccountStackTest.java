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

    private static final String SUPPORT_TOKEN_SECRET_ARN =
            "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/github/support_bot_token";

    private static AccountStack synthAccountStack(String supportGithubTokenSecretArn) {
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
        if (supportGithubTokenSecretArn != null) {
            builder.supportGithubTokenSecretArn(supportGithubTokenSecretArn);
        }
        return new AccountStack(app, "TestAccountStack", builder.build());
    }

    @Test
    @SuppressWarnings("unchecked")
    void supportTicketLambdaReadsOnlyTheSupportBotTokenSecret() {
        AccountStack stack = synthAccountStack(SUPPORT_TOKEN_SECRET_ARN);
        Template template = Template.fromStack(stack);

        var supportFunctions = template.findResources("AWS::Lambda::Function").values().stream()
                .map(resource -> (Map<String, Object>) resource.get("Properties"))
                .filter(properties -> String.valueOf(properties.get("FunctionName")).contains("support-ticket-post"))
                .toList();
        assertEquals(1, supportFunctions.size(), "expected exactly one support-ticket-post Lambda");
        var environment = (Map<String, Object>) supportFunctions.get(0).get("Environment");
        var variables = (Map<String, Object>) environment.get("Variables");
        assertEquals(SUPPORT_TOKEN_SECRET_ARN, variables.get("GITHUB_TOKEN_SECRET_ARN"));
        assertEquals("diy-accounting-uk/spreadsheets.diyaccounting.co.uk", variables.get("SUPPORT_GITHUB_REPO"));

        List<String> githubSecretResources = githubSecretReadResources(template);
        assertEquals(
                List.of(SUPPORT_TOKEN_SECRET_ARN + "-*"),
                githubSecretResources,
                "the support Lambda may read its own token and no other GitHub token");
        assertTrue(
                githubSecretResources.stream().noneMatch(resource -> resource.contains("issue_bot_token")),
                "the support Lambda must not be able to read the alarm-issue token");
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
