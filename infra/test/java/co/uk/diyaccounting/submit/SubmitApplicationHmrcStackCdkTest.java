/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.SubmitApplicationCdkSupport.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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

    private static final String WARN_LINE_WITH_HMRC_ERROR_KEY =
            "{\"level\":40,\"time\":\"2026-11-24T05:06:00.000Z\",\"requestId\":\"test_probe\","
                    + "\"message\":\"Not found for request\",\"hmrcResponseCode\":404,"
                    + "\"hmrcError\":{\"code\":\"MATCHING_RESOURCE_NOT_FOUND\"}}";
    private static final String ERROR_LINE =
            "{\"level\":50,\"time\":\"2026-11-24T05:06:00.000Z\",\"message\":\"HMRC call failed\"}";
    private static final String FATAL_LINE =
            "{\"level\":60,\"time\":\"2026-11-24T05:06:00.000Z\",\"message\":\"Handler crashed\"}";

    @Test
    @SuppressWarnings("unchecked")
    void logErrorsFilterCountsAnErrorLevelLineAndNotTheHmrcErrorKeyOfAWarnLine() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        var submitApplication = new SubmitApplication(app, appProps);
        Template template = Template.fromStack(submitApplication.hmrcStack);
        String functionName = submitApplication.hmrcStack.hmrcVatReturnGetLambdaProps.ingestFunctionName();

        List<String> patterns = template.findResources("AWS::Logs::MetricFilter").values().stream()
                .map(resource -> (Map<String, Object>) resource.get("Properties"))
                .filter(props -> {
                    var transformation = ((List<Map<String, Object>>) props.get("MetricTransformations")).get(0);
                    return String.valueOf(transformation.get("MetricName")).endsWith(functionName + "-log-errors");
                })
                .map(props -> String.valueOf(props.get("FilterPattern")))
                .toList();

        assertEquals(List.of("{ $.level >= 50 }"), patterns);
        String pattern = patterns.get(0);
        assertFalse(levelMatches(pattern, WARN_LINE_WITH_HMRC_ERROR_KEY));
        assertTrue(levelMatches(pattern, ERROR_LINE));
        assertTrue(levelMatches(pattern, FATAL_LINE));
    }

    // A JSON line matches { $.level >= N } when its numeric level field is at least N.
    private static boolean levelMatches(String pattern, String line) {
        Matcher threshold = Pattern.compile("\\{ \\$\\.level >= (\\d+) \\}").matcher(pattern);
        assertTrue(threshold.matches(), pattern);
        Matcher level = Pattern.compile("\"level\":(\\d+)").matcher(line);
        return level.find() && Integer.parseInt(level.group(1)) >= Integer.parseInt(threshold.group(1));
    }
}
