/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.SubmitApplicationCdkSupport.*;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Template;

class SubmitApplicationAuthStackCdkTest extends SubmitApplicationCdkTestEnvironment {

    @Test
    @SetEnvironmentVariable(key = "COGNITO_MCP_CLIENT_ID", value = "tt-witheight-cognito-mcp-client-id")
    void customAuthorizerLambdaCarriesTheMcpClientIdWhenSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template authStackTemplate = Template.fromStack(submitApplication.authStack);

        assertHasEnvironmentVariable(
                authStackTemplate,
                submitApplication.authStack.customAuthorizerLambdaProps.ingestFunctionName(),
                "COGNITO_MCP_CLIENT_ID");
    }

    @Test
    void customAuthorizerLambdaCarriesNoMcpClientIdEnvVarWhenUnset() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template authStackTemplate = Template.fromStack(submitApplication.authStack);
        String functionName = submitApplication.authStack.customAuthorizerLambdaProps.ingestFunctionName();

        var functions = authStackTemplate.findResources("AWS::Lambda::Function").values().stream()
                .map(resource -> (Map<String, Object>) resource.get("Properties"))
                .filter(properties ->
                        String.valueOf(properties.get("FunctionName")).equals(functionName))
                .toList();
        org.junit.jupiter.api.Assertions.assertEquals(1, functions.size());
        var environment = (Map<String, Object>) functions.get(0).get("Environment");
        var variables = (Map<String, Object>) environment.get("Variables");
        org.junit.jupiter.api.Assertions.assertFalse(variables.containsKey("COGNITO_MCP_CLIENT_ID"));
    }
}
