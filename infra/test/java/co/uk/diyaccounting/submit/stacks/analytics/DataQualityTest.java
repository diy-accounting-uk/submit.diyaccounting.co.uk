/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.s3.Bucket;

/**
 * Instantiates {@link DataQuality} standalone in a throwaway stack, the way a
 * concurrently-edited {@code AnalyticsStack.java} cannot be relied on to do yet. This keeps the
 * construct's own tests independent of how (or whether) it has been wired in.
 */
class DataQualityTest {

    private Template synthDataQuality() {
        App app = new App();
        Stack stack = new Stack(
                app,
                "TestStack",
                StackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .build());

        var lakeBucket = Bucket.fromBucketName(stack, "LakeBucket", "docs-env-analytics-lake-111111111111");

        var props = DataQuality.DataQualityProps.builder()
                .envName("docs")
                .resourceNamePrefix("docs-env")
                .glueDatabaseName("docs_env_analytics")
                .lakeBucket(lakeBucket)
                .baseImageTag("test-tag")
                .ecrRepositoryArn("arn:aws:ecr:eu-west-2:111111111111:repository/docs-env-ecr")
                .ecrRepositoryName("docs-env-ecr")
                .build();

        new DataQuality(stack, "DataQuality", props);

        return Template.fromStack(stack);
    }

