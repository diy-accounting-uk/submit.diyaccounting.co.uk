/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Match;
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
        // Streams: receipts, bundles, passes, subscriptions (one UpdateTable to enable, one
        //      DescribeTable to read the stream ARN)
        Template.fromStack(env.dataStack).resourceCountIs("Custom::AWS", 38);

        // 8) Observability stack should enable CloudTrail (Trail present)
        Template.fromStack(env.observabilityStack).resourceCountIs("AWS::CloudTrail::Trail", 1);

        // 9) Analytics stack: one delivery stream into the lake, catalogued once and queryable
        Template analytics = Template.fromStack(env.analyticsStack);
        analytics.resourceCountIs("AWS::KinesisFirehose::DeliveryStream", 1);
        analytics.resourceCountIs("AWS::Glue::Database", 1);
        analytics.resourceCountIs("AWS::Glue::Table", 2);
        analytics.resourceCountIs("AWS::Athena::WorkGroup", 1);
        analytics.resourceCountIs("AWS::Athena::NamedQuery", 2);
        // The lake and the Athena results bucket
        analytics.resourceCountIs("AWS::S3::Bucket", 2);

        analytics.hasResourceProperties(
                "AWS::KinesisFirehose::DeliveryStream",
                Match.objectLike(Map.of(
                        "ExtendedS3DestinationConfiguration", Match.objectLike(Map.of("CompressionFormat", "UNCOMPRESSED")))));

        analytics.hasResourceProperties(
                "AWS::Events::Rule",
                Match.objectLike(Map.of(
                        "EventBusName",
                        "test-env-activity-bus",
                        "EventPattern",
                        Match.objectLike(Map.of("detail-type", List.of("ActivityEvent"))))));

        analytics.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(
                                Map.of("Parameters", Match.objectLike(Map.of("projection.enabled", "true")))))));

        assertNoUnscopedIamResources(analytics);

        // 10) Ingestion stack: the scheduling skeleton only, until a WP-9/10/11 job registers
        // itself. Importing the lake bucket by name creates no bucket of its own.
        Template ingestion = Template.fromStack(env.ingestionStack);
        ingestion.resourceCountIs("AWS::S3::Bucket", 0);
        ingestion.resourceCountIs("AWS::Events::Rule", 0);
        ingestion.resourceCountIs("AWS::SQS::Queue", 0);
        assertNoUnscopedIamResources(ingestion);
    }

    /**
     * Fail on any inline IAM policy statement that grants on every resource. X-Ray is the one
     * exception the CDK Lambda construct forces on us: its actions carry no resource-level
     * permissions at all, so a wildcard there is the narrowest grant that exists.
     */
    private static void assertNoUnscopedIamResources(Template template) {
        var offenders = new ArrayList<String>();
        var policies = template.findResources("AWS::IAM::Policy");
        for (Map.Entry<String, Map<String, Object>> policy : policies.entrySet()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.getValue().get("Properties");
            if (properties == null) continue;
            @SuppressWarnings("unchecked")
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            if (document == null) continue;
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) document.get("Statement");
            if (statements == null) continue;
            for (Map<String, Object> statement : statements) {
                if (!"*".equals(statement.get("Resource"))) continue;
                if (isResourceLevelExemptAction(statement.get("Action"))) continue;
                offenders.add(policy.getKey() + " " + statement.get("Action"));
            }
        }
        assertTrue(offenders.isEmpty(), "IAM statements granting on every resource: " + offenders);
    }

    private static boolean isResourceLevelExemptAction(Object action) {
        List<?> actions = action instanceof List<?> list ? list : List.of(String.valueOf(action));
        return !actions.isEmpty()
                && actions.stream().allMatch(a -> String.valueOf(a).startsWith("xray:"));
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
