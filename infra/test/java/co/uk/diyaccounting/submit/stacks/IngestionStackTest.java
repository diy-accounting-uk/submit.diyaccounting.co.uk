/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;

class IngestionStackTest {

    private static IngestionStack synthIngestionStack() {
        return synthIngestionStack("docs", null, null);
    }

    // Defaults ga4PropertyId and ga4BigQueryProjectId to placeholder values so tests exercising
    // Stripe-only behaviour, including a "prod" envName, don't trip either blank-in-prod synth
    // failure below. Tests that specifically exercise GA4 wiring call the full overload directly.
    private static IngestionStack synthIngestionStack(
            String envName, String stripeSecretKeyArn, String stripeTestSecretKeyArn) {
        return synthIngestionStack(
                envName, stripeSecretKeyArn, stripeTestSecretKeyArn, "999000111", null, "docs-ga4", null, null);
    }

    private static IngestionStack synthIngestionStack(
            String envName,
            String stripeSecretKeyArn,
            String stripeTestSecretKeyArn,
            String ga4PropertyId,
            String ga4ServiceAccountArn) {
        return synthIngestionStack(
                envName,
                stripeSecretKeyArn,
                stripeTestSecretKeyArn,
                ga4PropertyId,
                ga4ServiceAccountArn,
                "docs-ga4",
                null,
                null);
    }

    private static IngestionStack synthIngestionStack(
            String envName,
            String stripeSecretKeyArn,
            String stripeTestSecretKeyArn,
            String ga4PropertyId,
            String ga4ServiceAccountArn,
            String ga4BigQueryProjectId,
            String ga4BigQueryDatasetId,
            String ga4BigQueryLocation) {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        var builder = IngestionStack.IngestionStackProps.builder()
                .env(Environment.builder()
                        .account("111111111111")
                        .region("eu-west-2")
                        .build())
                .crossRegionReferences(false)
                .envName(envName)
                .deploymentName(envName)
                .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                .cloudTrailEnabled("false")
                .sharedNames(sharedNames)
                .baseImageTag("latest");
        if (stripeSecretKeyArn != null) {
            builder.stripeSecretKeyArn(stripeSecretKeyArn);
        }
        if (stripeTestSecretKeyArn != null) {
            builder.stripeTestSecretKeyArn(stripeTestSecretKeyArn);
        }
        if (ga4PropertyId != null) {
            builder.ga4PropertyId(ga4PropertyId);
        }
        if (ga4ServiceAccountArn != null) {
            builder.ga4ServiceAccountArn(ga4ServiceAccountArn);
        }
        if (ga4BigQueryProjectId != null) {
            builder.ga4BigQueryProjectId(ga4BigQueryProjectId);
        }
        if (ga4BigQueryDatasetId != null) {
            builder.ga4BigQueryDatasetId(ga4BigQueryDatasetId);
        }
        if (ga4BigQueryLocation != null) {
            builder.ga4BigQueryLocation(ga4BigQueryLocation);
        }

        return new IngestionStack(app, "TestIngestionStack-" + envName, builder.build());
    }