    @Test
    void createsOneRulesetPerTarget() {
        Template template = synthDataQuality();

        template.resourceCountIs("AWS::Glue::DataQualityRuleset", 6);
        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(Map.of(
                        "Name",
                        "docs_env_activity_events_dq",
                        "TargetTable",
                        Match.objectLike(
                                Map.of("DatabaseName", "docs_env_analytics", "TableName", "activity_events")))));
        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(Map.of(
                        "Name",
                        "docs_env_alarm_state_changes_dq",
                        "TargetTable",
                        Match.objectLike(
                                Map.of("DatabaseName", "docs_env_analytics", "TableName", "alarm_state_changes")))));
        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(Map.of(
                        "Name",
                        "docs_env_dora_runs_dq",
                        "TargetTable",
                        Match.objectLike(Map.of("DatabaseName", "docs_env_analytics", "TableName", "dora_runs")))));
        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(Map.of(
                        "Name",
                        "docs_env_compliance_accessibility_dq",
                        "TargetTable",
                        Match.objectLike(Map.of(
                                "DatabaseName", "docs_env_analytics", "TableName", "compliance_accessibility")))));
        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(Map.of(
                        "Name",
                        "docs_env_compliance_fraud_headers_dq",
                        "TargetTable",
                        Match.objectLike(Map.of(
                                "DatabaseName", "docs_env_analytics", "TableName", "compliance_fraud_headers")))));
    }

    @Test
    void alarmStateChangesAndDoraRunsRulesetsCarryTheirRules() {
        Template template = synthDataQuality();

        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(Map.of(
                        "Name",
                        "docs_env_alarm_state_changes_dq",
                        "Ruleset",
                        Match.stringLikeRegexp(
                                "[\\s\\S]*RowCount > 0[\\s\\S]*ALARM[\\s\\S]*OK[\\s\\S]*INSUFFICIENT_DATA[\\s\\S]*"))));
        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(Map.of(
                        "Name",
                        "docs_env_dora_runs_dq",
                        "Ruleset",
                        Match.stringLikeRegexp("[\\s\\S]*RowCount > 0[\\s\\S]*finished_at[\\s\\S]*"))));
    }

    @Test
    void rulesetListsAllSixActorValuesAndTheFreshnessAndOutcomeChecks() {
        Template template = synthDataQuality();

        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(
                        Map.of(
                                "Ruleset",
                                Match.stringLikeRegexp(
                                        "[\\s\\S]*customer[\\s\\S]*test-user[\\s\\S]*synthetic[\\s\\S]*probe[\\s\\S]*system[\\s\\S]*visitor[\\s\\S]*ai-agent[\\s\\S]*"))));
        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(Map.of(
                        "Ruleset",
                        Match.stringLikeRegexp(
                                "[\\s\\S]*ColumnValues \"outcome\"[\\s\\S]*threshold < 0\\.2[\\s\\S]*"))));
        template.hasResourceProperties(
                "AWS::Glue::DataQualityRuleset",
                Match.objectLike(Map.of(
                        "Ruleset", Match.stringLikeRegexp("[\\s\\S]*event_ts[\\s\\S]*now\\(\\) - 2 days[\\s\\S]*"))));
    }

    @Test
    void noScheduleRuleOrDlqOfItsOwn() {
        Template template = synthDataQuality();

        // No schedule or DLQ: IngestionStack's NightlyIngestionWorkflow state machine invokes
        // this construct's run Lambda directly as one step in the nightly chain.
        template.resourceCountIs("AWS::Events::Rule", 0);
        template.resourceCountIs("AWS::SQS::Queue", 0);
        // The run function name is stable across every redeploy of this env-scoped stack, so its
        // log group goes through the idempotent AwsCustomResource path, adding a second Lambda
        // function: the shared create-if-missing/retention singleton provider.
        template.resourceCountIs("AWS::Lambda::Function", 2);
    }

    @Test
    void alarmsCarryNoSnsActionAndOneFailedAlarmPerTargetWatchesTheGlueDataQualityMetric() {
        Template template = synthDataQuality();

        // One errors alarm plus one Glue-published rules-failed alarm per target; no DLQ-depth alarm.
        template.resourceCountIs("AWS::CloudWatch::Alarm", 7);

        var alarms = template.findResources("AWS::CloudWatch::Alarm");
        for (var resource : alarms.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            assertTrue(
                    properties.get("AlarmActions") == null,
                    "no alarm in this construct should carry an SNS action: " + properties);
        }

        for (String rulesetName : List.of(
                "docs_env_activity_events_dq",
                "docs_env_alarm_state_changes_dq",
                "docs_env_dora_runs_dq",
                "docs_env_compliance_accessibility_dq",
                "docs_env_compliance_fraud_headers_dq")) {
            template.hasResourceProperties(
                    "AWS::CloudWatch::Alarm",
                    Match.objectLike(Map.of(
                            "Namespace",
                            "Glue Data Quality",
                            "MetricName",
                            "glue.data.quality.rules.failed",
                            "Dimensions",
                            List.of(Map.of("Name", "RulesetName", "Value", rulesetName)))));
        }
    }

    @Test
    void runnerLambdaGrantsStartEvaluationAndScopedPassRole() {
        Template template = synthDataQuality();

        template.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(
                                        Map.of("Action", "glue:StartDataQualityRulesetEvaluationRun")))))))));

        template.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "iam:PassRole",
                                        "Condition",
                                        Match.objectLike(
                                                Map.of(
                                                        "StringEquals",
                                                        Map.of("iam:PassedToService", "glue.amazonaws.com"))))))))))));
    }

    @Test
    void runnerLambdaGrantsPartitionRegistrationAndScopedListBucket() {
        Template template = synthDataQuality();

        template.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        Match.arrayWith(
                                                List.of("glue:GetPartitions", "glue:BatchCreatePartition")))))))))));

        var expectedPrefixes = List.of(
                "curated/activity-events/*",
                "curated/alarm-state-changes/*",
                "curated/dora/*",
                "curated/compliance/accessibility/*",
                "curated/compliance/fraud-headers/*",
                "curated/cost/focus/*");
        var expectedCondition = Match.objectLike(Map.of("StringLike", Map.of("s3:prefix", expectedPrefixes)));
        var expectedStatement = Match.objectLike(Map.of("Action", "s3:ListBucket", "Condition", expectedCondition));
        var expectedDocument = Match.objectLike(Map.of("Statement", Match.arrayWith(List.of(expectedStatement))));

        template.hasResourceProperties(
                "AWS::IAM::Policy", Match.objectLike(Map.of("PolicyDocument", expectedDocument)));
    }

    @Test
    void evaluationRoleCanWriteItsOwnContinuousLoggingLogGroup() {
        Template template = synthDataQuality();

        // Glue sets up continuous logging for the evaluation run before it evaluates anything,
        // against a log group fixed by Glue itself rather than named by this stack.
        template.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        Match.arrayWith(List.of(
                                                "logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents")),
                                        "Resource",
                                        "arn:aws:logs:eu-west-2:111111111111:log-group:/aws-glue/jobs/logs-v2:*")))))))));
    }

    @Test
    void runnerLambdaEnvironmentCarriesLakeBucketAndEveryTarget() {
        Template template = synthDataQuality();

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "ANALYTICS_LAKE_BUCKET_NAME", "docs-env-analytics-lake-111111111111")))))));

        var functions = template.findResources("AWS::Lambda::Function");
        boolean found = false;
        for (Map<String, Object> function : functions.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) function.get("Properties");
            if (properties == null) continue;
            @SuppressWarnings("unchecked")
            var environment = (Map<String, Object>) properties.get("Environment");
            if (environment == null) continue;
            @SuppressWarnings("unchecked")
            var variables = (Map<String, Object>) environment.get("Variables");
            if (variables == null || !variables.containsKey("GLUE_DATA_QUALITY_TARGETS")) continue;

            found = true;
            String json = String.valueOf(variables.get("GLUE_DATA_QUALITY_TARGETS"));
            for (String tableName : List.of(
                    "activity_events",
                    "alarm_state_changes",
                    "dora_runs",
                    "compliance_accessibility",
                    "compliance_fraud_headers")) {
                assertTrue(
                        json.contains(tableName), "expected " + tableName + " in GLUE_DATA_QUALITY_TARGETS: " + json);
            }
        }
        assertTrue(found, "Expected one Lambda function with a GLUE_DATA_QUALITY_TARGETS environment variable");
    }

    @Test
    void noIamPolicyStatementGrantsOnEveryResourceExceptTheConditionedGlueMetricsGrant() {
        Template template = synthDataQuality();

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
                if (isExemptAction(statement.get("Action"))) continue;
                offenders.add(policy.getKey() + " " + statement.get("Action"));
            }
        }
        assertTrue(offenders.isEmpty(), "IAM statements granting on every resource: " + offenders);
    }

    private static boolean isExemptAction(Object action) {
        List<?> actions = action instanceof List<?> list ? list : List.of(String.valueOf(action));
        return !actions.isEmpty()
                && actions.stream()
                        .allMatch(a -> String.valueOf(a).startsWith("xray:") || "cloudwatch:PutMetricData".equals(a));
    }
}
