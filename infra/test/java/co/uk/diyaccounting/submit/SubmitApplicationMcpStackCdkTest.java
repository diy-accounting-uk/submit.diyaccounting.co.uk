/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.SubmitApplicationCdkSupport.*;

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

class SubmitApplicationMcpStackCdkTest extends SubmitApplicationCdkTestEnvironment {

    @Test
    void mcpUserPoolClientIdStaysEmptyWhenNotSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        // No COGNITO_MCP_CLIENT_ID is set by the class-level environment variables above, and
        // mcpUserPoolClientId is blank in cdk.json, so this must synth without throwing (unlike
        // the DIYA-GL client id above) and the books authoriser's audience must carry only the
        // DIYA-GL client id, with no blank entry added for the unset MCP one.
        var submitApplication = new SubmitApplication(app, appProps);
        Template apiStackTemplate = Template.fromStack(submitApplication.apiStack);

        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Authorizer",
                Match.objectLike(Map.of(
                        "JwtConfiguration",
                        Match.objectLike(Map.of("Audience", List.of("tt-witheight-cognito-books-client-id"))))));
    }

    @Test
    @SetEnvironmentVariable(key = "COGNITO_MCP_CLIENT_ID", value = "tt-witheight-cognito-mcp-client-id")
    void mcpUserPoolClientIdJoinsTheBooksAuthoriserAudienceWhenSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template apiStackTemplate = Template.fromStack(submitApplication.apiStack);

        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Authorizer",
                Match.objectLike(Map.of(
                        "JwtConfiguration",
                        Match.objectLike(Map.of(
                                "Audience",
                                List.of(
                                        "tt-witheight-cognito-books-client-id",
                                        "tt-witheight-cognito-mcp-client-id"))))));
    }

    @Test
    @SetEnvironmentVariable(key = "COGNITO_MCP_CLIENT_ID", value = "tt-witheight-cognito-mcp-client-id")
    void mcpStackRoutesJoinTheApiWhenTheMcpClientIdIsSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        List<Template> apiTemplates = List.of(
                Template.fromStack(submitApplication.apiStack), Template.fromStack(submitApplication.apiRoutesStack));

        org.junit.jupiter.api.Assertions.assertNotNull(submitApplication.mcpStack);
        assertApiRoute(apiTemplates, Map.of("RouteKey", "ANY /mcp"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /.well-known/oauth-authorization-server"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /.well-known/oauth-protected-resource"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /.well-known/oauth-protected-resource/mcp"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "ANY /mcp/oauth/{action}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "HEAD /mcp"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "HEAD /mcp/oauth/{action}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/mcp/hmrc-grants"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/mcp/hmrc-grants/{grantId}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/mcp/hmrc-grants/callback"));
    }

    @Test
    void mcpStackIsAbsentWhenNoMcpClientIdIsSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);

        org.junit.jupiter.api.Assertions.assertNull(submitApplication.mcpStack);
    }
}
