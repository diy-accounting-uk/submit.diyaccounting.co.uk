/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

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
import org.opentest4j.AssertionFailedError;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Template;

@SetEnvironmentVariable.SetEnvironmentVariables({
    @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "test"),
    @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "tt-witheight"),
    @SetEnvironmentVariable(
            key = "COGNITO_USER_POOL_ARN",
            value = "arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_123456789"),
    @SetEnvironmentVariable(key = "COGNITO_CLIENT_ID", value = "tt-witheight-cognito-client-id"),
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
class SubmitApplicationCdkResourceTest {

    @Test
    void shouldCreateSubmitApplicationWithResources() throws IOException {

        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());

        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        var submitApplication = new SubmitApplication(app, appProps);
        app.synth();
        infof("CDK synth complete");

        infof("Created stack:", submitApplication.authStack.getStackName());
        Template.fromStack(submitApplication.authStack).resourceCountIs("AWS::Lambda::Function", 2);

        infof("Created stack:", submitApplication.hmrcStack.getStackName());
        Template.fromStack(submitApplication.hmrcStack).resourceCountIs("AWS::Lambda::Function", 8);

        infof("Created stack:", submitApplication.accountStack.getStackName());
        // 13 Lambdas: bundleGet(1), bundlePost(2), bundleDelete(2), interestPost(1), passGet(1),
        // passPost(1), passAdminPost(1), passGeneratePost(1), passMyPassesGet(1),
        // bundleCapacityReconcile(1), sessionBeaconPost(1)
        Template accountStackTemplate = Template.fromStack(submitApplication.accountStack);
        accountStackTemplate.resourceCountIs("AWS::Lambda::Function", 13);

        // Regression guard: bundleGet performs lazy token refresh via dynamodb:UpdateItem on the
        // bundles table (see app/functions/account/bundleGet.js resetTokens). Its grant on
        // bundlesTable MUST include dynamodb:UpdateItem. If someone narrows it to reads only, the
        // count here drops below the expected threshold and the test fails.
        //
        // Policies granting dynamodb:UpdateItem on the bundles table (logical id contains
        // "bundles-table"): bundleGet(1) + bundlePost ingest+worker(2) + bundleDelete ingest+worker(2)
        // = 5 expected. The per-Lambda assertion below is the primary guard; the count is
        // informational.
        long bundleGetUpdateItemPolicies =
                countIamPoliciesWithUpdateItemOnBundlesTable(accountStackTemplate, "bundle-get");
        if (bundleGetUpdateItemPolicies < 1) {
            dumpIamPolicies(accountStackTemplate);
            throw new AssertionFailedError("bundleGet Lambda role is missing dynamodb:UpdateItem on the bundles table. "
                    + "Check the bundlesTable grant for bundleGetLambda in AccountStack.java.");
        }
        infof(
                "IAM guard: bundleGet has %d policies with UpdateItem on bundles table (expected >= 1)",
                bundleGetUpdateItemPolicies);

        // Scan and BatchGetItem read a whole table at once, so they are the cheapest way to walk off
        // with customer data. Three functions genuinely use them: capacity reconciliation counts
        // every bundle, the my-passes listing falls back to a scan when its index query fails, and
        // bundleGet reads several capacity counters at once. Any other role holding either action
        // has been granted more than it calls.
        List<String> rolesThatReadInBulk = List.of("bundle-capacity-reconcile", "pass-my-passes-get", "bundle-get");
        List<String> unexpectedBulkReaders = findRolesGrantedBulkReads(accountStackTemplate, rolesThatReadInBulk);
        if (!unexpectedBulkReaders.isEmpty()) {
            dumpIamPolicies(accountStackTemplate);
            throw new AssertionFailedError("These roles hold dynamodb:Scan or dynamodb:BatchGetItem without calling "
                    + "either: " + unexpectedBulkReaders + ". Grant only the actions the function "
                    + "makes, or add the role here if the bulk read is real.");
        }

        infof("Created stack:", submitApplication.billingStack.getStackName());
        // 3 Lambdas: billingCheckoutPost(1), billingPortalGet(1), billingRecoverPost(1)
        // billingWebhookPost moved to env-level BillingWebhookStack
        Template.fromStack(submitApplication.billingStack).resourceCountIs("AWS::Lambda::Function", 3);

