/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
    void stackCreatesThreeUserPoolClientsOnTheSamePool() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Cognito::UserPool", 1);
        template.resourceCountIs("AWS::Cognito::UserPoolClient", 3);
    }

    @Test
    void userPoolRequiresTotpMfaAndEnablesSoftwareTokenMfa() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        template.hasResourceProperties(
                "AWS::Cognito::UserPool",
                Match.objectLike(Map.of("MfaConfiguration", "ON", "EnabledMfas", List.of("SOFTWARE_TOKEN_MFA"))));
    }

    @Test
    void booksClientUsesTheAuthorizationCodeFlowWithNoSecretAndPreventsUserExistenceErrors() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        // Locate the books client by name rather than relying on synthesis order.
        var booksClients = template.findResources(
                "AWS::Cognito::UserPoolClient", Map.of("Properties", Map.of("AllowedOAuthFlows", List.of("code"))));
        assertEquals(3, booksClients.size(), "the books, MCP and main clients all use the authorization code grant");

        var booksClient = booksClients.values().stream()
                .filter(resource -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return String.valueOf(properties.get("ClientName")).endsWith("-diya-gl-client");
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
                "https://ci.diya-gl.co.uk/",
                "https://ci.diya-gl.co.uk/index.html",
                "https://ci.diya-gl.co.uk/bst.html",
                "https://ci.diya-gl.co.uk/se.html",
                "https://ci.diya-gl.co.uk/taxi.html",
                "https://ci.diya-gl.co.uk/ltd.html",
                "http://localhost:3001/",
                "http://localhost:3001/index.html",
                "http://localhost:3001/bst.html",
                "http://localhost:3001/se.html",
                "http://localhost:3001/taxi.html",
                "http://localhost:3001/ltd.html");

        template.hasResourceProperties(
                "AWS::Cognito::UserPoolClient",
                Match.objectLike(Map.of(
                        "ClientName",
                        Match.stringLikeRegexp(".*-diya-gl-client$"),
                        "CallbackURLs",
                        Match.arrayEquals(expectedUrls),
                        "LogoutURLs",
                        Match.arrayEquals(expectedUrls))));
    }

    @Test
    void prodBooksClientCallbackAndLogoutUrlsCoverTheDiyaGlProdAndCiHosts() {
        IdentityStack stack = synthIdentityStack("prod");
        Template template = Template.fromStack(stack);

        var expectedUrls = List.of(
                "https://diya-gl.co.uk/",
                "https://diya-gl.co.uk/index.html",
                "https://diya-gl.co.uk/bst.html",
                "https://diya-gl.co.uk/se.html",
                "https://diya-gl.co.uk/taxi.html",
                "https://diya-gl.co.uk/ltd.html",
                "https://ci.diya-gl.co.uk/",
                "https://ci.diya-gl.co.uk/index.html",
                "https://ci.diya-gl.co.uk/bst.html",
                "https://ci.diya-gl.co.uk/se.html",
                "https://ci.diya-gl.co.uk/taxi.html",
                "https://ci.diya-gl.co.uk/ltd.html");

        template.hasResourceProperties(
                "AWS::Cognito::UserPoolClient",
                Match.objectLike(Map.of(
                        "ClientName",
                        Match.stringLikeRegexp(".*-diya-gl-client$"),
                        "CallbackURLs",
                        Match.arrayEquals(expectedUrls),
                        "LogoutURLs",
                        Match.arrayEquals(expectedUrls))));
    }

    @Test
    void diyaGlSubscriptionSuiteHostsFromTheProbeWorkflowAreInTheBooksClientCallbackUrls() throws IOException {
        Set<String> hosts = diyaGlBaseUrlHostsFromProbeTestWorkflow();
        assertFalse(hosts.isEmpty(), "expected at least one DIYA_GL_BASE_URL host in probe-test.yml");

        var pages = List.of("ltd.html", "bst.html", "se.html", "taxi.html");

        Template ciTemplate = Template.fromStack(synthIdentityStack("ci"));
        Template prodTemplate = Template.fromStack(synthIdentityStack("prod"));

        for (String host : hosts) {
            boolean prodOnlyHost = "https://diya-gl.co.uk/".equals(host);
            String envName = prodOnlyHost ? "prod" : "ci";
            var callbackUrls = booksClientCallbackUrls(prodOnlyHost ? prodTemplate : ciTemplate);
            for (String page : pages) {
                String url = host + page;
                assertTrue(
                        callbackUrls.contains(url),
                        "missing " + url + " from the diya-gl-client callback urls for the " + envName
                                + " environment");
            }
        }
    }

    @Test
    void ciSubmitClientUrlsCoverTheApexAndEverySlotHost() {
        Template template = Template.fromStack(synthIdentityStack("ci"));

        var expectedCallbackUrls = List.of(
                "https://ci-submit.example.com/",
                "https://ci-submit.example.com/auth/loginWithCognitoCallback.html",
                "https://ci-set1.submit.example.com/",
                "https://ci-set1.submit.example.com/auth/loginWithCognitoCallback.html",
                "https://ci-set2.submit.example.com/",
                "https://ci-set2.submit.example.com/auth/loginWithCognitoCallback.html");
        var expectedLogoutUrls = List.of(
                "https://ci-submit.example.com/",
                "https://ci-submit.example.com/auth/signed-out.html",
                "https://ci-set1.submit.example.com/",
                "https://ci-set1.submit.example.com/auth/signed-out.html",
                "https://ci-set2.submit.example.com/",
                "https://ci-set2.submit.example.com/auth/signed-out.html");

        assertEquals(expectedCallbackUrls, submitClientUrls(template, "CallbackURLs"));
        assertEquals(expectedLogoutUrls, submitClientUrls(template, "LogoutURLs"));
    }

    @Test
    void prodSubmitClientUrlsCoverThePublicAndApexHostsOnly() {
        Template template = Template.fromStack(synthIdentityStack("prod"));

        var expectedCallbackUrls = List.of(
                "https://submit.example.com/",
                "https://submit.example.com/auth/loginWithCognitoCallback.html",
                "https://prod-submit.example.com/",
                "https://prod-submit.example.com/auth/loginWithCognitoCallback.html");
        var expectedLogoutUrls = List.of(
                "https://submit.example.com/",
                "https://submit.example.com/auth/signed-out.html",
                "https://prod-submit.example.com/",
                "https://prod-submit.example.com/auth/signed-out.html");

        assertEquals(expectedCallbackUrls, submitClientUrls(template, "CallbackURLs"));
        assertEquals(expectedLogoutUrls, submitClientUrls(template, "LogoutURLs"));
    }

    @Test
    void everyClaimableCiSlotHostIsRegisteredOnTheSubmitClient() throws IOException {
        int slotCount = claimCiSlotCountFromActionDefault();
        var callbackUrls = submitClientUrls(Template.fromStack(synthIdentityStack("ci")), "CallbackURLs");

        for (int slot = 1; slot <= slotCount; slot++) {
            String host = "https://ci-set" + slot + ".submit.example.com/";
            assertTrue(callbackUrls.contains(host), "missing " + host + " from the submit client callback urls");
        }
    }

    @Test
    void booksClientIdIsPublishedAsAStackOutputAndAnSsmParameter() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        template.hasOutput("BooksUserPoolClientId", Match.anyValue());
        template.hasOutput("DiyaGlUserPoolClientId", Match.anyValue());
        template.hasResourceProperties(
                "AWS::SSM::Parameter",
                Match.objectLike(Map.of("Name", "/submit/ci/spreadsheets-diya-gl-app-client-id")));
    }

    @Test
    void mcpClientUsesTheAuthorizationCodeFlowWithNoSecretAndPreventsUserExistenceErrors() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        // Locate the MCP client by name rather than relying on synthesis order.
        var codeFlowClients = template.findResources(
                "AWS::Cognito::UserPoolClient", Map.of("Properties", Map.of("AllowedOAuthFlows", List.of("code"))));

        var mcpClient = codeFlowClients.values().stream()
                .filter(resource -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return String.valueOf(properties.get("ClientName")).endsWith("-mcp-client");
                })
                .findFirst()
                .orElseThrow(() -> new AssertionError("no MCP client found"));

        @SuppressWarnings("unchecked")
        var properties = (Map<String, Object>) mcpClient.get("Properties");
        assertFalse((Boolean) properties.get("GenerateSecret"), "the MCP client must not generate a client secret");
        assertEquals("ENABLED", properties.get("PreventUserExistenceErrors"));
        assertEquals(List.of("code"), properties.get("AllowedOAuthFlows"));
        assertEquals(List.of("email", "openid", "profile"), properties.get("AllowedOAuthScopes"));
    }

    @Test
    void mcpClientCallbackAndLogoutUrlsCoverEveryLoopbackPortOnBothHostnames() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        var expectedUrls = new java.util.ArrayList<String>();
        for (int port = 49152; port <= 49159; port++) {
            expectedUrls.add("http://127.0.0.1:" + port + "/callback");
            expectedUrls.add("http://localhost:" + port + "/callback");
        }

        template.hasResourceProperties(
                "AWS::Cognito::UserPoolClient",
                Match.objectLike(Map.of(
                        "ClientName",
                        Match.stringLikeRegexp(".*-mcp-client$"),
                        "CallbackURLs",
                        Match.arrayEquals(expectedUrls),
                        "LogoutURLs",
                        Match.arrayEquals(expectedUrls))));
    }

    @Test
    void mcpClientIdIsPublishedAsAStackOutputAndAnSsmParameter() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        template.hasOutput("McpUserPoolClientId", Match.anyValue());
        template.hasResourceProperties(
                "AWS::SSM::Parameter", Match.objectLike(Map.of("Name", "/submit/ci/mcp-app-client-id")));
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
                "cognito-idp:AdminDeleteUser",
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminSetUserPassword",
                "cognito-idp:AdminSetUserMFAPreference",
                "cognito-idp:AssociateSoftwareToken",
                "cognito-idp:VerifySoftwareToken",
                "cognito-idp:InitiateAuth",
                "cognito-idp:RespondToAuthChallenge",
                "cognito-idp:DescribeUserPoolClient",
                "cognito-idp:UpdateUserPoolClient",
                "cloudformation:DescribeStacks",
                "dynamodb:Query",
                "dynamodb:DeleteItem",
                "dynamodb:UpdateItem",
                "secretsmanager:CreateSecret",
                "secretsmanager:PutSecretValue",
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret");

        Set<String> grantedActions = actionsGrantedToRole(template, "ci-env-spreadsheets-behaviour-role");

        assertFalse(grantedActions.isEmpty(), "expected the role to have at least one granted action");
        var unexpected = grantedActions.stream()
                .filter(action -> !allowedActions.contains(action))
                .toList();
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
        for (Map<String, Object> statement : policyStatementsForRole(template, "ci-env-spreadsheets-behaviour-role")) {
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
        for (Map<String, Object> role : template.findResources("AWS::IAM::Role").values()) {
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

    @SuppressWarnings("unchecked")
    private static List<String> booksClientCallbackUrls(Template template) {
        var booksClients = template.findResources(
                "AWS::Cognito::UserPoolClient", Map.of("Properties", Map.of("AllowedOAuthFlows", List.of("code"))));
        var booksClient = booksClients.values().stream()
                .filter(resource -> {
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return String.valueOf(properties.get("ClientName")).endsWith("-diya-gl-client");
                })
                .findFirst()
                .orElseThrow(() -> new AssertionError("no books client found"));
        var properties = (Map<String, Object>) booksClient.get("Properties");
        return (List<String>) properties.get("CallbackURLs");
    }

    @SuppressWarnings("unchecked")
    private static List<String> submitClientUrls(Template template, String propertyName) {
        var submitClient = template.findResources("AWS::Cognito::UserPoolClient").values().stream()
                .filter(resource -> {
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return !String.valueOf(properties.get("ClientName")).endsWith("-diya-gl-client");
                })
                .findFirst()
                .orElseThrow(() -> new AssertionError("no submit client found"));
        var properties = (Map<String, Object>) submitClient.get("Properties");
        return (List<String>) properties.get(propertyName);
    }

    private static int claimCiSlotCountFromActionDefault() throws IOException {
        String action = Files.readString(Path.of(".github/actions/claim-ci-slot/action.yml"));
        Matcher matcher = Pattern.compile("slot-count:.*?default: '(\\d+)'", Pattern.DOTALL)
                .matcher(action);
        assertTrue(matcher.find(), "no slot-count default found in claim-ci-slot/action.yml");
        return Integer.parseInt(matcher.group(1));
    }

    private static Set<String> diyaGlBaseUrlHostsFromProbeTestWorkflow() throws IOException {
        String workflow = Files.readString(Path.of(".github/workflows/probe-test.yml"));
        Pattern diyaGlBaseUrlLine = Pattern.compile("(?m)^.*DIYA_GL_BASE_URL:.*$");
        Pattern diyaGlHost = Pattern.compile("https://[A-Za-z0-9.-]*diya-gl\\.co\\.uk/");

        Set<String> hosts = new HashSet<>();
        Matcher lineMatcher = diyaGlBaseUrlLine.matcher(workflow);
        while (lineMatcher.find()) {
            Matcher hostMatcher = diyaGlHost.matcher(lineMatcher.group());
            while (hostMatcher.find()) {
                hosts.add(hostMatcher.group());
            }
        }
        return hosts;
    }
}
