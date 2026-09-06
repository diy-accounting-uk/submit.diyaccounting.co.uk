/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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

/**
 * The us-east-1 equivalent of {@link SubmitEnvironmentCdkResourceTest}'s alarm-triage assertions:
 * the daily Bedrock budget, its deny action, and the deny policy live in {@code
 * ObservabilityUE1Stack}, which this environment's App synthesizes into us-east-1 alongside the
 * eu-west-2 stacks.
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
class SubmitEnvironmentUE1CdkResourceTest {

    @Test
    void shouldCreateAlarmTriageBudgetResourcesInUsEast1() throws IOException {
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

        Template observabilityUE1 = Template.fromStack(env.observabilityUE1Stack);

        // 6) Two budgets, not one: AWS Budgets Actions reject a DAILY budget, so the deny action
        // sits on a MONTHLY budget at USD 150 (30 days of the operator's USD 5/day figure). A
        // second, DAILY budget at USD 5 carries no action, only a notification to the same topic,
        // so a bad day is still heard about before the monthly enforcement would trip.
        observabilityUE1.hasResourceProperties(
                "AWS::Budgets::Budget",
                Match.objectLike(Map.of(
                        "Budget",
                        Match.objectLike(Map.of(
                                "BudgetName",
                                "test-env-bedrock-monthly",
                                "BudgetType",
                                "COST",
                                "TimeUnit",
                                "MONTHLY",
                                "BudgetLimit",
                                Match.objectLike(Map.of("Amount", 150, "Unit", "USD")))))));

        var dailyBudgetNotification = Match.objectLike(Map.of(
                "Subscribers", Match.arrayWith(List.of(Match.objectLike(Map.of("SubscriptionType", "SNS"))))));
        observabilityUE1.hasResourceProperties(
                "AWS::Budgets::Budget",
                Match.objectLike(Map.of(
                        "Budget",
                        Match.objectLike(Map.of(
                                "BudgetName",
                                "test-env-bedrock-daily",
                                "BudgetType",
                                "COST",
                                "TimeUnit",
                                "DAILY",
                                "BudgetLimit",
                                Match.objectLike(Map.of("Amount", 5, "Unit", "USD")))),
                        "NotificationsWithSubscribers",
                        Match.arrayWith(List.of(dailyBudgetNotification)))));

        // 7) The budget action names the same role-name string the environment stack used for the
        // triage role (SubmitSharedNames.alarmTriageRoleName), not a CDK cross-stack reference, and
        // sits on the monthly budget, not the daily one.
        observabilityUE1.hasResourceProperties(
                "AWS::Budgets::BudgetsAction",
                Match.objectLike(Map.of(
                        "BudgetName",
                        "test-env-bedrock-monthly",
                        "ActionType",
                        "APPLY_IAM_POLICY",
                        "Definition",
                        Match.objectLike(Map.of(
                                "IamActionDefinition",
                                Match.objectLike(
                                        Map.of("Roles", List.of("test-env-alarm-triage-role"))))))));

        // 8) The deny managed policy denies both Bedrock invoke actions, attached to nothing at
        // deploy time - the budget action attaches it once the account crosses the threshold.
        Map<String, Map<String, Object>> managedPolicies =
                observabilityUE1.findResources("AWS::IAM::ManagedPolicy");
        Map<String, Object> denyPolicy = managedPolicies.values().stream()
                .filter(resource -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return "test-env-alarm-triage-bedrock-deny".equals(properties.get("ManagedPolicyName"));
                })
                .findFirst()
                .orElseThrow();
        @SuppressWarnings("unchecked")
        var denyPolicyProperties = (Map<String, Object>) denyPolicy.get("Properties");
        @SuppressWarnings("unchecked")
        var denyPolicyDocument = (Map<String, Object>) denyPolicyProperties.get("PolicyDocument");
        @SuppressWarnings("unchecked")
        var denyStatements = (List<Map<String, Object>>) denyPolicyDocument.get("Statement");
        assertEquals(1, denyStatements.size());
        Map<String, Object> denyStatement = denyStatements.get(0);
        assertEquals("Deny", denyStatement.get("Effect"));
        @SuppressWarnings("unchecked")
        var deniedActions = (List<String>) denyStatement.get("Action");
        assertTrue(deniedActions.containsAll(List.of("bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream")));
    }

    @Test
    void shouldForwardBedrockBudgetAlertsToTheSharedActivityBusInUsEast1() throws IOException {
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

        Template observabilityUE1 = Template.fromStack(env.observabilityUE1Stack);

        // The bridge Lambda: no per-deployment OpsStack equivalent exists in us-east-1 to route a
        // budget notification into, so this Lambda turns it into an ActivityEvent on the shared
        // bus instead, the same contract wafScanDetect.js uses for a WAF finding.
        observabilityUE1.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of("FunctionName", "test-env-bedrock-budget-alert-forward")));

        // Subscribed directly to the budget topic (SNS is the only subscriber type a budget
        // notification supports).
        observabilityUE1.hasResourceProperties(
                "AWS::SNS::Subscription",
                Match.objectLike(Map.of(
                        "Protocol",
                        "lambda",
                        "TopicArn",
                        Match.objectLike(Map.of(
                                "Ref", Match.stringLikeRegexp("BedrockBudgetAlertsTopic"))))));

        // Permitted to publish onto this environment's own activity bus, cross-region, and no
        // other bus in the account.
        Map<String, Map<String, Object>> policies = observabilityUE1.findResources("AWS::IAM::Policy");
        boolean grantsPutEventsOnActivityBus = policies.values().stream().anyMatch(resource -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            @SuppressWarnings("unchecked")
            var policyDocument = (Map<String, Object>) properties.get("PolicyDocument");
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) policyDocument.get("Statement");
            return statements.stream().anyMatch(statement -> {
                Object action = statement.get("Action");
                Object resourceArn = statement.get("Resource");
                boolean actsOnPutEvents = "events:PutEvents".equals(action)
                        || (action instanceof List<?> actions && actions.contains("events:PutEvents"));
                boolean targetsActivityBus = String.valueOf(resourceArn)
                        .contains("event-bus/test-env-activity-bus");
                return actsOnPutEvents && targetsActivityBus;
            });
        });
        assertTrue(grantsPutEventsOnActivityBus, "No IAM policy grants events:PutEvents on the activity bus");

        // The stack's own composite health alarm, named with the env-wide prefix so it reaches
        // Telegram via any live deployment's EdgeStack forwarding rule, same as the WAF and
        // certificate alarms.
        observabilityUE1.hasResourceProperties(
                "AWS::CloudWatch::CompositeAlarm",
                Match.objectLike(Map.of("AlarmName", "test-env-obs-ue1-stack-health")));
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
