/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

class McpStackTest {

    private static final String USER_POOL_ID = "eu-west-2_TestPool";
    private static final String MCP_CLIENT_ID = "mcp-test-client-id";
    private static final String HMRC_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/hmrc-client-secret";
    private static final String HMRC_SANDBOX_SECRET_ARN =
            "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/hmrc-sandbox-client-secret";

    private static McpStack synthMcpStack() {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new McpStack(
                app,
                "TestMcpStack",
                McpStack.McpStackProps.builder()
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
                        .cognitoUserPoolId(USER_POOL_ID)
                        .mcpUserPoolClientId(MCP_CLIENT_ID)
                        .hmrcBaseUri("https://api.service.hmrc.gov.uk")
                        .hmrcClientId("hmrc-live-client")
                        .hmrcClientSecretArn(HMRC_SECRET_ARN)
                        .hmrcSandboxBaseUri("https://test-api.service.hmrc.gov.uk")
                        .hmrcSandboxClientId("hmrc-sandbox-client")
                        .hmrcSandboxClientSecretArn(HMRC_SANDBOX_SECRET_ARN)
                        .build());
    }

    @Test
    void stackWiresFourApiLambdasAndCreatesNoSecret() {
        McpStack stack = synthMcpStack();
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Lambda::Function", 4);
        template.resourceCountIs("AWS::SecretsManager::Secret", 0);
        for (String functionName : List.of(
                stack.mcpHttpLambdaProps.ingestFunctionName(),
                stack.mcpOauthLambdaProps.ingestFunctionName(),
                stack.mcpCodesEntryLambdaProps.ingestFunctionName(),
                stack.mcpHmrcGrantLambdaProps.ingestFunctionName())) {
            template.hasResourceProperties(
                    "AWS::Lambda::Function", Match.objectLike(Map.of("FunctionName", functionName)));
        }
    }

    @Test
    void theBlobKeyArnIsLookedUpFromSsm() {
        Template template = Template.fromStack(synthMcpStack());

        template.hasParameter(
                "*",
                Match.objectLike(Map.of(
                        "Type",
                        "AWS::SSM::Parameter::Value<String>",
                        "Default",
                        SubmitSharedNames.forDocs().mcpOauthBlobKeySecretArnParameterName)));
    }