    @Test
    void stackWiresTheStripeAndBothGa4JobsByDefault() {
        IngestionStack ingestionStack = synthIngestionStack();
        Template template = Template.fromStack(ingestionStack);

        // Importing the lake bucket by name creates no bucket of its own. The constructor wires
        // three jobs: Stripe reconciliation, the GA4 Data API report pull and the GA4 BigQuery
        // event export pull; nothing else self-registers yet. Every job's function name is
        // stable across every redeploy of this env-scoped stack, so their log groups go through
        // the idempotent AwsCustomResource path, adding one more Lambda function: the shared
        // create-if-missing/retention singleton provider.
        template.resourceCountIs("AWS::S3::Bucket", 0);
        template.resourceCountIs("AWS::Lambda::Function", 4);

        // No per-job schedule, DLQ or DLQ-depth alarm any more: NightlyIngestionWorkflow's one
        // state machine and one scheduler schedule replace them. Three job Errors alarms plus
        // the state machine's ExecutionsFailed alarm; the ExecutionsMissed alarm is prod-only,
        // so a non-prod envName ("docs") gives four alarms, not five.
        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::SQS::Queue", 0);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 4);
        template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
        template.resourceCountIs("AWS::Scheduler::Schedule", 1);

        template.hasResourceProperties(
                "AWS::Lambda::Function", Match.objectLike(Map.of("FunctionName", "docs-env-stripe-reconcile")));
        template.hasResourceProperties(
                "AWS::Lambda::Function", Match.objectLike(Map.of("FunctionName", "docs-env-ga4-report-pull")));
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of("FunctionName", "docs-env-ga4-event-export-pull")));
    }

    @Test
    void stripeReconciliationGetsScopedSecretAndSaltGrantsOnlyWhenArnsAreConfigured() {
        Template unconfigured = Template.fromStack(synthIngestionStack());
        // The salt grant is unconditional, so a secretsmanager:GetSecretValue statement always
        // exists; what must NOT exist without configured ARNs is a Stripe secret grant.
        unconfigured.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "secretsmanager:GetSecretValue",
                                        "Resource",
                                        Match.stringLikeRegexp(".*stripe.*"))))))))),
                0);

        Template configured = Template.fromStack(synthIngestionStack(
                "docs",
                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/stripe/secret_key",
                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/stripe/test_secret_key"));

        // Both the live and test secret grants carry the -* suffix Secrets Manager requires,
        // plus the salt secret grant every hashSub() caller needs.
        configured.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(
                        Map.of(
                                "PolicyDocument",
                                Match.objectLike(
                                        Map.of(
                                                "Statement",
                                                Match.arrayWith(
                                                        List.of(
                                                                Match.objectLike(
                                                                        Map.of(
                                                                                "Action",
                                                                                "secretsmanager:GetSecretValue",
                                                                                "Resource",
                                                                                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/stripe/secret_key-*")),
                                                                Match.objectLike(
                                                                        Map.of(
                                                                                "Action",
                                                                                "secretsmanager:GetSecretValue",
                                                                                "Resource",
                                                                                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/stripe/test_secret_key-*")),
                                                                Match.objectLike(
                                                                        Map.of(
                                                                                "Action",
                                                                                "secretsmanager:GetSecretValue",
                                                                                "Resource",
                                                                                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/user-sub-hash-salt*")))))))));
    }

    @Test
    void stripeReconciliationCanOnlyPutObjectsUnderItsOwnLakePrefix() {
        Template template = Template.fromStack(synthIngestionStack());

        // The bucket is imported by name, so its ARN is an unresolved token: the Resource here
        // synthesizes as an Fn::Join, not a plain string, hence the manual walk rather than a
        // Match.stringLikeRegexp against the whole statement.
        var policies = template.findResources("AWS::IAM::Policy");
        var found = policies.values().stream().anyMatch(policy -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.get("Properties");
            @SuppressWarnings("unchecked")
            var policyDocument = (Map<String, Object>) properties.get("PolicyDocument");
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) policyDocument.get("Statement");
            return statements.stream()
                    .anyMatch(statement -> "s3:PutObject".equals(statement.get("Action"))
                            && endsWithCuratedStripeWildcard(statement.get("Resource")));
        });

        assertTrue(found, "expected an s3:PutObject statement scoped to .../curated/stripe/*");
    }

    private static boolean endsWithCuratedStripeWildcard(Object resource) {
        if (resource instanceof String s) {
            return s.endsWith("/curated/stripe/*");
        }
        if (resource instanceof Map<?, ?> map) {
            var join = (List<?>) map.get("Fn::Join");
            if (join == null || join.size() < 2) return false;
            var parts = (List<?>) join.get(1);
            var last = parts.get(parts.size() - 1);
            return last instanceof String s && s.endsWith("/curated/stripe/*");
        }
        return false;
    }

    @Test
    void registerIngestionJobWiresOnlyAnErrorsAlarmWithNoDlqOrRule() {
        IngestionStack ingestionStack = synthIngestionStack();
        var jobLambda = Function.Builder.create(ingestionStack, "TestJobLambda")
                .functionName("docs-env-test-job")
                .runtime(Runtime.NODEJS_24_X)
                .handler("index.handler")
                .code(Code.fromInline("exports.handler = async () => {};"))
                .build();

        ingestionStack.registerIngestionJob("TestJob", "docs-env-test-job", jobLambda, "Test ingestion job");

        Template template = Template.fromStack(ingestionStack);

        // No DLQ or rule of its own: the nightly state machine invokes every job directly.
        template.resourceCountIs("AWS::SQS::Queue", 0);
        template.resourceCountIs("AWS::Events::Rule", 0);

        // Three pre-existing job alarms plus the state machine's ExecutionsFailed alarm plus
        // this test's own job alarm.
        template.resourceCountIs("AWS::CloudWatch::Alarm", 5);
        var alarms = template.findResources("AWS::CloudWatch::Alarm");
        for (Map<String, Object> alarm : alarms.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) alarm.get("Properties");
            assertFalse(properties.containsKey("AlarmActions"), "alarm should have no SNS action: " + properties);
        }

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName", "docs-env-test-job-errors",
                        "MetricName", "Errors",
                        "Namespace", "AWS/Lambda",
                        "ComparisonOperator", "GreaterThanOrEqualToThreshold",
                        "Threshold", 1)));
    }

    @Test
    void blankGa4PropertyIdFailsSynthInProdButNotElsewhere() {
        assertThrows(
                IllegalStateException.class,
                () -> synthIngestionStack("prod", null, null, null, null),
                "a blank ga4PropertyId in prod must fail synth, not silently run with no property configured");

        // Same blank property id, non-prod envName: synth succeeds, matching the ci-deploys-fine-
        // before-the-operator-creates-the-service-account guarantee the design calls for.
        Template template = Template.fromStack(synthIngestionStack("docs", null, null, null, null));
        template.resourceCountIs("AWS::Lambda::Function", 4);
    }

    @Test
    void blankGa4BigQueryProjectIdFailsSynthInProdButNotElsewhere() {
        assertThrows(
                IllegalStateException.class,
                () -> synthIngestionStack("prod", null, null, "999000111", null, null, null, null),
                "a blank ga4BigQueryProjectId in prod must fail synth, not silently run with the job misconfigured");

        // Same blank project id, non-prod envName: synth succeeds, matching the ci-deploys-fine-
        // before-the-operator-grants-BigQuery-access guarantee the design calls for.
        Template template =
                Template.fromStack(synthIngestionStack("docs", null, null, "999000111", null, null, null, null));
        template.resourceCountIs("AWS::Lambda::Function", 4);
    }

    @Test
    void ga4PropertyIdEnvVarIsOmittedWhenBlankAndPresentWhenConfigured() {
        Template blank = Template.fromStack(synthIngestionStack("docs", null, null, null, null));
        var blankFunctions = blank.findResources(
                "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", "docs-env-ga4-report-pull")));
        assertEquals(1, blankFunctions.size());
        assertFalse(
                environmentVariablesOf(blankFunctions).containsKey("GA4_PROPERTY_ID"),
                "GA4_PROPERTY_ID must not be set when ga4PropertyId is blank");

        Template configured = Template.fromStack(synthIngestionStack("docs", null, null, "523400333", null));
        configured.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        "docs-env-ga4-report-pull",
                        "Environment",
                        Match.objectLike(
                                Map.of("Variables", Match.objectLike(Map.of("GA4_PROPERTY_ID", "523400333")))))));
    }

    @Test
    void ga4ReportPullGetsScopedSecretGrantOnlyWhenArnIsConfigured() {
        Template unconfigured = Template.fromStack(synthIngestionStack());
        unconfigured.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "secretsmanager:GetSecretValue",
                                        "Resource",
                                        Match.stringLikeRegexp(".*ga4.*"))))))))),
                0);

        Template configured = Template.fromStack(synthIngestionStack(
                "docs",
                null,
                null,
                "523400333",
                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/ga4/service_account"));

        configured.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(
                        Map.of(
                                "PolicyDocument",
                                Match.objectLike(
                                        Map.of(
                                                "Statement",
                                                Match.arrayWith(
                                                        List.of(
                                                                Match.objectLike(
                                                                        Map.of(
                                                                                "Action",
                                                                                "secretsmanager:GetSecretValue",
                                                                                "Resource",
                                                                                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/ga4/service_account-*")))))))));
    }

    @Test
    void ga4ReportPullCanOnlyPutObjectsUnderItsOwnLakePrefix() {
        Template template = Template.fromStack(synthIngestionStack());

        // The bucket is imported by name, so its ARN is an unresolved token: the Resource here
        // synthesizes as an Fn::Join, not a plain string, hence the manual walk rather than a
        // Match.stringLikeRegexp against the whole statement.
        var policies = template.findResources("AWS::IAM::Policy");
        var found = policies.values().stream().anyMatch(policy -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.get("Properties");
            @SuppressWarnings("unchecked")
            var policyDocument = (Map<String, Object>) properties.get("PolicyDocument");
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) policyDocument.get("Statement");
            return statements.stream()
                    .anyMatch(statement -> "s3:PutObject".equals(statement.get("Action"))
                            && endsWithCuratedGa4Wildcard(statement.get("Resource")));
        });

        assertTrue(found, "expected an s3:PutObject statement scoped to .../curated/ga4/*");
    }

    private static boolean endsWithCuratedGa4Wildcard(Object resource) {
        if (resource instanceof String s) {
            return s.endsWith("/curated/ga4/*");
        }
        if (resource instanceof Map<?, ?> map) {
            var join = (List<?>) map.get("Fn::Join");
            if (join == null || join.size() < 2) return false;
            var parts = (List<?>) join.get(1);
            var last = parts.get(parts.size() - 1);
            return last instanceof String s && s.endsWith("/curated/ga4/*");
        }
        return false;
    }

    @Test
    void ga4BigQueryConfigEnvVarsAreOmittedWhenBlankAndPresentWhenConfigured() {
        Template blank = Template.fromStack(
                synthIngestionStack("docs", null, null, "999000111", null, null, null, null));
        var blankFunctions = blank.findResources(
                "AWS::Lambda::Function",
                Map.of("Properties", Map.of("FunctionName", "docs-env-ga4-event-export-pull")));
        assertEquals(1, blankFunctions.size());
        var blankEnv = environmentVariablesOf(blankFunctions);
        assertFalse(blankEnv.containsKey("GA4_BIGQUERY_PROJECT_ID"));
        assertFalse(blankEnv.containsKey("GA4_BIGQUERY_DATASET_ID"));
        assertFalse(blankEnv.containsKey("GA4_BIGQUERY_LOCATION"));

        Template configured = Template.fromStack(synthIngestionStack(
                "docs",
                null,
                null,
                "999000111",
                null,
                "diyaccounting-ga4",
                "analytics_523400333",
                "europe-west2"));
        configured.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        "docs-env-ga4-event-export-pull",
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "GA4_BIGQUERY_PROJECT_ID",
                                        "diyaccounting-ga4",
                                        "GA4_BIGQUERY_DATASET_ID",
                                        "analytics_523400333",
                                        "GA4_BIGQUERY_LOCATION",
                                        "europe-west2")))))));
    }

    @Test
    void ga4EventExportPullGetsScopedSecretGrantOnlyWhenArnIsConfigured() {
        Template unconfigured = Template.fromStack(synthIngestionStack());
        unconfigured.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "secretsmanager:GetSecretValue",
                                        "Resource",
                                        Match.stringLikeRegexp(".*ga4.*"))))))))),
                0);

        Template configured = Template.fromStack(synthIngestionStack(
                "docs",
                null,
                null,
                "999000111",
                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/ga4/service_account",
                "diyaccounting-ga4",
                "analytics_523400333",
                "europe-west2"));

        // Both GA4 jobs share the same service-account secret, so this ARN grant now appears
        // on two Lambda roles: the pre-existing ga4ReportPull grant plus this job's own.
        configured.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "secretsmanager:GetSecretValue",
                                        "Resource",
                                        "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/ga4/service_account-*")))))))),
                2);
    }

    @Test
    void ga4EventExportPullCanOnlyPutObjectsUnderItsOwnLakePrefix() {
        Template template = Template.fromStack(synthIngestionStack());

        var policies = template.findResources("AWS::IAM::Policy");
        var found = policies.values().stream().anyMatch(policy -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.get("Properties");
            @SuppressWarnings("unchecked")
            var policyDocument = (Map<String, Object>) properties.get("PolicyDocument");
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) policyDocument.get("Statement");
            return statements.stream()
                    .anyMatch(statement -> "s3:PutObject".equals(statement.get("Action"))
                            && endsWithCuratedGa4BqWildcard(statement.get("Resource")));
        });

        assertTrue(found, "expected an s3:PutObject statement scoped to .../curated/ga4_bq/*");
    }

    private static boolean endsWithCuratedGa4BqWildcard(Object resource) {
        if (resource instanceof String s) {
            return s.endsWith("/curated/ga4_bq/*");
        }
        if (resource instanceof Map<?, ?> map) {
            var join = (List<?>) map.get("Fn::Join");
            if (join == null || join.size() < 2) return false;
            var parts = (List<?>) join.get(1);
            var last = parts.get(parts.size() - 1);
            return last instanceof String s && s.endsWith("/curated/ga4_bq/*");
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> environmentVariablesOf(Map<String, Map<String, Object>> functions) {
        var resource = functions.values().iterator().next();
        var properties = (Map<String, Object>) resource.get("Properties");
        var environment = (Map<String, Object>) properties.get("Environment");
        return (Map<String, Object>) environment.get("Variables");
    }
}
