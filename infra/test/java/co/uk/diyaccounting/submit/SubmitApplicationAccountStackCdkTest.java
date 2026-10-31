/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.SubmitApplicationCdkSupport.*;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class SubmitApplicationAccountStackCdkTest extends SubmitApplicationCdkTestEnvironment {

    @Test
    @SetEnvironmentVariable(key = "GITHUB_APP_ID", value = "123456")
    @SetEnvironmentVariable(key = "GITHUB_APP_INSTALLATION_ID", value = "78901234")
    void shouldRouteTheSupportTicketPostWhenTheGithubAppIsConfigured() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());

        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        var submitApplication = new SubmitApplication(app, appProps);
        app.synth();

        assertEquals(
                1,
                Template.fromStack(submitApplication.accountStack)
                        .findResources(
                                "AWS::Lambda::Function",
                                Map.of(
                                        "Properties",
                                        Map.of("FunctionName", Match.stringLikeRegexp("support-ticket-post"))))
                        .size());
        List<Template> apiTemplates = List.of(
                Template.fromStack(submitApplication.apiStack), Template.fromStack(submitApplication.apiRoutesStack));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/support/ticket"));
    }

    @Test
    @SetEnvironmentVariable(key = "COGNITO_MCP_CLIENT_ID", value = "tt-witheight-cognito-mcp-client-id")
    void accountStackPracticeClientAuthorisationLambdaCarriesTheMcpClientIdWhenSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template accountStackTemplate = Template.fromStack(submitApplication.accountStack);

        assertHasEnvironmentVariable(
                accountStackTemplate,
                submitApplication.accountStack.practiceClientAuthorisationGetLambdaProps.ingestFunctionName(),
                "COGNITO_MCP_CLIENT_ID");
    }
}
