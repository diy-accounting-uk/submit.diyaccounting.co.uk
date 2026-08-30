/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitEnvironment;
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
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

/**
 * WP-3-specific assertions: the activity-event delivery stream converts to Parquet under a
 * second prefix, a typed Glue table catalogues it, and the union view is created by a
 * custom resource rather than by hand-building a Presto view payload.
 *
 * <p>Kept separate from {@code SubmitEnvironmentCdkResourceTest} because that file is shared
 * across concurrent work packages; this class owns its own environment synth.
 */
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
class AnalyticsStackTest {

    @Test
    void shouldConvertActivityEventsToParquetWithATypedTableAndUnionView() throws IOException {
        Path cdkJsonPath = Path.of("cdk-environment/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        if (ctx.containsKey("apexActiveLabel")) {
            ctx.put("activeLabel", ctx.get("apexActiveLabel"));
        }
        if (ctx.containsKey("apexDeploymentOrigins")) {
            ctx.put("deploymentOriginsCsv", ctx.get("apexDeploymentOrigins"));
        }
        ctx.put(
                "certificateArn",
                "arn:aws:acm:us-east-1:111111111111:certificate/12345678-1234-1234-1234-123456789012");
        ctx.put(
                "holdingCertificateArn",
                "arn:aws:acm:us-east-1:111111111111:certificate/12345678-1234-1234-1234-123456789012");

        App app = new App(AppProps.builder().context(ctx).build());
        SubmitEnvironment.SubmitEnvironmentProps appProps = SubmitEnvironment.loadAppProps(app, "cdk-environment/");
        var env = new SubmitEnvironment(app, appProps);
        app.synth();

        Template analytics = Template.fromStack(env.analyticsStack);

        // The delivery stream now converts to Parquet under curated/activity-events/, buffered
        // wider than the JSON spike, with no destination-side compression on top of Parquet's own.
        analytics.hasResourceProperties(
                "AWS::KinesisFirehose::DeliveryStream",
                Match.objectLike(Map.of(
                        "ExtendedS3DestinationConfiguration",
                        Match.objectLike(Map.of(
                                "Prefix",
                                Match.stringLikeRegexp("^curated/activity-events/.*"),
                                "CompressionFormat",
                                "UNCOMPRESSED",
                                "BufferingHints",
                                Match.objectLike(Map.of("IntervalInSeconds", 900, "SizeInMBs", 128)),
                                "DataFormatConversionConfiguration",
                                Match.objectLike(Map.of("Enabled", true)))))));

        // Two Glue tables: the JSON spike table stays queryable, the typed Parquet table is new.
        analytics.resourceCountIs("AWS::Glue::Table", 13);
        analytics.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "activity_events",
                                "Parameters",
                                Match.objectLike(
                                        Map.of("classification", "parquet", "projection.enabled", "true")))))));

        // Two saved queries: the spike's day-one query, plus the union view's definition kept
        // here for reference (the custom resource below is what actually creates the view).
        analytics.resourceCountIs("AWS::Athena::NamedQuery", 10);

        // The view itself is created by a one-shot custom resource, not a hand-built VIRTUAL_VIEW.
        var customResources = analytics.findResources("Custom::AWS");
        var viewCreatorFound = customResources.values().stream().anyMatch(resource -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            var create = String.valueOf(properties.get("Create"));
            return create.contains("startQueryExecution") && create.contains("CREATE OR REPLACE VIEW");
        });
        org.junit.jupiter.api.Assertions.assertTrue(
                viewCreatorFound, "expected a Custom::AWS resource running the union view's CREATE OR REPLACE VIEW");

        // AnalyticsStack packs many AwsCustomResource instances (the union view, every BusinessViews
        // query, every TableChangeDelivery stream lookup) that all reuse one singleton provider
        // Lambda, plus several named Lambdas (the metrics-publish and data-quality-run functions,
        // TableChangeDelivery's stream consumer). Every one of those functions must route its logs
        // to an explicit, retained log group rather than the unretained one CDK auto-creates.
        assertEveryLambdaHasAnExplicitLogGroup(analytics);
    }

    /**
     * Asserts every Lambda function carries an explicit {@code LoggingConfig.LogGroup}, so its logs
     * land in a group this stack retains and deletes with it, not an unnamed one CloudWatch creates
     * with no retention on first invoke. The one known exception is CDK's built-in
     * auto-delete-objects handler, which exposes no logGroup option at all.
     */
    @SuppressWarnings("unchecked")
    private static void assertEveryLambdaHasAnExplicitLogGroup(Template template) {
        var missing = new java.util.ArrayList<String>();
        template.findResources("AWS::Lambda::Function").forEach((id, resource) -> {
            var properties = (Map<String, Object>) resource.get("Properties");
            var loggingConfig = properties == null ? null : (Map<String, Object>) properties.get("LoggingConfig");
            if (loggingConfig != null && loggingConfig.containsKey("LogGroup")) return;
            var description = String.valueOf(properties == null ? "" : properties.get("Description"));
            if (description.contains("auto-deleting objects")) return;
            missing.add(id);
        });
        org.junit.jupiter.api.Assertions.assertTrue(
                missing.isEmpty(), "Lambda functions with no explicit log group: " + missing);
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
