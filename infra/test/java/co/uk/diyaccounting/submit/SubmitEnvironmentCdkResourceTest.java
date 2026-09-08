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

        // 6) Data stack creates DynamoDB tables + 2 GSIs + TTL via AwsCustomResource, and PITR via
        // a Provider-backed custom resource, for idempotent deployments, including
        // hmrcItsaBusinessDetailsGetAsyncRequests
        // PITR: every table (Custom::EnsurePitr, not Custom::AWS - see KindCdk.ensurePitrProvider)
        // GSIs: passes issuedBy-index, bundles bundleId-expiry-index
        // Streams: receipts, bundles, passes, subscriptions (one UpdateTable to enable, one
        //      DescribeTable to read the stream ARN)
        Template.fromStack(env.dataStack).resourceCountIs("Custom::AWS", 51);
        Template.fromStack(env.dataStack).resourceCountIs("Custom::EnsurePitr", 22);

        // 8) Observability stack should enable CloudTrail (Trail present), covering every region
        // so the WAF, the RUM monitor and the canaries' us-east-1 activity are seen too.
        Template observability = Template.fromStack(env.observabilityStack);
        observability.resourceCountIs("AWS::CloudTrail::Trail", 1);
        observability.hasResourceProperties(
                "AWS::CloudTrail::Trail",
                Match.objectLike(Map.of("IsMultiRegionTrail", true, "IncludeGlobalServiceEvents", true)));
        assertTrailLogsDynamoDbDataEventsExceptGetRecords(observability);

        // Security Hub's default standards are off in ObservabilityStack: SecurityBaselineStack
        // manages the CIS v5.0.0 and AWS Foundational Security Best Practices subscriptions
        // instead of the Hub auto-enabling CIS v1.2.0 on creation.
        observability.hasResourceProperties(
                "AWS::SecurityHub::Hub", Match.objectLike(Map.of("EnableDefaultStandards", false)));

        // 8a) SecurityBaselineStack: the Config recorder, its delivery channel and bucket, and
        // the standards-swap custom resources (disable CIS v1.2.0, enable CIS v5.0.0, keep AWS
        // Foundational Security Best Practices).
        Template securityBaseline = Template.fromStack(env.securityBaselineStack);
        securityBaseline.resourceCountIs("AWS::Config::ConfigurationRecorder", 1);
        securityBaseline.resourceCountIs("AWS::Config::DeliveryChannel", 1);
        securityBaseline.resourceCountIs("AWS::IAM::ServiceLinkedRole", 1);
        securityBaseline.hasResourceProperties(
                "AWS::Config::ConfigurationRecorder",
                Match.objectLike(Map.of(
                        "RecordingGroup",
                        Match.objectLike(Map.of("AllSupported", true, "IncludeGlobalResourceTypes", true)))));
        assertSecurityHubStandardsSwap(securityBaseline);

        // 8b) SecurityLakeStack: the nightly Security Hub, GuardDuty, GitHub alert, lifecycle,
        // WAF and rotation pull into the analytics lake, one Glue table per source.
        Template securityLake = Template.fromStack(env.securityLakeStack);
        securityLake.resourceCountIs("AWS::Glue::Table", 7);
        securityLake.resourceCountIs("AWS::Lambda::Function", 1);
        securityLake.resourceCountIs("AWS::Events::Rule", 1);
        securityLake.resourceCountIs("AWS::CloudWatch::Alarm", 3);
        securityLake.resourceCountIs("AWS::CloudWatch::CompositeAlarm", 1);

        // One alarm per environment for the GitHub Actions probe test, not one per deployment:
        // it lives here instead of in the per-deployment OpsStack so a new deployment doesn't
        // create a fresh alarm (and a fresh GitHub issue) against this environment-wide metric.
        // Alongside RumLcpP75Alarm, RumJsErrorAlarm, BundleCapReachedAlarm and
        // HmrcSubmissionFailureAlarm, that's 5 alarms total.
        observability.resourceCountIs("AWS::CloudWatch::Alarm", 5);
        observability.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "test-env-github-probe-failed",
                        "Namespace", "test-submit.diyaccounting.co.uk",
                        "MetricName", "behaviour-test",
                        "Period", 18000,
                        "EvaluationPeriods", 1,
                        "ComparisonOperator", "GreaterThanOrEqualToThreshold",
                        "TreatMissingData", "breaching")));

        // 8b) Alarm triage: the read-only role denies customer data even if a later change widens
        // an Allow, its Bedrock Allow names only the two pinned models, and the guardrail and both
        // of its SSM parameters exist.
        assertAlarmTriageResources(observability);

        // 8c) Operations dashboard: nine widgets across four rows plus the RUM and probe rows,
        // narrowed to the live deployment (a CloudFormation dynamic reference to the
        // last-known-good-deployment SSM parameter, not a bare "test-" prefix matching every
        // retired deployment's functions), with the business widgets moved to the analytics
        // dashboard and one deliberate duplicate (VAT submissions) kept here.
        assertOperationsDashboardScopedToLiveDeployment(observability);

        // The stack's composite health alarm routes through OpsStack's AlarmStateChangeRule, which matches
        // this environment's shared-alarm prefix `{envName}-env-` (OpsStack itself is an app-level
        // stack and isn't synthesized here, so this mirrors SubmitSharedNames.envResourceNamePrefix
        // for the fixed ENVIRONMENT_NAME=test config above, the same way "test-env-activity-bus" is
        // hardcoded below).
        List<String> envRoutedPrefixes = List.of("test-env-");

        // 8c) Activity stack: one Telegram forwarder Lambda and the one bus-wide catch-all rule
        // that targets it, shared by every deployment's OpsStack instead of one copy per
        // deployment (each deployment's own alarm-state-change and stack-status rules still
        // target this same imported Lambda; that stays covered by OpsStackTest since OpsStack
        // isn't synthesized here).
        Template activity = Template.fromStack(env.activityStack);
        activity.resourceCountIs("AWS::Lambda::Function", 1);
        activity.resourceCountIs("AWS::Events::Rule", 1);
        activity.hasResourceProperties(
                "AWS::Events::Rule",
                Match.objectLike(Map.of(
                        "Name",
                        "test-env-activity-telegram",
                        "EventPattern",
                        Match.objectLike(Map.of("detail-type", List.of("ActivityEvent"))))));
        SubmitApplicationCdkResourceTest.assertStackHealthAlarm(activity, 1, 0, envRoutedPrefixes);

        // The Telegram forwarder reads a deployment's alarm-silence marker so a deployment
        // mid-teardown's ALARM events are dropped instead of forwarded.
        List<Map<String, Object>> alarmSilenceStatements =
                findPolicyStatementsContainingSid(activity, "ReadAlarmSilence");
        Map<String, Object> alarmSilenceStatement = alarmSilenceStatements.stream()
                .filter(s -> "ReadAlarmSilence".equals(s.get("Sid")))
                .findFirst()
                .orElseThrow();
        assertEquals("ssm:GetParameter", alarmSilenceStatement.get("Action"));
        assertTrue(
                String.valueOf(alarmSilenceStatement.get("Resource")).endsWith("parameter/submit/test/alarm-silence/*"),
                "expected the test alarm-silence prefix, got " + alarmSilenceStatement.get("Resource"));

        // 9) Analytics stack: one delivery stream into the lake, catalogued once and queryable
        Template analytics = Template.fromStack(env.analyticsStack);
        analytics.resourceCountIs("AWS::KinesisFirehose::DeliveryStream", 6);
        analytics.resourceCountIs("AWS::Lambda::EventSourceMapping", 4);
        analytics.resourceCountIs("AWS::Glue::Database", 1);
        analytics.resourceCountIs("AWS::Glue::DataQualityRuleset", 5);
        analytics.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
        analytics.resourceCountIs("AWS::Glue::Table", 27);
        analytics.resourceCountIs("AWS::Athena::WorkGroup", 1);
        analytics.resourceCountIs("AWS::Athena::NamedQuery", 23);
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

        SubmitApplicationCdkResourceTest.assertStackHealthAlarm(analytics, 3, 0, envRoutedPrefixes);

        // 10) Ingestion stack: the Stripe reconciliation, GA4 report pull, GA4 BigQuery event
        // export pull and GA4 daily aggregate pull jobs, each with an Errors alarm only, invoked
        // by the NightlyIngestionWorkflow state machine (one Step Functions state machine, one
        // EventBridge Scheduler schedule,
        // one ExecutionsFailed alarm - ExecutionsMissed is prod-only, so not here). Importing the
        // lake bucket by name creates no bucket of its own. Every job's name is stable across
        // redeploys, so their log groups go through the idempotent AwsCustomResource path,
        // adding the shared singleton provider.
        Template ingestion = Template.fromStack(env.ingestionStack);
        ingestion.resourceCountIs("AWS::S3::Bucket", 0);
        ingestion.resourceCountIs("AWS::Lambda::Function", 6);
        ingestion.resourceCountIs("AWS::Events::Rule", 0);
        ingestion.resourceCountIs("AWS::SQS::Queue", 0);
        ingestion.resourceCountIs("AWS::CloudWatch::Alarm", 6);
        ingestion.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
        ingestion.resourceCountIs("AWS::Scheduler::Schedule", 1);
        assertNoUnscopedIamResources(ingestion);

        // BillingWebhookStack only synthesizes when a regional API Gateway custom-domain
        // certificate is configured; this test's config doesn't set one.
        if (env.billingWebhookStack != null) {
            Template billingWebhook = Template.fromStack(env.billingWebhookStack);
            SubmitApplicationCdkResourceTest.assertStackHealthAlarm(billingWebhook, 1, 0, envRoutedPrefixes);
        }

        // Every Lambda function across the environment stacks must route its logs to an explicit,
        // retained log group — otherwise CDK (or, for AwsCustomResource, CloudFormation's own
        // provider framework) gives it an unnamed one with no retention and no removal policy, and
        // it outlives the stack. The one known exception is CDK's built-in auto-delete-objects
        // handler, which exposes no logGroup option at all.
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(env.observabilityStack));
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(env.dataStack));
        assertEveryLambdaHasAnExplicitLogGroup(activity);
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
     * The CIS v1.2.0 -> v5.0.0 swap runs as three {@code Custom::AWS} resources sharing one
     * provider: disable the v1.2.0 subscription, enable v5.0.0, and (re-)enable AWS Foundational
     * Security Best Practices so it stays subscribed either way.
     */
    @SuppressWarnings("unchecked")
    private static void assertSecurityHubStandardsSwap(Template template) {
        var customResources = template.findResources("Custom::AWS");
        var calls = customResources.values().stream()
                .map(resource -> (Map<String, Object>) resource.get("Properties"))
                .map(properties -> String.valueOf(properties.get("Create")))
                .toList();

        assertTrue(
                calls.stream().anyMatch(call -> call.contains("batchDisableStandards")
                        && call.contains("cis-aws-foundations-benchmark/v/1.2.0")),
                "expected a Custom::AWS resource disabling the CIS v1.2.0 standard");
        assertTrue(
                calls.stream().anyMatch(call -> call.contains("batchEnableStandards")
                        && call.contains("cis-aws-foundations-benchmark/v/5.0.0")),
                "expected a Custom::AWS resource enabling the CIS v5.0.0 standard");
        assertTrue(
                calls.stream().anyMatch(call -> call.contains("batchEnableStandards")
                        && call.contains("aws-foundational-security-best-practices/v/1.0.0")),
                "expected a Custom::AWS resource keeping AWS Foundational Security Best Practices enabled");
    }

    /**
     * The Errors, Throttles, p95 Duration and VAT-submissions widgets all resolve the live
     * deployment from the last-known-good-deployment SSM parameter rather than a bare
     * per-environment prefix (which matched every retired deployment's functions and broke
     * CloudWatch's 500-series SEARCH limit); the four widgets that moved to the business
     * dashboard are gone from this one.
     */
    @SuppressWarnings("unchecked")
    private static void assertOperationsDashboardScopedToLiveDeployment(Template observability) {
        Map<String, Map<String, Object>> dashboards = observability.findResources("AWS::CloudWatch::Dashboard");
        assertEquals(1, dashboards.size());
        var properties = (Map<String, Object>) dashboards.values().iterator().next().get("Properties");
        var dashboardBody = String.valueOf(properties.get("DashboardBody"));

        // StringParameter.valueForStringParameter renders as a Ref to an
        // AWS::SSM::Parameter::Value<String> template parameter, whose logical id is the SSM
        // parameter's path with punctuation stripped.
        assertTrue(
                dashboardBody.contains("lastknowngooddeployment"),
                "expected the live deployment name to come from the last-known-good-deployment SSM parameter, got: "
                        + dashboardBody);

        assertTrue(dashboardBody.contains("VAT Submissions (live deployment)"));
        assertTrue(dashboardBody.contains("Active Bundle Allocations (reconciled)"));
        assertTrue(dashboardBody.contains("Lambda Errors (live deployment)"));
        assertTrue(dashboardBody.contains("Lambda Throttles (live deployment)"));
        assertTrue(dashboardBody.contains("Lambda p95 Duration (live deployment)"));

        assertFalse(dashboardBody.contains("HMRC Authentications"));
        assertFalse(dashboardBody.contains("Bundle Operations"));
        assertFalse(dashboardBody.contains("Sign-ups & Cognito Auth"));
        assertFalse(dashboardBody.contains("Bundle Grants & Cap Enforcement"));
        assertFalse(dashboardBody.contains("all deployments"));
    }

    /**
     * Asserts the alarm-triage role's Deny statement still covers customer data, its Bedrock Allow
     * names only the two pinned models and their inference profiles, and the guardrail plus both of
     * its SSM parameters exist, matching the fixed ENVIRONMENT_NAME=test config this test class uses.
     */
    @SuppressWarnings("unchecked")
    private static void assertAlarmTriageResources(Template observability) {
        observability.hasResourceProperties(
                "AWS::IAM::Role", Match.objectLike(Map.of("RoleName", "test-env-alarm-triage-role")));

        List<Map<String, Object>> statements = findPolicyStatementsContainingSid(observability, "DenyCustomerData");

        Map<String, Object> denyStatement = statements.stream()
                .filter(s -> "DenyCustomerData".equals(s.get("Sid")))
                .findFirst()
                .orElseThrow();
        assertEquals("Deny", denyStatement.get("Effect"));
        assertTrue(((List<String>) denyStatement.get("Action")).contains("dynamodb:*"));
        assertTrue(
                statements.stream()
                        .filter(s -> "Allow".equals(s.get("Effect")))
                        .noneMatch(s -> actionsOf(s).stream().anyMatch(a -> a.startsWith("dynamodb:"))),
                "no Allow statement on the triage role may grant a dynamodb action");

        Map<String, Object> invokeModelStatement = statements.stream()
                .filter(s -> "InvokeTriageModel".equals(s.get("Sid")))
                .findFirst()
                .orElseThrow();
        List<Object> invokeModelResources = (List<Object>) invokeModelStatement.get("Resource");
        assertEquals(4, invokeModelResources.size());
        List<String> resolvedInvokeModelResources =
                invokeModelResources.stream().map(SubmitEnvironmentCdkResourceTest::resolveAccountToken).toList();
        assertTrue(resolvedInvokeModelResources.containsAll(List.of(
                "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0",
                "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
                "arn:aws:bedrock:*:111111111111:inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
                "arn:aws:bedrock:*:111111111111:inference-profile/eu.anthropic.claude-haiku-4-5-20251001-v1:0")));

        Map<String, Object> subscribeMarketplaceStatement = statements.stream()
                .filter(s -> "SubscribeMarketplaceModel".equals(s.get("Sid")))
                .findFirst()
                .orElseThrow();
        assertEquals("Allow", subscribeMarketplaceStatement.get("Effect"));
        assertEquals(
                List.of("aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"),
                actionsOf(subscribeMarketplaceStatement));
        assertEquals("*", subscribeMarketplaceStatement.get("Resource"));

        Map<String, Map<String, Object>> guardrails = observability.findResources("AWS::Bedrock::Guardrail");
        assertEquals(1, guardrails.size());
        Map<String, Object> guardrailProperties =
                (Map<String, Object>) guardrails.values().iterator().next().get("Properties");
        assertEquals("test-env-alarm-triage-guardrail", guardrailProperties.get("Name"));
        Map<String, Object> sensitiveInformationPolicyConfig =
                (Map<String, Object>) guardrailProperties.get("SensitiveInformationPolicyConfig");
        List<Map<String, Object>> piiEntitiesConfig =
                (List<Map<String, Object>>) sensitiveInformationPolicyConfig.get("PiiEntitiesConfig");
        List<Map<String, Object>> regexesConfig =
                (List<Map<String, Object>>) sensitiveInformationPolicyConfig.get("RegexesConfig");
        assertEquals(10, piiEntitiesConfig.size());
        assertTrue(piiEntitiesConfig.stream().allMatch(entity -> "ANONYMIZE".equals(entity.get("Action"))));
        assertEquals(2, regexesConfig.size());
        assertTrue(regexesConfig.stream().anyMatch(regex -> "hashed-sub".equals(regex.get("Name"))));
        assertTrue(regexesConfig.stream().anyMatch(regex -> "vat-registration-number".equals(regex.get("Name"))));
        assertTrue(regexesConfig.stream().allMatch(regex -> "ANONYMIZE".equals(regex.get("Action"))));

        observability.hasResourceProperties(
                "AWS::SSM::Parameter", Match.objectLike(Map.of("Name", "/submit/test/alarm-triage/guardrail-id")));
        observability.hasResourceProperties(
                "AWS::SSM::Parameter",
                Match.objectLike(Map.of("Name", "/submit/test/alarm-triage/guardrail-version")));
    }

    /**
     * Finds the {@code AWS::IAM::Policy} whose statements include one carrying the given Sid, and
     * returns that policy's full statement list. Fails loudly rather than returning an empty list so
     * a renamed Sid breaks the test that depends on it instead of silently asserting nothing.
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> findPolicyStatementsContainingSid(Template template, String sid) {
        for (Map<String, Object> policy : template.findResources("AWS::IAM::Policy").values()) {
            Map<String, Object> properties = (Map<String, Object>) policy.get("Properties");
            Map<String, Object> document = (Map<String, Object>) properties.get("PolicyDocument");
            List<Map<String, Object>> statements = (List<Map<String, Object>>) document.get("Statement");
            if (statements.stream().anyMatch(statement -> sid.equals(statement.get("Sid")))) {
                return statements;
            }
        }
        throw new AssertionError("no IAM::Policy statement carries Sid " + sid);
    }

    /** Normalises a statement's Action, which CDK renders as a bare string when there is only one. */
    @SuppressWarnings("unchecked")
    private static List<String> actionsOf(Map<String, Object> statement) {
        Object action = statement.get("Action");
        return action instanceof List<?> list ? (List<String>) list : List.of(String.valueOf(action));
    }

    /**
     * Resolves one ARN resource entry back to a plain string. This stack's account/region are not
     * bound to a literal {@code Environment} at the CDK level (see {@code
     * ObservabilityStack(Construct, String, StackProps, ObservabilityStackProps)}, which passes the
     * incoming {@code stackProps} - null from the two-arg constructor every caller uses - straight to
     * {@code super()} instead of building one from {@code props.getEnv()}), so {@code
     * this.getAccount()} is the {@code AWS::AccountId} pseudo parameter rather than a literal, and any
     * ARN built from it renders as an {@code Fn::Join} here rather than a plain string. This test's
     * fixed CDK_DEFAULT_ACCOUNT (111111111111) is substituted back in so the assertions can compare
     * against the same literal ARNs the plan specifies.
     */
    @SuppressWarnings("unchecked")
    private static String resolveAccountToken(Object resource) {
        if (resource instanceof String s) {
            return s;
        }
        Map<String, Object> fnJoin = (Map<String, Object>) resource;
        List<Object> joinArgs = (List<Object>) fnJoin.get("Fn::Join");
        List<Object> parts = (List<Object>) joinArgs.get(1);
        StringBuilder resolved = new StringBuilder();
        for (Object part : parts) {
            resolved.append(part instanceof String s ? s : "111111111111");
        }
        return resolved.toString();
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
