/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.assertions.Template;

/**
 * The HMRC client id, base URI and agent authorisation base URI on the HMRC Lambdas come from the
 * deploy environment (the {@code .env.<environment>} file the deploy loads) and fall back to
 * {@code cdk-application/cdk.json}, which holds the production values.
 */
@SetEnvironmentVariable.SetEnvironmentVariables({
    @SetEnvironmentVariable(
            key = "COGNITO_USER_POOL_ARN",
            value = "arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_123456789"),
    @SetEnvironmentVariable(key = "COGNITO_CLIENT_ID", value = "tt-cognito-client-id"),
    @SetEnvironmentVariable(key = "COGNITO_DIYA_GL_CLIENT_ID", value = "tt-cognito-books-client-id"),
    @SetEnvironmentVariable(key = "COGNITO_MCP_CLIENT_ID", value = "tt-cognito-mcp-client-id"),
    @SetEnvironmentVariable(
            key = "HMRC_CLIENT_SECRET_ARN",
            value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:tt/submit/hmrc/client_secret"),
    @SetEnvironmentVariable(
            key = "HMRC_SANDBOX_CLIENT_SECRET_ARN",
            value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:tt/submit/hmrc/sandbox_client_secret"),
    @SetEnvironmentVariable(key = "BASE_IMAGE_TAG", value = "test"),
    @SetEnvironmentVariable(key = "CLOUD_TRAIL_ENABLED", value = "true"),
    @SetEnvironmentVariable(key = "SELF_DESTRUCT_DELAY_HOURS", value = "1"),
    @SetEnvironmentVariable(key = "HTTP_API_URL", value = "https://test-api.example.com/"),
    @SetEnvironmentVariable(key = "DOC_ROOT_PATH", value = "web/public"),
    @SetEnvironmentVariable(key = "EDGE_FUNCTION_ASSET_PATH", value = "app/functions/edge"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
})
class HmrcEndpointSelectionCdkResourceTest {

    private static final String SANDBOX_CLIENT_ID = "uqMHA6RsDGGa7h8EG2VqfqAmv4tV";
    private static final String SANDBOX_BASE_URI = "https://test-api.service.hmrc.gov.uk";
    private static final String PRODUCTION_CLIENT_ID = "hKCOeWXZ6ji7H3ep3nMwHrP5ycev";
    private static final String PRODUCTION_BASE_URI = "https://api.service.hmrc.gov.uk";

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "ci"),
        @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "ci-ep"),
        @SetEnvironmentVariable(key = "HMRC_CLIENT_ID", value = SANDBOX_CLIENT_ID),
        @SetEnvironmentVariable(key = "HMRC_BASE_URI", value = SANDBOX_BASE_URI),
        @SetEnvironmentVariable(key = "HMRC_AGENT_AUTHORISATION_BASE_URI", value = SANDBOX_BASE_URI),
    })
    void hmrcLambdasCarryTheClientIdAndBaseUriTheDeployEnvironmentProvides() throws IOException {
        var application = synthesise();

        var clientIds = lambdaEnvValues(application.hmrcStack, "HMRC_CLIENT_ID");
        var baseUris = new HashSet<>(lambdaEnvValues(application.hmrcStack, "HMRC_BASE_URI"));
        baseUris.addAll(lambdaEnvValues(application.hmrcItsaStack, "HMRC_BASE_URI"));
        baseUris.addAll(lambdaEnvValues(application.hmrcItsaPropertyStack, "HMRC_BASE_URI"));
        var agentBaseUris = lambdaEnvValues(application.accountStack, "HMRC_AGENT_AUTHORISATION_BASE_URI");

        assertEquals(Set.of(SANDBOX_CLIENT_ID), clientIds);
        assertEquals(Set.of(SANDBOX_BASE_URI), baseUris);
        assertEquals(Set.of(SANDBOX_BASE_URI), agentBaseUris);
    }

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "prod"),
        @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "prod-ep"),
    })
    void hmrcLambdasFallBackToTheProductionValuesInCdkJson() throws IOException {
        var application = synthesise();

        var clientIds = lambdaEnvValues(application.hmrcStack, "HMRC_CLIENT_ID");
        var baseUris = new HashSet<>(lambdaEnvValues(application.hmrcStack, "HMRC_BASE_URI"));
        baseUris.addAll(lambdaEnvValues(application.hmrcItsaStack, "HMRC_BASE_URI"));
        baseUris.addAll(lambdaEnvValues(application.hmrcItsaPropertyStack, "HMRC_BASE_URI"));

        assertEquals(Set.of(PRODUCTION_CLIENT_ID), clientIds);
        assertEquals(Set.of(PRODUCTION_BASE_URI), baseUris);
        assertEquals(
                Set.of(PRODUCTION_BASE_URI),
                lambdaEnvValues(application.accountStack, "HMRC_AGENT_AUTHORISATION_BASE_URI"));
    }

    private static SubmitApplication synthesise() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        JsonNode root = new ObjectMapper().readTree(Files.readString(cdkJsonPath));
        Map<String, Object> ctx = new HashMap<>();
        for (Map.Entry<String, JsonNode> e : root.path("context").properties()) {
            ctx.put(e.getKey(), e.getValue().asText());
        }
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        var application = new SubmitApplication(app, appProps);
        app.synth();
        return application;
    }

    @SuppressWarnings("unchecked")
    private static Set<String> lambdaEnvValues(Stack stack, String variable) {
        Set<String> values = new HashSet<>();
        Map<String, Map<String, Object>> functions = Template.fromStack(stack).findResources("AWS::Lambda::Function");
        for (var function : functions.values()) {
            var properties = (Map<String, Object>) function.get("Properties");
            var environment = (Map<String, Object>) properties.get("Environment");
            if (environment == null) continue;
            var variables = (Map<String, Object>) environment.get("Variables");
            if (variables != null && variables.get(variable) instanceof String value) {
                values.add(value);
            }
        }
        assertFalse(values.isEmpty(), "no Lambda in " + stack.getStackName() + " carries " + variable);
        assertTrue(values.stream().noneMatch(String::isBlank));
        return values;
    }
}
