/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
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

class IdentityStackTest {

    private static final String CERTIFICATE_ARN =
            "arn:aws:acm:eu-west-2:111111111111:certificate/12345678-1234-1234-1234-123456789012";

    private static final String GOOGLE_CLIENT_SECRET_ARN =
            "arn:aws:secretsmanager:eu-west-2:111111111111:secret:test/google-client-secret";

    private static IdentityStack synthIdentityStack(String envName) {
        App app = new App();
        SubmitSharedNames.SubmitSharedNamesProps sharedNamesProps = new SubmitSharedNames.SubmitSharedNamesProps();
        sharedNamesProps.hostedZoneName = "example.com";
        sharedNamesProps.envName = envName;
        sharedNamesProps.subDomainName = "submit";
        sharedNamesProps.deploymentName = envName + "-identitytest";
        sharedNamesProps.regionName = "eu-west-2";
        sharedNamesProps.awsAccount = "111111111111";
        SubmitSharedNames sharedNames = new SubmitSharedNames(sharedNamesProps);

        var props = IdentityStack.IdentityStackProps.builder()
                .env(Environment.builder()
                        .account("111111111111")
                        .region("eu-west-2")
                        .build())
                .crossRegionReferences(false)
                .envName(envName)
                .deploymentName(envName + "-identitytest")
                .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                .cloudTrailEnabled("false")
                .sharedNames(sharedNames)
                .hostedZoneName("example.com")
                .hostedZoneId("Z1234567890")
                .certificateArn(CERTIFICATE_ARN)
                .googleClientId("test-google-client-id")
                .googleClientSecretArn(GOOGLE_CLIENT_SECRET_ARN)
                .build();

        return new IdentityStack(app, "TestIdentityStack", props);
    }