        infof("Created stack:", submitApplication.apiStack.getStackName());
        Template apiStackTemplate = Template.fromStack(submitApplication.apiStack);
        // Log all API Gateway routes present in the synthesized template
        @SuppressWarnings("unchecked")
        Map<String, Object> apiTemplateJson = (Map<String, Object>) apiStackTemplate.toJSON();
        Object resourcesObj = apiTemplateJson.get("Resources");
        if (resourcesObj instanceof Map) {
            Map<String, Object> resources = (Map<String, Object>) resourcesObj;
            int routeCount = 0;
            for (Map.Entry<String, Object> e : resources.entrySet()) {
                Object v = e.getValue();
                if (v instanceof Map) {
                    Map<String, Object> res = (Map<String, Object>) v;
                    Object type = res.get("Type");
                    if ("AWS::ApiGatewayV2::Route".equals(type)) {
                        Map<String, Object> props = (Map<String, Object>) res.get("Properties");
                        Object routeKey = props != null ? props.get("RouteKey") : null;
                        Object target = props != null ? props.get("Target") : null;
                        infof(
                                "API route: id=%s routeKey=%s target=%s",
                                e.getKey(), String.valueOf(routeKey), String.valueOf(target));
                        routeCount++;
                    }
                }
            }
            infof("Total API routes found: %d", routeCount);
        }

        apiStackTemplate.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
        // Confirm key routes exist, including multiple HTTP methods on the same path
        apiStackTemplate.hasResourceProperties("AWS::ApiGatewayV2::Route", Map.of("RouteKey", "POST /api/v1/bundle"));
        apiStackTemplate.hasResourceProperties("AWS::ApiGatewayV2::Route", Map.of("RouteKey", "DELETE /api/v1/bundle"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "DELETE /api/v1/bundle/{id}"));
        apiStackTemplate.resourceCountIs("AWS::ApiGatewayV2::Route", 38);

        // Dashboard moved to environment-level ObservabilityStack
        infof("Created stack:", submitApplication.opsStack.getStackName());

        infof("Created stack:", submitApplication.edgeStack.getStackName());
        Template edgeStackTemplate = Template.fromStack(submitApplication.edgeStack);
        edgeStackTemplate.resourceCountIs("AWS::CloudFront::Distribution", 1);

        // The CloudFront standard-logging bucket moved to AnalyticsStack (env-scoped) so log
        // history survives every redeploy of this app stack. EdgeStack must create no bucket for
        // it any more and instead reference the imported env bucket by name; the origin bucket is
        // the only S3::Bucket this stack still creates.
        edgeStackTemplate.resourceCountIs("AWS::S3::Bucket", 1);

        // CloudFront access logs (v2 delivery): one source, one destination, one delivery joining
        // them, landing Parquet directly in the shared analytics lake for the Glue catalog.
        edgeStackTemplate.resourceCountIs("AWS::Logs::DeliverySource", 1);
        edgeStackTemplate.resourceCountIs("AWS::Logs::DeliveryDestination", 1);
        edgeStackTemplate.resourceCountIs("AWS::Logs::Delivery", 1);

        infof("Created stack:", submitApplication.publishStack.getStackName());
        Template.fromStack(submitApplication.publishStack).resourceCountIs("Custom::CDKBucketDeployment", 1);

        if (submitApplication.selfDestructStack != null) {
            infof("Created stack:", submitApplication.selfDestructStack.getStackName());
            // 2 Lambdas: self-destruct function + AwsCustomResource backing Lambda for ensureLogGroup
            Template.fromStack(submitApplication.selfDestructStack).resourceCountIs("AWS::Lambda::Function", 2);
        }

