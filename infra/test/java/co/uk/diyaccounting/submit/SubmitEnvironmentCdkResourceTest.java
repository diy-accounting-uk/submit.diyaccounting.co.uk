/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Template;

@SetEnvironmentVariable.SetEnvironmentVariables({
    @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "test"),
    @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "tt-witheight"),
    @SetEnvironmentVariable(
            key = "GOOGLE_CLIENT_SECRET_ARN",
            value = "arn:aws:secretsmanager:us-east-1:111111111111:secret:tt-witheight-google-secret"),
    @SetEnvironmentVariable(key = "CLOUD_TRAIL_ENABLED", value = "true"),
    @SetEnvironmentVariable(key = "ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS", value = "1"),
    @SetEnvironmentVariable(key = "DYNAMODB_RETAIN_RECEIPTS_TABLE", value = "false"),
    @SetEnvironmentVariable(key = "HOLDING_DOC_ROOT_PATH", value = "./web/holding"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "us-east-1"),
})
class SubmitEnvironmentCdkResourceTest {

    @Test
    void shouldCreateEnvironmentStacksWithResources() throws IOException {
        // 1) Load the CDK context from cdk-environment/cdk.json
        Path cdkJsonPath = Path.of("cdk-environment/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);

        // Normalize to keys expected by SubmitEnvironmentProps if provided via cdk-environment
        if (ctx.containsKey("apexActiveLabel")) {
            ctx.put("activeLabel", ctx.get("apexActiveLabel"));
        }
        if (ctx.containsKey("apexDeploymentOrigins")) {
            ctx.put("deploymentOriginsCsv", ctx.get("apexDeploymentOrigins"));
        }
        // Use a syntactically valid fake ACM certificate ARN so CDK doesn't reject the ARN format
        ctx.put(
                "certificateArn",
                "arn:aws:acm:us-east-1:111111111111:certificate/12345678-1234-1234-1234-123456789012");
        ctx.put(
                "holdingCertificateArn",
                "arn:aws:acm:us-east-1:111111111111:certificate/12345678-1234-1234-1234-123456789012");

        App app = new App(AppProps.builder().context(ctx).build());

        // 2) Load props using the application loader to mimic real execution
        SubmitEnvironment.SubmitEnvironmentProps appProps = SubmitEnvironment.loadAppProps(app, "cdk-environment/");

        // 3) Build the environment and synth
        var env = new SubmitEnvironment(app, appProps);
        app.synth();

        // 4) The holding stack serves one page from one bucket behind one distribution
        Template.fromStack(env.holdingStack).resourceCountIs("AWS::CloudFront::Distribution", 1);
        Template.fromStack(env.holdingStack).resourceCountIs("AWS::S3::Bucket", 1);

        // 5) Identity stack should create a Cognito User Pool
        Template.fromStack(env.identityStack).resourceCountIs("AWS::Cognito::UserPool", 1);

        // 6) Data stack creates 11 DynamoDB tables + 11 PITR + 1 GSI + 7 TTL via AwsCustomResource
        // for idempotent deployments
        // Tables: receipts, bundles, bundlePostAsyncRequests, bundleDeleteAsyncRequests,
        // hmrcVatReturnPostAsyncRequests, hmrcVatReturnGetAsyncRequests, hmrcVatObligationGetAsyncRequests,
        // hmrcApiRequests, passes, bundleCapacity, subscriptions
        // PITR: every table
        // GSIs: passes issuedBy-index
        // TTL: bundles, bundlePostAsync, bundleDeleteAsync, hmrcVatReturnPostAsync,
        //      hmrcVatReturnGetAsync, hmrcVatObligationGetAsync, hmrcApiRequests
        Template.fromStack(env.dataStack).resourceCountIs("Custom::AWS", 30);

        // 8) Observability stack should enable CloudTrail (Trail present)
        Template.fromStack(env.observabilityStack).resourceCountIs("AWS::CloudTrail::Trail", 1);
    }

    private static @NotNull Map<String, Object> buildContextPropertyMapFromCdkJsonPath(Path cdkJsonPath)
            throws IOException {
        String json = Files.readString(cdkJsonPath);
        ObjectMapper om = new ObjectMapper();
        JsonNode root = om.readTree(json);
        JsonNode ctxNode = root.path("context");

        Map<String, Object> ctx = new HashMap<>();
        for (Map.Entry<String, JsonNode> e : ctxNode.properties()) {
            ctx.put(e.getKey(), e.getValue().asText());
        }
        return ctx;
    }
}
