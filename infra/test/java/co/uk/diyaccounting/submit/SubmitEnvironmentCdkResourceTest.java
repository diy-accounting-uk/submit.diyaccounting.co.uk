/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
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

        // 6) Data stack creates 12 DynamoDB tables + 12 PITR + 1 GSI + 9 TTL via AwsCustomResource
        // for idempotent deployments
        // Tables: receipts, bundles, bundlePostAsyncRequests, bundleDeleteAsyncRequests,
        // hmrcVatReturnPostAsyncRequests, hmrcVatReturnGetAsyncRequests, hmrcVatObligationGetAsyncRequests,
        // hmrcApiRequests, passes, bundleCapacity, subscriptions, securityState
        // PITR: every table
        // GSIs: passes issuedBy-index
        // TTL: receipts, bundles, bundlePostAsync, bundleDeleteAsync, hmrcVatReturnPostAsync,
        //      hmrcVatReturnGetAsync, hmrcVatObligationGetAsync, hmrcApiRequests, securityState
        // Streams: receipts, bundles, passes, subscriptions (one UpdateTable to enable, one
        //      DescribeTable to read the stream ARN)
        Template.fromStack(env.dataStack).resourceCountIs("Custom::AWS", 48);

        // 8) Observability stack should enable CloudTrail (Trail present)
        Template.fromStack(env.observabilityStack).resourceCountIs("AWS::CloudTrail::Trail", 1);
        assertTrailLogsDynamoDbDataEventsExceptGetRecords(Template.fromStack(env.observabilityStack));

        // 9) Analytics stack: one delivery stream into the lake, catalogued once and queryable
        Template analytics = Template.fromStack(env.analyticsStack);
        analytics.resourceCountIs("AWS::KinesisFirehose::DeliveryStream", 5);
        analytics.resourceCountIs("AWS::Lambda::EventSourceMapping", 4);
        analytics.resourceCountIs("AWS::Glue::Database", 1);
        analytics.resourceCountIs("AWS::Glue::DataQualityRuleset", 1);
        analytics.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
        analytics.resourceCountIs("AWS::Glue::Table", 14);
        analytics.resourceCountIs("AWS::Athena::WorkGroup", 1);
        analytics.resourceCountIs("AWS::Athena::NamedQuery", 12);
        // The lake and the Athena results bucket
        analytics.resourceCountIs("AWS::S3::Bucket", 2);

        analytics.hasResourceProperties(
                "AWS::KinesisFirehose::DeliveryStream",
                Match.objectLike(Map.of(
                        "ExtendedS3DestinationConfiguration",
                        Match.objectLike(Map.of("CompressionFormat", "UNCOMPRESSED")))));

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

        // The stack's composite health alarm routes through OpsStack's AlarmStateChangeRule, which matches
        // this environment's shared-alarm prefix `{envName}-env-` (OpsStack itself is an app-level
        // stack and isn't synthesized here, so this mirrors SubmitSharedNames.envResourceNamePrefix
        // for the fixed ENVIRONMENT_NAME=test config above, the same way "test-env-activity-bus" is
        // hardcoded above).
        List<String> envRoutedPrefixes = List.of("test-env-");
        SubmitApplicationCdkResourceTest.assertStackHealthAlarm(analytics, 2, envRoutedPrefixes);

        // 10) Ingestion stack: the Stripe reconciliation, GA4 report pull and GA4 BigQuery event
        // export pull jobs, each with an Errors alarm only, invoked by the NightlyIngestionWorkflow
        // state machine (one Step Functions state machine, one EventBridge Scheduler schedule,
        // one ExecutionsFailed alarm - ExecutionsMissed is prod-only, so not here). Importing the
        // lake bucket by name creates no bucket of its own. Every job's name is stable across
        // redeploys, so their log groups go through the idempotent AwsCustomResource path,
        // adding the shared singleton provider.
        Template ingestion = Template.fromStack(env.ingestionStack);
        ingestion.resourceCountIs("AWS::S3::Bucket", 0);
        ingestion.resourceCountIs("AWS::Lambda::Function", 4);
        ingestion.resourceCountIs("AWS::Events::Rule", 0);
        ingestion.resourceCountIs("AWS::SQS::Queue", 0);
        ingestion.resourceCountIs("AWS::CloudWatch::Alarm", 4);
        ingestion.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
        ingestion.resourceCountIs("AWS::Scheduler::Schedule", 1);
        assertNoUnscopedIamResources(ingestion);

        // BillingWebhookStack only synthesizes when a regional API Gateway custom-domain
        // certificate is configured; this test's config doesn't set one.
        if (env.billingWebhookStack != null) {
            Template billingWebhook = Template.fromStack(env.billingWebhookStack);
            SubmitApplicationCdkResourceTest.assertStackHealthAlarm(billingWebhook, 1, envRoutedPrefixes);
        }

        // Every Lambda function across the environment stacks must route its logs to an explicit,
        // retained log group — otherwise CDK (or, for AwsCustomResource, CloudFormation's own
        // provider framework) gives it an unnamed one with no retention and no removal policy, and
        // it outlives the stack. The one known exception is CDK's built-in auto-delete-objects
        // handler, which exposes no logGroup option at all.
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(env.observabilityStack));
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(env.dataStack));
        assertEveryLambdaHasAnExplicitLogGroup(analytics);
        assertEveryLambdaHasAnExplicitLogGroup(ingestion);
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(env.identityStack));
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(env.holdingStack));

        // Cost Explorer can only split spend by a tag key the billable resource actually carries,
        // so the whole app gets the standard set and each stack names itself.
        Template.fromStack(env.observabilityStack)
                .hasResourceProperties(
                        "AWS::CloudTrail::Trail",
                        Match.objectLike(Map.of(
                                "Tags",
                                Match.arrayWith(List.of(
                                        Map.of("Key", "Application", "Value", CostAllocationTags.APPLICATION),
                                        Map.of("Key", "DeploymentName", "Value", "tt-witheight"),
                                        Map.of("Key", "Environment", "Value", "test"),
                                        Map.of("Key", "Stack", "Value", "ObservabilityStack"))))));
    }

    /**
     * The trail must log DynamoDB data events (the security detectors match Scan and GetItem)
     * without the stream poller's GetRecords, and it must not also carry the basic
     * EventSelectors property, which CloudTrail rejects alongside advanced selectors.
     */
    @SuppressWarnings("unchecked")
    private static void assertTrailLogsDynamoDbDataEventsExceptGetRecords(Template template) {
        Map<String, Map<String, Object>> trails = template.findResources("AWS::CloudTrail::Trail");
        assertEquals(1, trails.size());
        Map<String, Object> properties =
                (Map<String, Object>) trails.values().iterator().next().get("Properties");
        assertFalse(properties.containsKey("EventSelectors"), "basic EventSelectors must be absent");
        List<Map<String, Object>> selectors = (List<Map<String, Object>>) properties.get("AdvancedEventSelectors");
        assertEquals(2, selectors.size());
        List<Map<String, Object>> dataFields = selectors.stream()
                .map(selector -> (List<Map<String, Object>>) selector.get("FieldSelectors"))
                .filter(fields -> fields.stream()
                        .anyMatch(field -> "eventCategory".equals(field.get("Field"))
                                && List.of("Data").equals(field.get("Equals"))))
                .findFirst()
                .orElseThrow();
        assertTrue(dataFields.stream()
                .anyMatch(field -> "resources.type".equals(field.get("Field"))
                        && List.of("AWS::DynamoDB::Table").equals(field.get("Equals"))));
        assertTrue(dataFields.stream()
                .anyMatch(field -> "eventName".equals(field.get("Field"))
                        && List.of("GetRecords").equals(field.get("NotEquals"))));
        assertTrue(dataFields.stream().noneMatch(field -> "readOnly".equals(field.get("Field"))));
    }

    /**
     * Asserts every Lambda function carries an explicit {@code LoggingConfig.LogGroup}, so its logs
     * land in a group this stack retains and deletes with it, not an unnamed one CloudWatch creates
     * with no retention on first invoke. The one known exception is CDK's built-in
     * auto-delete-objects handler, which exposes no logGroup option at all.
     */
    @SuppressWarnings("unchecked")
    private static void assertEveryLambdaHasAnExplicitLogGroup(Template template) {
        var missing = new ArrayList<String>();
        template.findResources("AWS::Lambda::Function").forEach((id, resource) -> {
            var properties = (Map<String, Object>) resource.get("Properties");
            var loggingConfig = properties == null ? null : (Map<String, Object>) properties.get("LoggingConfig");
            if (loggingConfig != null && loggingConfig.containsKey("LogGroup")) return;
            var description = String.valueOf(properties == null ? "" : properties.get("Description"));
            if (description.contains("auto-deleting objects")) return;
            missing.add(id);
        });
        assertTrue(missing.isEmpty(), "Lambda functions with no explicit log group: " + missing);
    }

    /**
     * Fail on any inline IAM policy statement that grants on every resource. X-Ray is one
     * exception the CDK Lambda construct forces on us: its actions carry no resource-level
     * permissions at all, so a wildcard there is the narrowest grant that exists. The CloudWatch
     * Logs delivery actions below are the same story for a state machine with {@code logs()}
     * execution logging enabled: CDK grants them itself, and none of them accepts a resource ARN.
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

    private static final List<String> LOG_DELIVERY_ACTIONS = List.of(
            "logs:CreateLogDelivery",
            "logs:GetLogDelivery",
            "logs:UpdateLogDelivery",
            "logs:DeleteLogDelivery",
            "logs:ListLogDeliveries",
            "logs:PutResourcePolicy",
            "logs:DescribeResourcePolicies",
            "logs:DescribeLogGroups");

    private static boolean isResourceLevelExemptAction(Object action) {
        List<?> actions = action instanceof List<?> list ? list : List.of(String.valueOf(action));
        return !actions.isEmpty()
                && actions.stream()
                        .allMatch(a -> String.valueOf(a).startsWith("xray:")
                                || "cloudwatch:PutMetricData".equals(String.valueOf(a))
                                || LOG_DELIVERY_ACTIONS.contains(String.valueOf(a)));
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