    @Test
    void stackCreatesTwoUserPoolClientsOnTheSamePool() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Cognito::UserPool", 1);
        template.resourceCountIs("AWS::Cognito::UserPoolClient", 2);
    }

    @Test
    void booksClientUsesTheAuthorizationCodeFlowWithNoSecretAndPreventsUserExistenceErrors() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        // Locate the books client by name rather than relying on synthesis order.
        var booksClients = template.findResources(
                "AWS::Cognito::UserPoolClient",
                Map.of("Properties", Map.of("AllowedOAuthFlows", List.of("code"))));
        assertEquals(2, booksClients.size(), "both clients use the authorization code grant");

        var booksClient = booksClients.values().stream()
                .filter(resource -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return String.valueOf(properties.get("ClientName")).endsWith("-books-client");
                })
                .findFirst()
                .orElseThrow(() -> new AssertionError("no books client found"));

        @SuppressWarnings("unchecked")
        var properties = (Map<String, Object>) booksClient.get("Properties");
        assertFalse((Boolean) properties.get("GenerateSecret"), "the books client must not generate a client secret");
        assertEquals("ENABLED", properties.get("PreventUserExistenceErrors"));
        assertEquals(List.of("code"), properties.get("AllowedOAuthFlows"));
        assertEquals(List.of("email", "openid", "profile"), properties.get("AllowedOAuthScopes"));
        assertEquals(List.of("Google"), properties.get("SupportedIdentityProviders"));
    }

    @Test
    void ciBooksClientCallbackAndLogoutUrlsCoverTheCiHostAndLocalhost() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        var expectedUrls = List.of(
                "https://ci-spreadsheets.diyaccounting.co.uk/books/",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/bst.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/se.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/taxi.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/ltd.html",
                "http://localhost:3000/books/",
                "http://localhost:3000/books/bst.html",
                "http://localhost:3000/books/se.html",
                "http://localhost:3000/books/taxi.html",
                "http://localhost:3000/books/ltd.html");

        template.hasResourceProperties(
                "AWS::Cognito::UserPoolClient",
                Match.objectLike(Map.of(
                        "ClientName",
                        Match.stringLikeRegexp(".*-books-client$"),
                        "CallbackURLs",
                        Match.arrayEquals(expectedUrls),
                        "LogoutURLs",
                        Match.arrayEquals(expectedUrls))));
    }

    @Test
    void prodBooksClientCallbackAndLogoutUrlsCoverTheProdAndCiSpreadsheetsHosts() {
        IdentityStack stack = synthIdentityStack("prod");
        Template template = Template.fromStack(stack);

        var expectedUrls = List.of(
                "https://spreadsheets.diyaccounting.co.uk/books/",
                "https://spreadsheets.diyaccounting.co.uk/books/bst.html",
                "https://spreadsheets.diyaccounting.co.uk/books/se.html",
                "https://spreadsheets.diyaccounting.co.uk/books/taxi.html",
                "https://spreadsheets.diyaccounting.co.uk/books/ltd.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/bst.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/se.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/taxi.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/ltd.html");

        template.hasResourceProperties(
                "AWS::Cognito::UserPoolClient",
                Match.objectLike(Map.of(
                        "ClientName",
                        Match.stringLikeRegexp(".*-books-client$"),
                        "CallbackURLs",
                        Match.arrayEquals(expectedUrls),
                        "LogoutURLs",
                        Match.arrayEquals(expectedUrls))));
    }

    @Test
    void booksClientIdIsPublishedAsAStackOutputAndAnSsmParameter() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        template.hasOutput("BooksUserPoolClientId", Match.anyValue());
        template.hasResourceProperties(
                "AWS::SSM::Parameter",
                Match.objectLike(Map.of("Name", "/submit/ci/spreadsheets-books-app-client-id")));
    }

    @Test
    void spreadsheetsBehaviourRoleNameIsFixedPerEnvironment() {
        Template ciTemplate = Template.fromStack(synthIdentityStack("ci"));
        ciTemplate.hasResourceProperties(
                "AWS::IAM::Role", Match.objectLike(Map.of("RoleName", "ci-env-spreadsheets-behaviour-role")));

        Template prodTemplate = Template.fromStack(synthIdentityStack("prod"));
        prodTemplate.hasResourceProperties(
                "AWS::IAM::Role", Match.objectLike(Map.of("RoleName", "prod-env-spreadsheets-behaviour-role")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void spreadsheetsBehaviourRoleTrustsOnlyTheSpreadsheetsRepositoryViaGithubOidc() {
        Template template = Template.fromStack(synthIdentityStack("ci"));

        var role = findRoleProperties(template, "ci-env-spreadsheets-behaviour-role");
        var assumeRolePolicy = (Map<String, Object>) role.get("AssumeRolePolicyDocument");
        var statements = (List<Map<String, Object>>) assumeRolePolicy.get("Statement");
        assertEquals(1, statements.size(), "expected a single trust statement");

        var statement = statements.get(0);
        var principal = (Map<String, Object>) statement.get("Principal");
        var federated = String.valueOf(principal.get("Federated"));
        assertTrue(
                federated.endsWith(":oidc-provider/token.actions.githubusercontent.com"),
                "expected the existing GitHub OIDC provider referenced by ARN, got " + federated);

        var condition = (Map<String, Object>) statement.get("Condition");
        var stringEquals = (Map<String, Object>) condition.get("StringEquals");
        assertEquals("sts.amazonaws.com", stringEquals.get("token.actions.githubusercontent.com:aud"));

        var stringLike = (Map<String, Object>) condition.get("StringLike");
        assertEquals(
                "repo:diy-accounting-uk/spreadsheets.diyaccounting.co.uk:*",
                stringLike.get("token.actions.githubusercontent.com:sub"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void spreadsheetsBehaviourRoleGrantsNoActionOutsideTheApprovedList() {
        Template template = Template.fromStack(synthIdentityStack("ci"));

        Set<String> allowedActions = Set.of(
                "cognito-idp:AdminCreateUser",
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminSetUserPassword",
                "cognito-idp:AdminSetUserMFAPreference",
                "cognito-idp:AssociateSoftwareToken",
                "cognito-idp:VerifySoftwareToken",
                "cognito-idp:InitiateAuth",
                "cognito-idp:DescribeUserPoolClient",
                "cognito-idp:UpdateUserPoolClient",
                "cloudformation:DescribeStacks",
                "dynamodb:Query",
                "dynamodb:DeleteItem",
                "dynamodb:UpdateItem");

        Set<String> grantedActions = actionsGrantedToRole(template, "ci-env-spreadsheets-behaviour-role");

        assertFalse(grantedActions.isEmpty(), "expected the role to have at least one granted action");
        var unexpected =
                grantedActions.stream().filter(action -> !allowedActions.contains(action)).toList();
        assertTrue(unexpected.isEmpty(), "granted actions outside the approved list: " + unexpected);
    }

    @Test
    @SuppressWarnings("unchecked")
    void spreadsheetsBehaviourRoleDynamoDbGrantsCoverExactlyTheEightPurgedTables() {
        Template template = Template.fromStack(synthIdentityStack("ci"));

        Set<String> expectedTableArns = Set.of(
                "arn:aws:dynamodb:eu-west-2:111111111111:table/ci-env-receipts",
                "arn:aws:dynamodb:eu-west-2:111111111111:table/ci-env-bundles",
                "arn:aws:dynamodb:eu-west-2:111111111111:table/ci-env-hmrc-api-requests",
                "arn:aws:dynamodb:eu-west-2:111111111111:table/ci-env-bundle-post-async-requests",
                "arn:aws:dynamodb:eu-west-2:111111111111:table/ci-env-bundle-delete-async-requests",
                "arn:aws:dynamodb:eu-west-2:111111111111:table/ci-env-hmrc-vat-return-post-async-requests",
                "arn:aws:dynamodb:eu-west-2:111111111111:table/ci-env-hmrc-vat-return-get-async-requests",
                "arn:aws:dynamodb:eu-west-2:111111111111:table/ci-env-hmrc-vat-obligation-get-async-requests");

        Set<String> grantedResources = new HashSet<>();
        for (Map<String, Object> statement :
                policyStatementsForRole(template, "ci-env-spreadsheets-behaviour-role")) {
            var action = statement.get("Action");
            boolean isDynamoDbStatement = action instanceof List<?> actions
                    ? actions.stream().anyMatch(a -> String.valueOf(a).startsWith("dynamodb:"))
                    : String.valueOf(action).startsWith("dynamodb:");
            if (!isDynamoDbStatement) continue;

            var resource = statement.get("Resource");
            if (resource instanceof List<?> resources) {
                resources.forEach(r -> grantedResources.add(String.valueOf(r)));
            } else {
                grantedResources.add(String.valueOf(resource));
            }
        }

        assertEquals(expectedTableArns, grantedResources);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> findRoleProperties(Template template, String roleName) {
        for (Map<String, Object> role :
                template.findResources("AWS::IAM::Role").values()) {
            var properties = (Map<String, Object>) role.get("Properties");
            if (roleName.equals(properties.get("RoleName"))) {
                return properties;
            }
        }
        throw new AssertionError("no IAM role named " + roleName);
    }

    @SuppressWarnings("unchecked")
    private static String findRoleLogicalId(Template template, String roleName) {
        for (var entry : template.findResources("AWS::IAM::Role").entrySet()) {
            var properties = (Map<String, Object>) entry.getValue().get("Properties");
            if (roleName.equals(properties.get("RoleName"))) {
                return entry.getKey();
            }
        }
        throw new AssertionError("no IAM role named " + roleName);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> policyStatementsForRole(Template template, String roleName) {
        String roleLogicalId = findRoleLogicalId(template, roleName);
        List<Map<String, Object>> statements = new java.util.ArrayList<>();
        for (Map<String, Object> policy :
                template.findResources("AWS::IAM::Policy").values()) {
            var properties = (Map<String, Object>) policy.get("Properties");
            var roles = (List<Object>) properties.get("Roles");
            boolean belongsToRole = roles.stream()
                    .map(r -> (Map<String, Object>) r)
                    .anyMatch(ref -> roleLogicalId.equals(ref.get("Ref")));
            if (!belongsToRole) continue;

            var document = (Map<String, Object>) properties.get("PolicyDocument");
            statements.addAll((List<Map<String, Object>>) document.get("Statement"));
        }
        return statements;
    }

    @SuppressWarnings("unchecked")
    private static Set<String> actionsGrantedToRole(Template template, String roleName) {
        Set<String> grantedActions = new HashSet<>();
        for (Map<String, Object> statement : policyStatementsForRole(template, roleName)) {
            var action = statement.get("Action");
            if (action instanceof List<?> actions) {
                actions.forEach(a -> grantedActions.add(String.valueOf(a)));
            } else {
                grantedActions.add(String.valueOf(action));
            }
        }
        return grantedActions;
    }
}