    @Test
    void theHttpFunctionCarriesTheSessionsTableTheHostsAndTheTokenSettings() {
        McpStack stack = synthMcpStack();
        Template template = Template.fromStack(stack);
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        stack.mcpHttpLambdaProps.ingestFunctionName(),
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "ENVIRONMENT_NAME",
                                        "docs",
                                        "MCP_SESSIONS_DYNAMODB_TABLE_NAME",
                                        "docs-env-mcp-sessions",
                                        "MCP_TOKEN_CLIENT_ID",
                                        MCP_CLIENT_ID,
                                        "MCP_TOKEN_ISSUER",
                                        "https://cognito-idp.eu-west-2.amazonaws.com/" + USER_POOL_ID,
                                        "MCP_TOKEN_JWKS_URI",
                                        "https://cognito-idp.eu-west-2.amazonaws.com/" + USER_POOL_ID
                                                + "/.well-known/jwks.json",
                                        "DIYA_SUBMIT_BASE_URL",
                                        sharedNames.baseUrl)))))));
        var variables = environmentVariables(template, stack.mcpHttpLambdaProps.ingestFunctionName());
        assertTrue(variables.get("MCP_PUBLIC_HOSTS").toString().contains(sharedNames.deploymentDomainName));
        assertTrue(variables.get("MCP_ALLOWED_ORIGINS").toString().contains("https://claude.ai"));
        assertTrue(variables.get("MCP_ALLOWED_ORIGINS").toString().contains("https://claude.com"));
    }

    @Test
    void theHttpFunctionHasReservedConcurrencyOfTen() {
        McpStack stack = synthMcpStack();

        Template.fromStack(stack)
                .hasResourceProperties(
                        "AWS::Lambda::Function",
                        Match.objectLike(Map.of(
                                "FunctionName",
                                stack.mcpHttpLambdaProps.ingestFunctionName(),
                                "ReservedConcurrentExecutions",
                                10)));
    }

    @Test
    void theOauthFunctionPointsAtCognitoAndTheBlobKeySecretWithAnEightSecondTimeout() {
        McpStack stack = synthMcpStack();
        Template template = Template.fromStack(stack);
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        stack.mcpOauthLambdaProps.ingestFunctionName(),
                        "MemorySize",
                        256,
                        "Timeout",
                        8,
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "MCP_UPSTREAM_AUTHORIZE_URL", sharedNames.cognitoBaseUri + "/oauth2/authorize",
                                        "MCP_UPSTREAM_TOKEN_URL", sharedNames.cognitoBaseUri + "/oauth2/token",
                                        "MCP_UPSTREAM_REVOKE_URL", sharedNames.cognitoBaseUri + "/oauth2/revoke",
                                        "MCP_UPSTREAM_CLIENT_ID", MCP_CLIENT_ID)))))));
        var variables = environmentVariables(template, stack.mcpOauthLambdaProps.ingestFunctionName());
        assertTrue(variables.containsKey("MCP_OAUTH_BLOB_KEY_SECRET_ARN"));
        assertTrue(variables.containsKey("MCP_PUBLIC_HOSTS"));
    }

    @Test
    void onlyTheHttpFunctionWritesTheSessionsTable() {
        McpStack stack = synthMcpStack();
        Template template = Template.fromStack(stack);

        assertTrue(
                iamStatementsForFunction(template, stack.mcpHttpLambdaProps.ingestFunctionName()).stream()
                        .anyMatch(statement -> actionsOf(statement).contains("dynamodb:PutItem")
                                && actionsOf(statement).contains("dynamodb:GetItem")),
                "expected the http function to read and write the sessions table");
        assertTrue(
                iamStatementsForFunction(template, stack.mcpOauthLambdaProps.ingestFunctionName()).stream()
                        .noneMatch(statement -> actionsOf(statement).stream().anyMatch(a -> a.startsWith("dynamodb:"))),
                "expected the oauth function to have no DynamoDB access");
    }

    @Test
    void theHttpFunctionReadsTheSaltAndTheOauthFunctionReadsTheBlobKey() {
        McpStack stack = synthMcpStack();
        Template template = Template.fromStack(stack);

        assertTrue(
                iamStatementsForFunction(template, stack.mcpHttpLambdaProps.ingestFunctionName()).stream()
                        .anyMatch(statement -> actionsOf(statement).contains("secretsmanager:GetSecretValue")),
                "expected the http function to have salt secret access");
        var oauthSecretStatements =
                iamStatementsForFunction(template, stack.mcpOauthLambdaProps.ingestFunctionName()).stream()
                        .filter(statement -> actionsOf(statement).contains("secretsmanager:GetSecretValue"))
                        .toList();
        assertEquals(1, oauthSecretStatements.size());
        assertFalse(
                String.valueOf(oauthSecretStatements.get(0).get("Resource")).contains("user-sub-hash-salt"),
                "expected the oauth function to read the blob key, not the salt");
    }

    @Test
    void routesAreMcpAnyTheOauthPathsTheCodesEntryPathsAndTheHmrcGrantPaths() {
        McpStack stack = synthMcpStack();

        var routes = stack.lambdaFunctionProps.stream()
                .map(props -> props.httpMethod() + " " + props.urlPath())
                .toList();
        assertEquals(
                List.of(
                        "ANY /mcp",
                        "GET /.well-known/oauth-authorization-server",
                        "GET /.well-known/oauth-protected-resource",
                        "GET /.well-known/oauth-protected-resource/mcp",
                        "ANY /mcp/oauth/{action}",
                        "POST /api/v1/mcp/codes-entries",
                        "GET /api/v1/mcp/codes-entries/{entryId}",
                        "PUT /api/v1/mcp/codes-entries/{entryId}",
                        "POST /api/v1/mcp/hmrc-grants",
                        "GET /api/v1/mcp/hmrc-grants/{grantId}",
                        "POST /api/v1/mcp/hmrc-grants/callback"),
                routes);
        var signedInRoutes = List.of(
                "POST /api/v1/mcp/codes-entries", "POST /api/v1/mcp/hmrc-grants", "GET /api/v1/mcp/hmrc-grants/{grantId}");
        for (AbstractApiLambdaProps props : stack.lambdaFunctionProps) {
            if (signedInRoutes.contains(props.httpMethod() + " " + props.urlPath())) {
                assertTrue(props.jwtAuthorizer(), props.urlPath() + " needs the signed-in user");
                assertFalse(props.customAuthorizer(), props.urlPath() + " must have no custom authoriser");
                continue;
            }
            assertFalse(props.jwtAuthorizer(), props.urlPath() + " must have no JWT authoriser");
            assertFalse(props.customAuthorizer(), props.urlPath() + " must have no custom authoriser");
            assertFalse(props.booksJwtAuthorizer(), props.urlPath() + " must have no books authoriser");
        }
        assertEquals(HttpMethod.ANY, stack.mcpHttpLambdaProps.httpMethod());
    }

    @Test
    void everyRouteResolvesToOneOfTheFourFunctions() {
        McpStack stack = synthMcpStack();

        var functionNames = stack.lambdaFunctionProps.stream()
                .map(AbstractApiLambdaProps::ingestFunctionName)
                .distinct()
                .toList();
        assertEquals(
                List.of(
                        stack.mcpHttpLambdaProps.ingestFunctionName(),
                        stack.mcpOauthLambdaProps.ingestFunctionName(),
                        stack.mcpCodesEntryLambdaProps.ingestFunctionName(),
                        stack.mcpHmrcGrantLambdaProps.ingestFunctionName()),
                functionNames);
    }

    @Test
    void theHmrcGrantFunctionCarriesTheHmrcClientsAndReadsTheirSecretsTheBlobKeyAndTheSalt() {
        McpStack stack = synthMcpStack();
        Template template = Template.fromStack(stack);
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        var variables = environmentVariables(template, stack.mcpHmrcGrantLambdaProps.ingestFunctionName());
        assertEquals("docs-env-mcp-sessions", variables.get("MCP_SESSIONS_DYNAMODB_TABLE_NAME"));
        assertEquals(sharedNames.publicBaseUrl, variables.get("DIY_SUBMIT_BASE_URL"));
        assertEquals("hmrc-live-client", variables.get("HMRC_CLIENT_ID"));
        assertEquals("hmrc-sandbox-client", variables.get("HMRC_SANDBOX_CLIENT_ID"));
        assertEquals(HMRC_SECRET_ARN, variables.get("HMRC_CLIENT_SECRET_ARN"));
        assertEquals(HMRC_SANDBOX_SECRET_ARN, variables.get("HMRC_SANDBOX_CLIENT_SECRET_ARN"));
        assertTrue(variables.containsKey("MCP_OAUTH_BLOB_KEY_SECRET_ARN"));
        assertTrue(variables.containsKey("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME"));
        var statements = iamStatementsForFunction(template, stack.mcpHmrcGrantLambdaProps.ingestFunctionName());
        assertTrue(
                statements.stream()
                        .anyMatch(statement -> actionsOf(statement).contains("dynamodb:UpdateItem")
                                && actionsOf(statement).contains("dynamodb:DeleteItem")),
                "expected the grant function to write the sessions table");
        var secretResources = statements.stream()
                .filter(statement -> actionsOf(statement).contains("secretsmanager:GetSecretValue"))
                .map(statement -> String.valueOf(statement.get("Resource")))
                .toList();
        assertEquals(4, secretResources.size(), "expected the blob key, the salt and the two HMRC client secrets");
        assertTrue(secretResources.contains(HMRC_SECRET_ARN + "-*"));
        assertTrue(secretResources.contains(HMRC_SANDBOX_SECRET_ARN + "-*"));
    }

    @Test
    void theCodesEntryFunctionReadsAndWritesTheSessionsTableAndReadsTheBlobKeyAndTheSalt() {
        McpStack stack = synthMcpStack();
        Template template = Template.fromStack(stack);
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        var variables = environmentVariables(template, stack.mcpCodesEntryLambdaProps.ingestFunctionName());
        assertEquals("docs-env-mcp-sessions", variables.get("MCP_SESSIONS_DYNAMODB_TABLE_NAME"));
        assertEquals(sharedNames.baseUrl, variables.get("DIY_SUBMIT_BASE_URL"));
        assertTrue(variables.containsKey("MCP_OAUTH_BLOB_KEY_SECRET_ARN"));
        var statements = iamStatementsForFunction(template, stack.mcpCodesEntryLambdaProps.ingestFunctionName());
        assertTrue(
                statements.stream()
                        .anyMatch(statement -> actionsOf(statement).contains("dynamodb:PutItem")
                                && actionsOf(statement).contains("dynamodb:DeleteItem")),
                "expected the codes entry function to write the sessions table");
        assertEquals(
                2,
                statements.stream()
                        .filter(statement -> actionsOf(statement).contains("secretsmanager:GetSecretValue"))
                        .count(),
                "expected the blob key and the salt");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> environmentVariables(Template template, String functionName) {
        var functions = template.findResources(
                "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
        assertEquals(1, functions.size(), "expected exactly one function named " + functionName);
        var properties =
                (Map<String, Object>) functions.values().iterator().next().get("Properties");
        var environment = (Map<String, Object>) properties.get("Environment");
        return (Map<String, Object>) environment.get("Variables");
    }

    @SuppressWarnings("unchecked")
    private static List<String> actionsOf(Map<String, Object> statement) {
        Object action = statement.get("Action");
        return action instanceof List<?> list ? (List<String>) list : List.of(String.valueOf(action));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> iamStatementsForFunction(Template template, String functionName) {
        var functions = template.findResources(
                "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
        assertEquals(1, functions.size(), "expected exactly one function named " + functionName);
        var functionProperties =
                (Map<String, Object>) functions.values().iterator().next().get("Properties");
        var roleRef = (Map<String, Object>) functionProperties.get("Role");
        var roleLogicalId = (String) ((List<Object>) roleRef.get("Fn::GetAtt")).get(0);

        var statements = new java.util.ArrayList<Map<String, Object>>();
        template.findResources("AWS::IAM::Policy").forEach((id, policy) -> {
            var properties = (Map<String, Object>) policy.get("Properties");
            var roles = (List<Object>) properties.get("Roles");
            boolean attachedToThisRole = roles.stream()
                    .anyMatch(role ->
                            role instanceof Map && roleLogicalId.equals(((Map<String, Object>) role).get("Ref")));
            if (!attachedToThisRole) {
                return;
            }
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            statements.addAll((List<Map<String, Object>>) document.get("Statement"));
        });
        return statements;
    }
}
