/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jetbrains.annotations.NotNull;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.assertions.Template;

/**
 * A metric filter on a log group the synth never creates fails the stack at deploy time, not at
 * synth time: CloudFormation cannot attach the filter, and the whole app stack rolls back. The
 * case that motivated this test was twelve filters named {@code /aws/lambda/<worker>} where
 * {@link co.uk.diyaccounting.submit.constructs.AsyncApiLambda} gives a worker the same log group
 * as its ingest function and creates no group of its own.
 */
class MetricFilterLogGroupCdkResourceTest {

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "test"),
        @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "tt-witheight"),
        @SetEnvironmentVariable(
                key = "COGNITO_USER_POOL_ARN",
                value = "arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_123456789"),
        @SetEnvironmentVariable(key = "COGNITO_CLIENT_ID", value = "tt-witheight-cognito-client-id"),
        @SetEnvironmentVariable(key = "COGNITO_DIYA_GL_CLIENT_ID", value = "tt-witheight-cognito-books-client-id"),
        @SetEnvironmentVariable(
                key = "HMRC_CLIENT_SECRET_ARN",
                value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:tt-witheight/submit/hmrc/client_secret"),
        @SetEnvironmentVariable(
                key = "HMRC_SANDBOX_CLIENT_SECRET_ARN",
                value =
                        "arn:aws:secretsmanager:eu-west-2:111111111111:secret:tt-witheight/submit/hmrc/sandbox_client_secret"),
        @SetEnvironmentVariable(key = "BASE_IMAGE_TAG", value = "test"),
        @SetEnvironmentVariable(key = "CLOUD_TRAIL_ENABLED", value = "true"),
        @SetEnvironmentVariable(key = "SELF_DESTRUCT_DELAY_HOURS", value = "1"),
        @SetEnvironmentVariable(key = "HTTP_API_URL", value = "https://test-api.example.com/"),
        @SetEnvironmentVariable(key = "DOC_ROOT_PATH", value = "web/public"),
        @SetEnvironmentVariable(key = "EDGE_FUNCTION_ASSET_PATH", value = "app/functions/edge"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
    })
    void everyAppStackMetricFilterNamesALogGroupTheSynthCreates() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());

        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        var submitApplication = new SubmitApplication(app, appProps);
        app.synth();

        List<Stack> stacks = new ArrayList<>(List.of(
                submitApplication.authStack,
                submitApplication.hmrcStack,
                submitApplication.hmrcItsaStack,
                submitApplication.companiesHouseStack,
                submitApplication.accountStack,
                submitApplication.billingStack,
                submitApplication.diyaGlStack,
                submitApplication.apiStack,
                submitApplication.opsStack,
                submitApplication.edgeStack,
                submitApplication.publishStack));
        if (submitApplication.selfDestructStack != null) {
            stacks.add(submitApplication.selfDestructStack);
        }

        assertEveryMetricFilterNamesACreatedLogGroup(stacks);
    }

    @Test
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
    void everyEnvStackMetricFilterNamesALogGroupTheSynthCreates() throws IOException {
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

        List<Stack> stacks = new ArrayList<>(List.of(
                env.observabilityStack,
                env.observabilityUE1Stack,
                env.securityDetectionStack,
                env.securityBaselineStack,
                env.securityLakeStack,
                env.dataStack,
                env.backupStack,
                env.activityStack,
                env.analyticsStack,
                env.scanDetectionStack,
                env.ingestionStack,
                env.identityStack,
                env.ecrStack,
                env.ue1EcrStack));
        // holdingStack, simulatorStack and billingWebhookStack are created only when their own
        // context config is present (see SubmitEnvironment.java), so this fixture's context may
        // leave any of them null.
        if (env.holdingStack != null) stacks.add(env.holdingStack);
        if (env.simulatorStack != null) stacks.add(env.simulatorStack);
        if (env.billingWebhookStack != null) stacks.add(env.billingWebhookStack);

        assertEveryMetricFilterNamesACreatedLogGroup(stacks);
    }

    /**
     * Asserts every {@code AWS::Logs::MetricFilter} in {@code stacks} names a log group the same
     * synth actually creates: either its {@code LogGroupName} string matches an {@code
     * AWS::Logs::LogGroup} resource's own {@code LogGroupName}, or its {@code Ref}/{@code
     * Fn::GetAtt} points at one, or an {@code Fn::Join}/{@code Fn::Sub} resolves to a matching
     * name once its {@code Ref} parts (to a Lambda function, whose CloudFormation {@code Ref}
     * returns its {@code FunctionName}) are substituted in.
     *
     * <p>A Lambda function existing under a given name is deliberately NOT treated as proof that
     * {@code /aws/lambda/<name>} exists: a worker function exists under its own name while its
     * log group is its ingest function's.
     */
    @SuppressWarnings("unchecked")
    private static void assertEveryMetricFilterNamesACreatedLogGroup(List<Stack> stacks) {
        Map<String, Template> templatesByStackName = new LinkedHashMap<>();
        for (Stack stack : stacks) {
            templatesByStackName.put(stack.getStackName(), Template.fromStack(stack));
        }

        // Every LogGroupName string actually created by an AWS::Logs::LogGroup resource anywhere
        // in the synth, plus the (stackName, logicalId) keys of those resources for Ref/GetAtt
        // resolution, which CloudFormation only ever resolves within one stack's own template.
        Set<String> createdLogGroupNames = new HashSet<>();
        Set<String> logGroupResourceKeys = new HashSet<>();
        // A Lambda function's own CloudFormation Ref resolves to its FunctionName, so an
        // Fn::Join/Fn::Sub built from that Ref needs the same (stackName, logicalId) -> name map.
        Map<String, String> lambdaLogicalIdToFunctionName = new HashMap<>();

        for (Map.Entry<String, Template> entry : templatesByStackName.entrySet()) {
            String stackName = entry.getKey();
            Map<String, Object> json = (Map<String, Object>) entry.getValue().toJSON();
            Map<String, Object> resources = (Map<String, Object>) json.get("Resources");
            if (resources == null) continue;
            for (Map.Entry<String, Object> resourceEntry : resources.entrySet()) {
                Map<String, Object> resource = (Map<String, Object>) resourceEntry.getValue();
                String type = String.valueOf(resource.get("Type"));
                Map<String, Object> properties = (Map<String, Object>) resource.get("Properties");
                if ("AWS::Logs::LogGroup".equals(type)) {
                    logGroupResourceKeys.add(stackName + "#" + resourceEntry.getKey());
                    Object name = properties == null ? null : properties.get("LogGroupName");
                    if (name instanceof String logGroupName) createdLogGroupNames.add(logGroupName);
                } else if ("AWS::Lambda::Function".equals(type)) {
                    Object name = properties == null ? null : properties.get("FunctionName");
                    if (name instanceof String functionName) {
                        lambdaLogicalIdToFunctionName.put(stackName + "#" + resourceEntry.getKey(), functionName);
                    }
                } else if ("Custom::AWS".equals(type)) {
                    // KindCdk.ensureLogGroupWithDependency creates a log group idempotently via
                    // an AwsCustomResource calling CloudWatchLogs:createLogGroup, instead of a
                    // CloudFormation-owned AWS::Logs::LogGroup (see ObservabilityStack.java and
                    // ../CLAUDE.md's "Idempotent Deployments"). Its Create call is serialised as a
                    // JSON string property, not a structured Properties map.
                    String createdName = createLogGroupNameFromAwsCustomResource(properties);
                    if (createdName != null) createdLogGroupNames.add(createdName);
                }
            }
        }

        var failures = new ArrayList<String>();
        for (Map.Entry<String, Template> entry : templatesByStackName.entrySet()) {
            String stackName = entry.getKey();
            // The self-destruct Lambda's log group is created by ObservabilityStack /
            // ObservabilityUE1Stack in the environment CDK app, not by SelfDestructStack itself
            // (see SubmitApplication.java: .selfDestructLogGroupName(sharedNames.ew2SelfDestructLogGroupName)),
            // so a synth of the application stacks alone can never see it.
            if (stackName.endsWith("-SelfDestructStack")) continue;
            Map<String, Map<String, Object>> filters = entry.getValue().findResources("AWS::Logs::MetricFilter");
            for (Map.Entry<String, Map<String, Object>> filterEntry : filters.entrySet()) {
                Map<String, Object> properties = (Map<String, Object>) filterEntry.getValue().get("Properties");
                Object logGroupNameRaw = properties == null ? null : properties.get("LogGroupName");
                String problem = describeUnresolvedLogGroupName(
                        logGroupNameRaw,
                        stackName,
                        logGroupResourceKeys,
                        createdLogGroupNames,
                        lambdaLogicalIdToFunctionName);
                if (problem != null) {
                    failures.add(stackName + "/" + filterEntry.getKey() + ": " + problem);
                }
            }
        }

        Assertions.assertTrue(
                failures.isEmpty(),
                "These metric filters name a log group the synth never creates:\n" + String.join("\n", failures));
    }

    private static final Pattern CREATE_LOG_GROUP_NAME_PATTERN = Pattern.compile("\"logGroupName\":\"([^\"]+)\"");

    /**
     * Extracts the log group name from an {@code AwsCustomResource}'s {@code Create} call when it
     * is a {@code CloudWatchLogs:createLogGroup} call, per {@code KindCdk.ensureLogGroupWithDependency}.
     * Returns {@code null} for any other {@code Custom::AWS} resource.
     */
    private static String createLogGroupNameFromAwsCustomResource(Map<String, Object> properties) {
        Object create = properties == null ? null : properties.get("Create");
        if (!(create instanceof String createJson)) return null;
        if (!createJson.contains("\"service\":\"CloudWatchLogs\"")) return null;
        if (!createJson.contains("\"action\":\"createLogGroup\"")) return null;
        Matcher matcher = CREATE_LOG_GROUP_NAME_PATTERN.matcher(createJson);
        return matcher.find() ? matcher.group(1) : null;
    }

    @SuppressWarnings("unchecked")
    private static String describeUnresolvedLogGroupName(
            Object raw,
            String stackName,
            Set<String> logGroupResourceKeys,
            Set<String> createdLogGroupNames,
            Map<String, String> lambdaLogicalIdToFunctionName) {
        if (raw instanceof String literal) {
            if (createdLogGroupNames.contains(literal)) return null;
            return "LogGroupName \"" + literal + "\" matches no AWS::Logs::LogGroup created in this synth";
        }
        if (raw instanceof Map<?, ?> rawMap) {
            Map<String, Object> map = (Map<String, Object>) rawMap;
            if (map.containsKey("Ref")) {
                String refId = String.valueOf(map.get("Ref"));
                if (logGroupResourceKeys.contains(stackName + "#" + refId)) return null;
                return "LogGroupName Ref's \"" + refId + "\" in stack " + stackName
                        + ", which is not an AWS::Logs::LogGroup in this synth";
            }
            if (map.containsKey("Fn::GetAtt")) {
                Object getAtt = map.get("Fn::GetAtt");
                String logicalId = getAtt instanceof List<?> list && !list.isEmpty()
                        ? String.valueOf(list.get(0))
                        : String.valueOf(getAtt);
                if (logGroupResourceKeys.contains(stackName + "#" + logicalId)) return null;
                return "LogGroupName Fn::GetAtt's \"" + logicalId + "\" in stack " + stackName
                        + ", which is not an AWS::Logs::LogGroup in this synth";
            }
            if (map.containsKey("Fn::Join")) {
                String resolved = resolveJoinToLiteral(map.get("Fn::Join"), stackName, lambdaLogicalIdToFunctionName);
                if (resolved == null) {
                    return "LogGroupName is an Fn::Join this test cannot resolve to a literal name: " + map;
                }
                return describeUnresolvedLogGroupName(
                        resolved, stackName, logGroupResourceKeys, createdLogGroupNames, lambdaLogicalIdToFunctionName);
            }
            if (map.containsKey("Fn::Sub")) {
                String resolved = resolveSubToLiteral(map.get("Fn::Sub"), stackName, lambdaLogicalIdToFunctionName);
                if (resolved == null) {
                    return "LogGroupName is an Fn::Sub this test cannot resolve to a literal name: " + map;
                }
                return describeUnresolvedLogGroupName(
                        resolved, stackName, logGroupResourceKeys, createdLogGroupNames, lambdaLogicalIdToFunctionName);
            }
        }
        return "LogGroupName has an unrecognised form: " + raw;
    }

    @SuppressWarnings("unchecked")
    private static String resolveJoinToLiteral(
            Object fnJoin, String stackName, Map<String, String> lambdaLogicalIdToFunctionName) {
        if (!(fnJoin instanceof List<?> joinArgs) || joinArgs.size() != 2) return null;
        String separator = String.valueOf(joinArgs.get(0));
        if (!(joinArgs.get(1) instanceof List<?> parts)) return null;

        StringBuilder result = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) result.append(separator);
            Object part = parts.get(i);
            if (part instanceof String literalPart) {
                result.append(literalPart);
                continue;
            }
            if (part instanceof Map<?, ?> partMap && partMap.get("Ref") instanceof String refId) {
                String functionName = lambdaLogicalIdToFunctionName.get(stackName + "#" + refId);
                if (functionName != null) {
                    result.append(functionName);
                    continue;
                }
            }
            return null;
        }
        return result.toString();
    }

    @SuppressWarnings("unchecked")
    private static String resolveSubToLiteral(
            Object fnSub, String stackName, Map<String, String> lambdaLogicalIdToFunctionName) {
        String template;
        Map<String, Object> vars = Map.of();
        if (fnSub instanceof String subString) {
            template = subString;
        } else if (fnSub instanceof List<?> subArgs
                && subArgs.size() == 2
                && subArgs.get(0) instanceof String subString
                && subArgs.get(1) instanceof Map<?, ?> subVars) {
            template = subString;
            vars = (Map<String, Object>) subVars;
        } else {
            return null;
        }

        Matcher matcher = Pattern.compile("\\$\\{([^}]+)}").matcher(template);
        StringBuilder result = new StringBuilder();
        int lastEnd = 0;
        while (matcher.find()) {
            result.append(template, lastEnd, matcher.start());
            String token = matcher.group(1);
            String resolvedToken = resolveSubToken(token, vars, stackName, lambdaLogicalIdToFunctionName);
            if (resolvedToken == null) return null;
            result.append(resolvedToken);
            lastEnd = matcher.end();
        }
        result.append(template.substring(lastEnd));
        return result.toString();
    }

    private static String resolveSubToken(
            String token, Map<String, Object> vars, String stackName, Map<String, String> lambdaLogicalIdToFunctionName) {
        if (vars.containsKey(token)) {
            Object value = vars.get(token);
            if (value instanceof String stringValue) return stringValue;
            if (value instanceof Map<?, ?> valueMap && valueMap.get("Ref") instanceof String refId) {
                return lambdaLogicalIdToFunctionName.get(stackName + "#" + refId);
            }
            return null;
        }
        return lambdaLogicalIdToFunctionName.get(stackName + "#" + token);
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