        // Every Lambda function in every app stack must route its logs to an explicit, retained log
        // group — otherwise CDK (or CloudFormation's own custom-resource provider framework) gives
        // it an unnamed one with no retention and no removal policy, and it outlives the stack.
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.authStack));
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.hmrcStack));
        assertEveryLambdaHasAnExplicitLogGroup(accountStackTemplate);
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.billingStack));
        assertEveryLambdaHasAnExplicitLogGroup(apiStackTemplate);
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.opsStack));
        assertEveryLambdaHasAnExplicitLogGroup(edgeStackTemplate);
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.publishStack));
        if (submitApplication.selfDestructStack != null) {
            assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.selfDestructStack));
        }
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
        org.junit.jupiter.api.Assertions.assertTrue(
                missing.isEmpty(), "Lambda functions with no explicit log group: " + missing);
    }

    @SuppressWarnings("unchecked")
    private static void dumpIamPolicies(Template template) {
        Map<String, Map<String, Object>> policies = template.findResources("AWS::IAM::Policy");
        infof("[IAM diag] Found %d AWS::IAM::Policy resources in AccountStack", policies.size());
        for (Map.Entry<String, Map<String, Object>> e : policies.entrySet()) {
            Map<String, Object> props = (Map<String, Object>) e.getValue().get("Properties");
            if (props == null) continue;
            Object roles = props.get("Roles");
            String rolesStr = roles == null ? "<null>" : roles.toString();
            infof("[IAM diag] policy=%s Roles=%s", e.getKey(), rolesStr);
            Object doc = props.get("PolicyDocument");
            if (doc instanceof Map) {
                Object stmts = ((Map<String, Object>) doc).get("Statement");
                if (stmts instanceof List<?>) {
                    int i = 0;
                    for (Object s : (List<Object>) stmts) {
                        if (s instanceof Map) {
                            Map<String, Object> st = (Map<String, Object>) s;
                            Object act = st.get("Action");
                            Object res = st.get("Resource");
                            infof("[IAM diag]   stmt[%d] Action=%s Resource=%s", i, act, res);
                        }
                        i++;
                    }
                }
            }
        }
    }

    /**
     * Count AWS::IAM::Policy resources in {@code template} that (a) attach to a role whose logical
     * id contains {@code lambdaSlug} and (b) grant {@code dynamodb:UpdateItem} on a resource whose
     * logical id contains "bundles-table".
     */
    /**
     * Returns the roles holding dynamodb:Scan or dynamodb:BatchGetItem, minus the ones expected to.
     * Role names are reported as the CloudFormation logical id, which carries the Lambda's name.
     */
    @SuppressWarnings("unchecked")
    private static List<String> findRolesGrantedBulkReads(Template template, List<String> rolesThatReadInBulk) {
        List<String> found = new java.util.ArrayList<>();
        Map<String, Map<String, Object>> policies = template.findResources("AWS::IAM::Policy");
        for (Map.Entry<String, Map<String, Object>> entry : policies.entrySet()) {
            Map<String, Object> props = (Map<String, Object>) entry.getValue().get("Properties");
            if (props == null) continue;
            if (!policyGrantsBulkRead(props)) continue;
            boolean expected = rolesThatReadInBulk.stream().anyMatch(slug -> policyAttachesToRoleMatching(props, slug));
            if (!expected) found.add(entry.getKey());
        }
        return found;
    }

    @SuppressWarnings("unchecked")
    private static boolean policyGrantsBulkRead(Map<String, Object> policyProps) {
        Object document = policyProps.get("PolicyDocument");
        if (!(document instanceof Map)) return false;
        Object statements = ((Map<String, Object>) document).get("Statement");
        if (!(statements instanceof List<?>)) return false;
        for (Object statementObj : (List<Object>) statements) {
            if (!(statementObj instanceof Map)) continue;
            Object action = ((Map<String, Object>) statementObj).get("Action");
            List<Object> actions =
                    action instanceof List<?> ? (List<Object>) action : action == null ? List.of() : List.of(action);
            for (Object a : actions) {
                if ("dynamodb:Scan".equals(a) || "dynamodb:BatchGetItem".equals(a)) return true;
            }
        }
        return false;
    }

    private static long countIamPoliciesWithUpdateItemOnBundlesTable(Template template, String lambdaSlug) {
        Map<String, Map<String, Object>> policies = template.findResources("AWS::IAM::Policy");
        long matches = 0;
        for (Map.Entry<String, Map<String, Object>> entry : policies.entrySet()) {
            Map<String, Object> resource = entry.getValue();
            @SuppressWarnings("unchecked")
            Map<String, Object> props = (Map<String, Object>) resource.get("Properties");
            if (props == null) continue;
            if (!policyAttachesToRoleMatching(props, lambdaSlug)) continue;
            if (!policyStatementsGrantUpdateItemOnBundlesTable(props)) continue;
            matches++;
        }
        return matches;
    }

    @SuppressWarnings("unchecked")
    private static boolean policyAttachesToRoleMatching(Map<String, Object> policyProps, String slug) {
        Object roles = policyProps.get("Roles");
        if (!(roles instanceof List<?>)) return false;
        for (Object role : (List<Object>) roles) {
            if (!(role instanceof Map)) continue;
            Object ref = ((Map<String, Object>) role).get("Ref");
            if (ref instanceof String && ((String) ref).toLowerCase().contains(slug.replace("-", ""))) {
                return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static boolean policyStatementsGrantUpdateItemOnBundlesTable(Map<String, Object> policyProps) {
        Object document = policyProps.get("PolicyDocument");
        if (!(document instanceof Map)) return false;
        Object statements = ((Map<String, Object>) document).get("Statement");
        if (!(statements instanceof List<?>)) return false;
        for (Object statementObj : (List<Object>) statements) {
            if (!(statementObj instanceof Map)) continue;
            Map<String, Object> statement = (Map<String, Object>) statementObj;
            if (!statementGrantsUpdateItem(statement)) continue;
            if (statementTargetsBundlesTable(statement)) return true;
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static boolean statementGrantsUpdateItem(Map<String, Object> statement) {
        Object action = statement.get("Action");
        if (action instanceof String) return "dynamodb:UpdateItem".equals(action);
        if (action instanceof List<?>) {
            for (Object a : (List<Object>) action) {
                if ("dynamodb:UpdateItem".equals(a)) return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static boolean statementTargetsBundlesTable(Map<String, Object> statement) {
        Object resource = statement.get("Resource");
        List<Object> resources = resource instanceof List<?>
                ? (List<Object>) resource
                : resource == null ? List.of() : List.of(resource);
        for (Object r : resources) {
            if (resourceRefersToBundlesTable(r)) return true;
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static boolean resourceRefersToBundlesTable(Object resource) {
        // Bundles table physical name is "{env}-env-bundles" (see SubmitSharedNames.bundlesTableName).
        // Sister tables use "{env}-env-bundle-capacity" / "{env}-env-bundle-*-async-requests", so
        // the exact substring "env-bundles" uniquely identifies the bundles table.
        if (resource instanceof String) {
            return ((String) resource).contains("env-bundles");
        }
        if (resource instanceof List<?>) {
            for (Object part : (List<Object>) resource) {
                if (resourceRefersToBundlesTable(part)) return true;
            }
            return false;
        }
        if (resource instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) resource;
            Object ref = map.get("Ref");
            if (ref instanceof String && ((String) ref).toLowerCase().contains("bundlestable")) return true;
            Object fnGetAtt = map.get("Fn::GetAtt");
            if (fnGetAtt instanceof List<?>) {
                for (Object part : (List<Object>) fnGetAtt) {
                    if (part instanceof String && ((String) part).toLowerCase().contains("bundlestable")) return true;
                }
            }
            Object fnJoin = map.get("Fn::Join");
            if (fnJoin instanceof List<?>) {
                for (Object part : (List<Object>) fnJoin) {
                    if (resourceRefersToBundlesTable(part)) return true;
                }
            }
            if (map.get("Fn::Sub") instanceof String s && s.contains("env-bundles")) return true;
            for (Object value : map.values()) {
                if (value instanceof List<?>) {
                    for (Object part : (List<Object>) value) {
                        if (resourceRefersToBundlesTable(part)) return true;
                    }
                }
            }
        }
        return false;
    }

    private static @NotNull Map<String, Object> buildContextPropertyMapFromCdkJsonPath(Path cdkJsonPath)
            throws IOException {
        String json = Files.readString(cdkJsonPath);

        // 2) Extract the "context" object
        ObjectMapper om = new ObjectMapper();
        JsonNode root = om.readTree(json);
        JsonNode ctxNode = root.path("context");

        Map<String, Object> ctx = new HashMap<>();
        for (Map.Entry<String, JsonNode> e : ctxNode.properties()) {
            // CDK context values are Objects; in your case they’re strings
            ctx.put(e.getKey(), e.getValue().asText());
        }
        return ctx;
    }
}
