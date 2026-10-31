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

class SubmitApplicationHmrcStackCdkTest extends SubmitApplicationCdkTestEnvironment {

    @Test
    @SetEnvironmentVariable(key = "COGNITO_MCP_CLIENT_ID", value = "tt-witheight-cognito-mcp-client-id")
    void hmrcStackLambdaCarriesTheMcpClientIdWhenSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template hmrcStackTemplate = Template.fromStack(submitApplication.hmrcStack);

        assertHasEnvironmentVariable(
                hmrcStackTemplate,
                submitApplication.hmrcStack.hmrcVatReturnPostLambdaProps.ingestFunctionName(),
                "COGNITO_MCP_CLIENT_ID");
    }

    @Test
    @SetEnvironmentVariable(key = "COGNITO_MCP_CLIENT_ID", value = "tt-witheight-cognito-mcp-client-id")
    void hmrcItsaStackLambdaCarriesTheMcpClientIdWhenSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template hmrcItsaStackTemplate = Template.fromStack(submitApplication.hmrcItsaStack);

        assertHasEnvironmentVariable(
                hmrcItsaStackTemplate,
                submitApplication.hmrcItsaStack.hmrcItsaUkPropertyPeriodPostLambdaProps.ingestFunctionName(),
                "COGNITO_MCP_CLIENT_ID");
    }
}
