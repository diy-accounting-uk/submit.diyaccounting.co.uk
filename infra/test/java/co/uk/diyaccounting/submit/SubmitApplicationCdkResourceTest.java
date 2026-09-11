/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.constructs.AsyncApiLambda;
import co.uk.diyaccounting.submit.constructs.Lambda;
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
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

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

        // One composite health alarm per stack routes to Telegram/GitHub through OpsStack's
        // AlarmStateChangeRule; the "check-" children of each function deliberately do not.
        // The rule's own alarmName prefix matchers are the ground truth for what "routed" means,
        // so read them from the synthesized template rather than hardcoding them here.
        Template opsStackTemplateForRouting = Template.fromStack(submitApplication.opsStack);
        List<String> routedPrefixes = routedAlarmNamePrefixes(opsStackTemplateForRouting);

        infof("Created stack:", submitApplication.authStack.getStackName());
        Template authStackTemplate = Template.fromStack(submitApplication.authStack);
        authStackTemplate.resourceCountIs("AWS::Lambda::Function", 2);
        assertStackHealthAlarm(authStackTemplate, 2, 0, routedPrefixes);

        infof("Created stack:", submitApplication.hmrcStack.getStackName());
        Template hmrcStackTemplate = Template.fromStack(submitApplication.hmrcStack);
        hmrcStackTemplate.resourceCountIs("AWS::Lambda::Function", 46);
        assertStackHealthAlarm(hmrcStackTemplate, 24, 22, routedPrefixes);
        // The HmrcStack has 46 Lambdas × 2 checks + async checks, totaling ~136 alarms,
        // which would create a rule exceeding 10240 chars. Verify it uses group composites.
        int hmrcCompositeCount = hmrcStackTemplate
                .findResources("AWS::CloudWatch::CompositeAlarm")
                .size();
        org.junit.jupiter.api.Assertions.assertTrue(
                hmrcCompositeCount > 1,
                "HmrcStack should have multiple CompositeAlarms (top-level + groups) due to rule length, but found "
                        + hmrcCompositeCount);

        infof("Created stack:", submitApplication.hmrcItsaStack.getStackName());
        Template hmrcItsaStackTemplate = Template.fromStack(submitApplication.hmrcItsaStack);
        hmrcItsaStackTemplate.resourceCountIs("AWS::Lambda::Function", 28);
        assertStackHealthAlarm(hmrcItsaStackTemplate, 14, 14, routedPrefixes);

        infof("Created stack:", submitApplication.companiesHouseStack.getStackName());
        Template companiesHouseStackTemplate = Template.fromStack(submitApplication.companiesHouseStack);
        companiesHouseStackTemplate.resourceCountIs("AWS::Lambda::Function", 13);
        assertStackHealthAlarm(companiesHouseStackTemplate, 13, 0, routedPrefixes);

        infof("Created stack:", submitApplication.accountStack.getStackName());
        // 14 Lambdas: bundleGet(1), bundlePost(2), bundleDelete(2), operatorSnapshotGet(1),
        // interestPost(1), passGet(1), passPost(1), passAdminPost(1), passGeneratePost(1),
        // passMyPassesGet(1), bundleCapacityReconcile(1), sessionBeaconPost(1)
        Template accountStackTemplate = Template.fromStack(submitApplication.accountStack);
        accountStackTemplate.resourceCountIs("AWS::Lambda::Function", 14);
        assertStackHealthAlarm(accountStackTemplate, 12, 2, routedPrefixes);

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
        // with customer data. One function genuinely uses them: bundleGet reads several capacity
        // counters at once. Any other role holding either action has been granted more than it calls.
        List<String> rolesThatReadInBulk = List.of("bundle-get");
        List<String> unexpectedBulkReaders = findRolesGrantedBulkReads(accountStackTemplate, rolesThatReadInBulk);
        if (!unexpectedBulkReaders.isEmpty()) {
            dumpIamPolicies(accountStackTemplate);
            throw new AssertionFailedError("These roles hold dynamodb:Scan or dynamodb:BatchGetItem without calling "
                    + "either: " + unexpectedBulkReaders + ". Grant only the actions the function "
                    + "makes, or add the role here if the bulk read is real.");
        }

        // Capacity reconciliation counts live allocations of a capped bundle through
        // bundleId-expiry-index instead of scanning the bundles table. A re-grant of dynamodb:Scan
        // to this role would slip past the check above only if this assertion also failed.
        boolean reconcileHasIndexQuery = findRoleGrantedActionOnResourceSuffix(
                accountStackTemplate, "bundle-capacity-reconcile", "dynamodb:Query", "/index/bundleId-expiry-index");
        if (!reconcileHasIndexQuery) {
            dumpIamPolicies(accountStackTemplate);
            throw new AssertionFailedError("bundle-capacity-reconcile Lambda role is missing dynamodb:Query on "
                    + "bundleId-expiry-index. Check the grantTableIndexActions call for "
                    + "bundleCapacityReconcileLambda in AccountStack.java.");
        }

        infof("Created stack:", submitApplication.billingStack.getStackName());
        // 4 Lambdas: billingCheckoutPost(1), billingCheckoutSessionGet(1), billingPortalGet(1), billingRecoverPost(1)
        // billingWebhookPost moved to env-level BillingWebhookStack
        Template billingStackTemplate = Template.fromStack(submitApplication.billingStack);
        billingStackTemplate.resourceCountIs("AWS::Lambda::Function", 4);
        assertStackHealthAlarm(billingStackTemplate, 4, 0, routedPrefixes);

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
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "GET /api/v1/companies-house/search"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "GET /api/v1/companies-house/company/{companyNumber}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "POST /api/v1/companies-house/token"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "POST /api/v1/companies-house/transaction"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route",
                Map.of("RouteKey", "GET /api/v1/companies-house/transaction/{transactionId}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route",
                Map.of("RouteKey", "PUT /api/v1/companies-house/transaction/{transactionId}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route",
                Map.of("RouteKey", "GET /api/v1/companies-house/company/{companyNumber}/registered-office-address"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route",
                Map.of(
                        "RouteKey",
                        "POST /api/v1/companies-house/transaction/{transactionId}/registered-office-address"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route",
                Map.of(
                        "RouteKey",
                        "GET /api/v1/companies-house/company/{companyNumber}/registered-email-address/eligibility"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route",
                Map.of(
                        "RouteKey",
                        "POST /api/v1/companies-house/transaction/{transactionId}/registered-email-address"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "POST /api/v1/companies-house/accounts/preview"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "POST /api/v1/companies-house/accounts"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route",
                Map.of("RouteKey", "GET /api/v1/companies-house/accounts/{submissionNumber}"));
        // The new diya-gl paths are the primary routes; the old books paths are served alongside
        // them permanently, since the spreadsheets site's cloud.js keeps calling the old paths.
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "GET /api/v1/diya-gl"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "GET /api/v1/diya-gl/{bookId}/versions/{version}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "PUT /api/v1/diya-gl/{bookId}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "DELETE /api/v1/diya-gl/{bookId}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "OPTIONS /api/v1/diya-gl"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "OPTIONS /api/v1/diya-gl/{bookId}/versions/{version}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "OPTIONS /api/v1/diya-gl/{bookId}"));
        apiStackTemplate.hasResourceProperties("AWS::ApiGatewayV2::Route", Map.of("RouteKey", "GET /api/v1/books"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "GET /api/v1/books/{bookId}/versions/{version}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "PUT /api/v1/books/{bookId}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "DELETE /api/v1/books/{bookId}"));
        apiStackTemplate.hasResourceProperties("AWS::ApiGatewayV2::Route", Map.of("RouteKey", "OPTIONS /api/v1/books"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "OPTIONS /api/v1/books/{bookId}/versions/{version}"));
        apiStackTemplate.hasResourceProperties(
                "AWS::ApiGatewayV2::Route", Map.of("RouteKey", "OPTIONS /api/v1/books/{bookId}"));

        // Each Companies House route also gets ApiStack's automatic HEAD route, except PUT
        // /transaction/{transactionId}, which shares its path (and so its auto-HEAD route) with
        // the GET on the same path. The four books routes add three more auto-HEAD routes (PUT
        // and DELETE /api/v1/books/{bookId} share one) and three OPTIONS preflight routes (same
        // sharing), for 77 + 4 + 3 + 3 = 87. GET /api/v1/operator/snapshot adds its own route
        // plus its automatic HEAD route, since no other route shares that path. GET and PUT
        // /api/v1/hmrc/itsa/self-employment/annual add their own two routes plus one shared
        // auto-HEAD route for the path, bringing the total to 96. GET
        // /api/v1/hmrc/itsa/obligations/crystallisation and GET /api/v1/hmrc/itsa/status each add
        // their own route plus their own automatic HEAD route, since neither path is shared with
        // another method, for 96 + 2 + 2 = 100. POST /api/v1/hmrc/itsa/bsas/trigger, GET
        // /api/v1/hmrc/itsa/bsas/self-employment and POST
        // /api/v1/hmrc/itsa/bsas/self-employment/adjust each add their own route plus their own
        // automatic HEAD route, since none of the three paths is shared, for 100 + 2 + 2 + 2 = 106,
        // and the earlier count of 112 (106 plus the WAF-explored figure above). Each of the four
        // DIYA-GL storage routes also answers on /api/v1/books, its permanent second path: the
        // same 4 primary + 3 auto-HEAD + 3 OPTIONS shape repeats under the second prefix, for
        // another 10 routes, bringing the total to 112 + 10 = 122.
        // GET, PUT and DELETE /api/v1/hmrc/itsa/losses-and-claims share one path: three method
        // routes plus one auto-HEAD route for the GET. The same shape repeats for
        // /api/v1/hmrc/itsa/tax-liability-adjustments, for another 4 + 4 = 8 routes, bringing the
        // total to 135 + 8 = 143.
        apiStackTemplate.resourceCountIs("AWS::ApiGatewayV2::Route", 143);

        // Dashboard moved to environment-level ObservabilityStack
        infof("Created stack:", submitApplication.opsStack.getStackName());
        // The Telegram forwarder moved to env-level ActivityStack, and the alarm-to-GitHub-issue
        // Lambda only exists when a GitHub token ARN is configured (this test's config doesn't
        // set one), so this stack builds no Lambda construct of its own and has no composite
        // health alarm.
        opsStackTemplateForRouting.resourceCountIs("AWS::CloudWatch::CompositeAlarm", 0);

        // Both canaries run on the hour, half an hour off probe-test.yml's `57 */4 * * *`, so
        // the two never check the site in the same window and the offset cannot drift.
        opsStackTemplateForRouting.resourceCountIs("AWS::Synthetics::Canary", 2);
        opsStackTemplateForRouting.hasResourceProperties(
                "AWS::Synthetics::Canary",
                Match.objectLike(Map.of("Schedule", Match.objectLike(Map.of("Expression", "cron(27 * * * ? *)")))));

        infof("Created stack:", submitApplication.edgeStack.getStackName());
        Template edgeStackTemplate = Template.fromStack(submitApplication.edgeStack);
        edgeStackTemplate.resourceCountIs("AWS::CloudFront::Distribution", 1);
        // The WAF scan-detect Lambda is this stack's only Lambda construct.
        assertStackHealthAlarm(edgeStackTemplate, 1, 0, routedPrefixes);

        // Access logs reach the analytics lake only through the v2 Parquet delivery below; the
        // distribution itself must carry no classic standard-logging configuration.
        edgeStackTemplate.hasResourceProperties(
                "AWS::CloudFront::Distribution",
                Match.objectLike(Map.of("DistributionConfig", Match.objectLike(Map.of("Logging", Match.absent())))));

        // The origin bucket is the only S3::Bucket this stack creates.
        edgeStackTemplate.resourceCountIs("AWS::S3::Bucket", 1);

        // /api/v1/* and the more specific /api/v1/diya-gl/* and /api/v1/books/* all carry a
        // response headers policy with no CORS override, so CloudFront never overwrites the
        // header API Gateway's own corsPreflight allow list (or, for the DIYA-GL routes,
        // diyaGlCors.js's per-request echo) already sent.
        assertApiBehavioursHaveNoCorsOverride(edgeStackTemplate);

        // CloudFront access logs (v2 delivery): one source, one destination, one delivery joining
        // them, landing Parquet directly in the shared analytics lake for the Glue catalog.
        edgeStackTemplate.resourceCountIs("AWS::Logs::DeliverySource", 1);
        edgeStackTemplate.resourceCountIs("AWS::Logs::DeliveryDestination", 1);
        edgeStackTemplate.resourceCountIs("AWS::Logs::Delivery", 1);

        // Sensitive-path scan detection (issue #9 phase 9.1): SensitivePathScan sits at
        // priority 0, ahead of the three managed/rate-limit rules; the manual block list (phase
        // 9.3) adds a fifth rule at priority 4.
        edgeStackTemplate.resourceCountIs("AWS::WAFv2::WebACL", 1);
        edgeStackTemplate.hasResourceProperties(
                "AWS::WAFv2::WebACL",
                Match.objectLike(Map.of(
                        "Rules",
                        Match.arrayWith(
                                List.of(Match.objectLike(Map.of("Name", "SensitivePathScan", "Priority", 0)))))));
        edgeStackTemplate.hasResourceProperties(
                "AWS::WAFv2::WebACL",
                Match.objectLike(Map.of(
                        "Rules",
                        Match.arrayWith(List.of(Match.objectLike(Map.of("Name", "WafManualBlock", "Priority", 4)))))));
        edgeStackTemplate.findResources("AWS::WAFv2::WebACL").values().forEach(webAcl -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) webAcl.get("Properties");
            @SuppressWarnings("unchecked")
            var rules = (List<Object>) properties.get("Rules");
            infof("Edge stack WebACL rule count: %d", rules.size());
        });
        edgeStackTemplate.hasResourceProperties(
                "AWS::WAFv2::WebACL",
                Match.objectLike(Map.of(
                        "Rules",
                        Match.arrayWith(List.of(
                                Match.objectLike(Map.of("Name", "SensitivePathScan")),
                                Match.objectLike(Map.of("Name", "RateLimitRule")),
                                Match.objectLike(Map.of("Name", "AWSManagedRulesKnownBadInputsRuleSet")),
                                Match.objectLike(Map.of("Name", "AWSManagedRulesCommonRuleSet")),
                                Match.objectLike(Map.of("Name", "WafManualBlock")),
                                Match.objectLike(Map.of("Name", "OversizedBodyOutsideBookWrite")))))));

        assertOversizedBodyBlockedExceptOnABookWrite(edgeStackTemplate);

        edgeStackTemplate.resourceCountIs("AWS::WAFv2::RegexPatternSet", 1);
        edgeStackTemplate.hasResourceProperties(
                "AWS::WAFv2::RegexPatternSet",
                Match.objectLike(
                        Map.of("RegularExpressionList", Match.arrayWith(List.of("^/\\.(env|git/|aws/|ssh/)")))));

        // Blocks-only WAF logging, feeding the scan-detect Lambda through a subscription filter.
        edgeStackTemplate.resourceCountIs("AWS::WAFv2::LoggingConfiguration", 1);
        edgeStackTemplate.hasResourceProperties(
                "AWS::WAFv2::LoggingConfiguration",
                Match.objectLike(Map.of("LoggingFilter", Match.objectLike(Map.of("DefaultBehavior", "DROP")))));
        // Regression guard: redactedFields(List<Object>) silently drops its Map elements through
        // JSII (each entry synthesizes as {} instead of {"SingleHeader": {"Name": ...}}), which
        // WAFv2 accepts at synth time but rejects at deploy time
        // (EXACTLY_ONE_CONDITION_REQUIRED). The fix uses addPropertyOverride instead; this
        // assertion catches a regression back to the builder method.
        edgeStackTemplate.hasResourceProperties(
                "AWS::WAFv2::LoggingConfiguration",
                Match.objectLike(Map.of(
                        "RedactedFields",
                        Match.arrayWith(List.of(Match.objectLike(
                                Map.of("SingleHeader", Match.objectLike(Map.of("Name", "authorization")))))))));
        edgeStackTemplate.resourceCountIs("AWS::Logs::SubscriptionFilter", 1);

        // Issue #9 makes this one-line change on issue #10's behalf: its mid-session country
        // check needs CloudFront-Viewer-Country, and this origin request policy is the only
        // place that can add it.
        edgeStackTemplate.hasResourceProperties(
                "AWS::CloudFront::OriginRequestPolicy",
                Match.objectLike(Map.of(
                        "OriginRequestPolicyConfig",
                        Match.objectLike(Map.of(
                                "HeadersConfig",
                                Match.objectLike(
                                        Map.of("Headers", Match.arrayWith(List.of("CloudFront-Viewer-Country")))))))));

        // Manual IP block list (issue #9 phase 9.3): two empty IP sets by default, and the alarm
        // that confirms a hand-applied block is doing something.
        edgeStackTemplate.resourceCountIs("AWS::WAFv2::IPSet", 2);
        edgeStackTemplate.hasResourceProperties(
                "AWS::WAFv2::IPSet", Match.objectLike(Map.of("IPAddressVersion", "IPV4", "Addresses", List.of())));
        edgeStackTemplate.hasResourceProperties(
                "AWS::WAFv2::IPSet", Match.objectLike(Map.of("IPAddressVersion", "IPV6", "Addresses", List.of())));
        edgeStackTemplate.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName",
                        "tt-witheight-app-waf-manual-block",
                        "MetricName",
                        "BlockedRequests",
                        "Namespace",
                        "AWS/WAFV2")));

        infof("Created stack:", submitApplication.publishStack.getStackName());
        Template.fromStack(submitApplication.publishStack).resourceCountIs("Custom::CDKBucketDeployment", 1);

        if (submitApplication.selfDestructStack != null) {
            infof("Created stack:", submitApplication.selfDestructStack.getStackName());
            // Only the self-destruct function: its log group belongs to the environment stack.
            Template selfDestructStackTemplate = Template.fromStack(submitApplication.selfDestructStack);
            selfDestructStackTemplate.resourceCountIs("AWS::Lambda::Function", 1);
            assertStackHealthAlarm(selfDestructStackTemplate, 1, 0, routedPrefixes);
        }

        // Every Lambda function in every app stack must route its logs to an explicit, retained log
        // group — otherwise CDK (or CloudFormation's own custom-resource provider framework) gives
        // it an unnamed one with no retention and no removal policy, and it outlives the stack.
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.authStack));
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.hmrcStack));
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.hmrcItsaStack));
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

    @Test
    @SetEnvironmentVariable(key = "COGNITO_DIYA_GL_CLIENT_ID", value = "")
    void shouldThrowWhenDiyaGlUserPoolClientIdIsBlank() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        IllegalStateException thrown = org.junit.jupiter.api.Assertions.assertThrows(
                IllegalStateException.class, () -> new SubmitApplication(app, appProps));
        org.junit.jupiter.api.Assertions.assertTrue(thrown.getMessage().contains("COGNITO_DIYA_GL_CLIENT_ID"));
        org.junit.jupiter.api.Assertions.assertTrue(
                thrown.getMessage().contains("spreadsheets-diya-gl-app-client-id"));
    }

    /**
     * A DIYA-GL book write carries a zip far larger than the 8KB CloudFront lets WAF inspect, so
     * the managed SizeRestrictions_BODY rule blocked every save before it reached API Gateway. The
     * fix counts that managed rule and blocks an oversized body from our own rule instead, on every
     * request except a PUT to a book route. This pins both halves: dropping either one silently
     * restores the block, or drops the size protection from routes that still need it.
     */
    @SuppressWarnings("unchecked")
    private static void assertOversizedBodyBlockedExceptOnABookWrite(Template template) {
        var webAcl = (Map<String, Object>) template.findResources("AWS::WAFv2::WebACL").values().stream()
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected a web ACL"));
        var rules = (List<Map<String, Object>>) ((Map<String, Object>) webAcl.get("Properties")).get("Rules");

        // The rule's 8192 is CloudFront's default body inspection size. Raising it through
        // AssociationConfig would make the two disagree, so the size a request is judged on would
        // no longer be the size WAF was handed.
        org.junit.jupiter.api.Assertions.assertFalse(
                ((Map<String, Object>) webAcl.get("Properties")).containsKey("AssociationConfig"),
                "expected no raised body inspection limit alongside the 8192 threshold");

        var commonRuleSet = rules.stream()
                .filter(rule -> "AWSManagedRulesCommonRuleSet".equals(rule.get("Name")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected the common rule set"));
        var managedGroup = (Map<String, Object>)
                ((Map<String, Object>) commonRuleSet.get("Statement")).get("ManagedRuleGroupStatement");
        var overrides = (List<Map<String, Object>>) managedGroup.get("RuleActionOverrides");
        var sizeOverride = overrides.stream()
                .filter(override -> "SizeRestrictions_BODY".equals(override.get("Name")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected SizeRestrictions_BODY to carry an action override"));
        org.junit.jupiter.api.Assertions.assertTrue(
                ((Map<String, Object>) sizeOverride.get("ActionToUse")).containsKey("Count"),
                "expected SizeRestrictions_BODY to count rather than block");

        var oversizedBody = rules.stream()
                .filter(rule -> "OversizedBodyOutsideBookWrite".equals(rule.get("Name")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected the oversized-body rule"));
        org.junit.jupiter.api.Assertions.assertEquals(5, oversizedBody.get("Priority"));
        org.junit.jupiter.api.Assertions.assertTrue(
                ((Map<String, Object>) oversizedBody.get("Action")).containsKey("Block"),
                "expected the oversized-body rule to block");

        var conditions = (List<Map<String, Object>>)
                ((Map<String, Object>) ((Map<String, Object>) oversizedBody.get("Statement")).get("AndStatement"))
                        .get("Statements");
        org.junit.jupiter.api.Assertions.assertEquals(2, conditions.size());

        var sizeConstraint = (Map<String, Object>) conditions.get(0).get("SizeConstraintStatement");
        org.junit.jupiter.api.Assertions.assertEquals("GT", sizeConstraint.get("ComparisonOperator"));
        org.junit.jupiter.api.Assertions.assertEquals(8192, ((Number) sizeConstraint.get("Size")).intValue());
        var body = (Map<String, Object>) ((Map<String, Object>) sizeConstraint.get("FieldToMatch")).get("Body");
        org.junit.jupiter.api.Assertions.assertEquals(
                "MATCH",
                body.get("OversizeHandling"),
                "a body larger than the inspection limit must match, which is what the managed rule caught");

        var exemption =
                (Map<String, Object>) ((Map<String, Object>) conditions.get(1).get("NotStatement")).get("Statement");
        var exemptionParts =
                (List<Map<String, Object>>) ((Map<String, Object>) exemption.get("AndStatement")).get("Statements");
        org.junit.jupiter.api.Assertions.assertEquals(2, exemptionParts.size());

        // The uri-prefix half is an OrStatement covering both the new diya-gl prefix and, for the
        // window, the old books prefix - a PUT under either must be exempt from the size block.
        var uriPrefixOr = (Map<String, Object>) exemptionParts.get(0).get("OrStatement");
        org.junit.jupiter.api.Assertions.assertTrue(
                uriPrefixOr != null, "expected the uri-prefix exemption to be an OrStatement of both prefixes");
        var uriPrefixSearchStrings = ((List<Map<String, Object>>) uriPrefixOr.get("Statements"))
                .stream()
                        .map(part -> (String) ((Map<String, Object>) part.get("ByteMatchStatement")).get("SearchString"))
                        .toList();
        org.junit.jupiter.api.Assertions.assertTrue(
                uriPrefixSearchStrings.contains("/api/v1/diya-gl") && uriPrefixSearchStrings.contains("/api/v1/books"),
                "the size exemption must cover both the new and the legacy book route prefix, was "
                        + uriPrefixSearchStrings);

        var methodSearchString =
                (String) ((Map<String, Object>) exemptionParts.get(1).get("ByteMatchStatement")).get("SearchString");
        org.junit.jupiter.api.Assertions.assertEquals(
                "PUT", methodSearchString, "the exemption must be scoped to PUT and nothing wider");
    }

    /**
     * Finds the /api/v1/*, /api/v1/diya-gl/* and /api/v1/books/* cache behaviours on the
     * distribution and asserts they all point at the same response headers policy, and that the
     * policy carries no CorsConfig - so no behaviour lets CloudFront override whatever CORS header
     * the origin already sent.
     */
    @SuppressWarnings("unchecked")
    private static void assertApiBehavioursHaveNoCorsOverride(Template template) {
        var distributions = template.findResources("AWS::CloudFront::Distribution");
        org.junit.jupiter.api.Assertions.assertEquals(1, distributions.size());
        var distributionConfig = (Map<String, Object>)
                ((Map<String, Object>) distributions.values().iterator().next()).get("Properties");
        var config = (Map<String, Object>) distributionConfig.get("DistributionConfig");
        var cacheBehaviors = (List<Map<String, Object>>) config.get("CacheBehaviors");

        var apiBehaviour = cacheBehaviors.stream()
                .filter(behaviour -> "/api/v1/*".equals(behaviour.get("PathPattern")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected an /api/v1/* cache behaviour"));
        var diyaGlBehaviour = cacheBehaviors.stream()
                .filter(behaviour -> "/api/v1/diya-gl/*".equals(behaviour.get("PathPattern")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected an /api/v1/diya-gl/* cache behaviour"));
        var booksBehaviour = cacheBehaviors.stream()
                .filter(behaviour -> "/api/v1/books/*".equals(behaviour.get("PathPattern")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected a /api/v1/books/* cache behaviour"));

        String apiPolicyLogicalId =
                (String) ((Map<String, Object>) apiBehaviour.get("ResponseHeadersPolicyId")).get("Ref");
        String diyaGlPolicyLogicalId =
                (String) ((Map<String, Object>) diyaGlBehaviour.get("ResponseHeadersPolicyId")).get("Ref");
        String booksPolicyLogicalId =
                (String) ((Map<String, Object>) booksBehaviour.get("ResponseHeadersPolicyId")).get("Ref");
        org.junit.jupiter.api.Assertions.assertEquals(
                apiPolicyLogicalId,
                diyaGlPolicyLogicalId,
                "expected /api/v1/* and /api/v1/diya-gl/* to share one response headers policy");
        org.junit.jupiter.api.Assertions.assertEquals(
                booksPolicyLogicalId,
                apiPolicyLogicalId,
                "expected /api/v1/* and /api/v1/books/* to share one response headers policy");

        var policyResource =
                template.findResources("AWS::CloudFront::ResponseHeadersPolicy").get(apiPolicyLogicalId);
        org.junit.jupiter.api.Assertions.assertTrue(
                policyResource != null, "expected to find the shared API response headers policy resource");
        var policyProperties = (Map<String, Object>) ((Map<String, Object>) policyResource).get("Properties");
        var policyConfig = (Map<String, Object>) policyProperties.get("ResponseHeadersPolicyConfig");
        org.junit.jupiter.api.Assertions.assertFalse(
                policyConfig.containsKey("CorsConfig"),
                "expected the shared API response headers policy to carry no CorsConfig");
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

    /**
     * Asserts a stack's health-alarm shape: exactly one {@code {stack}-health} composite alarm,
     * whose rule names every one of the stack's {@code check-}-prefixed alarms, none of which is
     * itself routed. {@code expectedConstructs} pins the number of Lambda constructs and
     * {@code expectedAsyncPairs} how many of them are {@link AsyncApiLambda}s, which carry their
     * queue, DLQ and worker checks on top; pass {@code null} for the construct count when it
     * depends on optional config (e.g. a GitHub token ARN).
     */
    @SuppressWarnings("unchecked")
    static void assertStackHealthAlarm(
            Template template, Integer expectedConstructs, int expectedAsyncPairs, List<String> routedPrefixes) {
        Map<String, Map<String, Object>> composites = template.findResources("AWS::CloudWatch::CompositeAlarm");

        // Find the top-level health alarm (ends with HEALTH_ALARM_NAME_SUFFIX, no "-group" in the name)
        Map.Entry<String, Map<String, Object>> topLevelComposite = null;
        for (Map.Entry<String, Map<String, Object>> entry : composites.entrySet()) {
            Map<String, Object> props = (Map<String, Object>) entry.getValue().get("Properties");
            if (props != null) {
                String name = String.valueOf(props.get("AlarmName"));
                if (name.endsWith(Lambda.HEALTH_ALARM_NAME_SUFFIX) && !name.contains("-group")) {
                    topLevelComposite = entry;
                    break;
                }
            }
        }

        org.junit.jupiter.api.Assertions.assertNotNull(
                topLevelComposite,
                "No top-level stack health alarm found (must end with " + Lambda.HEALTH_ALARM_NAME_SUFFIX
                        + " and not contain '-group')");

        Map<String, Object> topLevelProps =
                (Map<String, Object>) topLevelComposite.getValue().get("Properties");
        String topLevelName = String.valueOf(topLevelProps.get("AlarmName"));
        org.junit.jupiter.api.Assertions.assertTrue(
                startsWithAny(topLevelName, routedPrefixes),
                "Top-level composite alarm '" + topLevelName + "' does not start with any routed prefix "
                        + routedPrefixes + " — it is a silent alarm");

        var checkAlarmLogicalIds = new ArrayList<String>();
        for (Map.Entry<String, Map<String, Object>> entry :
                template.findResources("AWS::CloudWatch::Alarm").entrySet()) {
            Map<String, Object> props = (Map<String, Object>) entry.getValue().get("Properties");
            if (props == null) continue;
            String alarmName = String.valueOf(props.get("AlarmName"));
            if (!alarmName.startsWith(Lambda.CHECK_ALARM_NAME_PREFIX)) continue;
            checkAlarmLogicalIds.add(entry.getKey());
            org.junit.jupiter.api.Assertions.assertFalse(
                    startsWithAny(alarmName, routedPrefixes),
                    "check- alarm '" + alarmName + "' unexpectedly starts with a routed prefix " + routedPrefixes
                            + " — it would double-notify alongside its stack's composite");
        }

        if (expectedConstructs != null) {
            int expectedChecks = Lambda.HEALTH_CHECK_COUNT * expectedConstructs
                    + AsyncApiLambda.ASYNC_HEALTH_CHECK_COUNT * expectedAsyncPairs;
            org.junit.jupiter.api.Assertions.assertEquals(
                    expectedChecks,
                    checkAlarmLogicalIds.size(),
                    "Expected " + expectedChecks + " check- alarms for " + expectedConstructs + " Lambda constructs of "
                            + "which " + expectedAsyncPairs + " are async pairs, found " + checkAlarmLogicalIds.size());
        }

        // Verify all check alarms are referenced by at least one composite (group or top-level)
        var allReferenced = new ArrayList<String>();
        for (Map.Entry<String, Map<String, Object>> composite : composites.entrySet()) {
            Map<String, Object> props =
                    (Map<String, Object>) composite.getValue().get("Properties");
            if (props != null) {
                collectGetAttTargets(props.get("AlarmRule"), allReferenced);
            }
        }
        var unreferenced = new ArrayList<>(checkAlarmLogicalIds);
        unreferenced.removeAll(allReferenced);
        org.junit.jupiter.api.Assertions.assertTrue(
                unreferenced.isEmpty(), "These check- alarms are missing from all composites: " + unreferenced);

        // Verify each composite alarm's rule length is under 10240 characters
        for (Map.Entry<String, Map<String, Object>> composite : composites.entrySet()) {
            Map<String, Object> props =
                    (Map<String, Object>) composite.getValue().get("Properties");
            if (props == null) continue;
            Object alarmRule = props.get("AlarmRule");
            int ruleLength = estimateAlarmRuleLength(alarmRule);
            org.junit.jupiter.api.Assertions.assertTrue(
                    ruleLength < 10240,
                    "Composite alarm " + composite.getKey() + " rule length " + ruleLength
                            + " exceeds CloudWatch's 10240 character limit");
        }
    }

    /**
     * Estimates the character length of a CloudFormation alarm rule by traversing its Fn::Join and
     * counting character lengths.
     */
    @SuppressWarnings("unchecked")
    private static int estimateAlarmRuleLength(Object node) {
        if (node instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) node;
            Object fnJoin = map.get("Fn::Join");
            if (fnJoin instanceof List) {
                List<Object> joinList = (List<Object>) fnJoin;
                if (joinList.size() >= 2) {
                    String separator = String.valueOf(joinList.get(0));
                    Object parts = joinList.get(1);
                    if (parts instanceof List) {
                        List<Object> partsList = (List<Object>) parts;
                        int totalLength = 0;
                        for (int i = 0; i < partsList.size(); i++) {
                            Object part = partsList.get(i);
                            if (part instanceof String) {
                                totalLength += ((String) part).length();
                            } else if (part instanceof Map) {
                                // Estimate Ref and Fn::GetAtt as 60 characters
                                totalLength += 60;
                            }
                            if (i < partsList.size() - 1) {
                                totalLength += separator.length();
                            }
                        }
                        return totalLength;
                    }
                }
            }
        }
        return 0;
    }

    private static boolean startsWithAny(String value, List<String> prefixes) {
        for (String prefix : prefixes) {
            if (value.startsWith(prefix)) return true;
        }
        return false;
    }

    /** Collects the logical ids an alarm rule refers to, from the Fn::GetAtt calls in its Fn::Join. */
    @SuppressWarnings("unchecked")
    private static void collectGetAttTargets(Object node, List<String> into) {
        if (node instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) node;
            Object getAtt = map.get("Fn::GetAtt");
            if (getAtt instanceof List && !((List<Object>) getAtt).isEmpty()) {
                into.add(String.valueOf(((List<Object>) getAtt).get(0)));
            }
            map.values().forEach(value -> collectGetAttTargets(value, into));
        } else if (node instanceof List) {
            ((List<Object>) node).forEach(value -> collectGetAttTargets(value, into));
        }
    }

    /**
     * Reads the {@code alarmName} prefix matchers off OpsStack's {@code *-alarm-state-change}
     * EventBridge rule — the actual routing contract, not a copy of it.
     */
    @SuppressWarnings("unchecked")
    static List<String> routedAlarmNamePrefixes(Template opsStackTemplate) {
        Map<String, Map<String, Object>> rules = opsStackTemplate.findResources("AWS::Events::Rule");
        for (Map.Entry<String, Map<String, Object>> entry : rules.entrySet()) {
            Map<String, Object> props = (Map<String, Object>) entry.getValue().get("Properties");
            if (props == null) continue;
            String name = String.valueOf(props.get("Name"));
            if (!name.endsWith("-alarm-state-change")) continue;
            Map<String, Object> eventPattern = (Map<String, Object>) props.get("EventPattern");
            Map<String, Object> detail = (Map<String, Object>) eventPattern.get("detail");
            List<Object> alarmNameMatchers = (List<Object>) detail.get("alarmName");
            List<String> prefixes = new ArrayList<>();
            for (Object matcher : alarmNameMatchers) {
                Map<String, Object> matcherMap = (Map<String, Object>) matcher;
                Object prefix = matcherMap.get("prefix");
                if (prefix != null) prefixes.add(String.valueOf(prefix));
            }
            return prefixes;
        }
        throw new AssertionFailedError("No *-alarm-state-change EventBridge rule found in OpsStack template");
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

    /**
     * True if some IAM policy attached to a role matching {@code slug} grants {@code action} on a
     * resource whose ARN string ends in {@code resourceSuffix}. Used to confirm an index grant
     * (e.g. {@code /index/bundleId-expiry-index}) landed on the expected role.
     */
    @SuppressWarnings("unchecked")
    private static boolean findRoleGrantedActionOnResourceSuffix(
            Template template, String slug, String action, String resourceSuffix) {
        Map<String, Map<String, Object>> policies = template.findResources("AWS::IAM::Policy");
        for (Map<String, Object> resource : policies.values()) {
            Map<String, Object> props = (Map<String, Object>) resource.get("Properties");
            if (props == null) continue;
            if (!policyAttachesToRoleMatching(props, slug)) continue;
            Object document = props.get("PolicyDocument");
            if (!(document instanceof Map)) continue;
            Object statements = ((Map<String, Object>) document).get("Statement");
            if (!(statements instanceof List<?>)) continue;
            for (Object statementObj : (List<Object>) statements) {
                if (!(statementObj instanceof Map)) continue;
                Map<String, Object> statement = (Map<String, Object>) statementObj;
                if (!statementGrantsAction(statement, action)) continue;
                if (statementTargetsResourceEndingWith(statement, resourceSuffix)) return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static boolean statementGrantsAction(Map<String, Object> statement, String action) {
        Object statementAction = statement.get("Action");
        if (statementAction instanceof String) return action.equals(statementAction);
        if (statementAction instanceof List<?>) {
            for (Object a : (List<Object>) statementAction) {
                if (action.equals(a)) return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static boolean statementTargetsResourceEndingWith(Map<String, Object> statement, String suffix) {
        Object resource = statement.get("Resource");
        List<Object> resources = resource instanceof List<?>
                ? (List<Object>) resource
                : resource == null ? List.of() : List.of(resource);
        for (Object r : resources) {
            if (resourceEndsWith(r, suffix)) return true;
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static boolean resourceEndsWith(Object resource, String suffix) {
        if (resource instanceof String) return ((String) resource).endsWith(suffix);
        if (resource instanceof List<?>) {
            for (Object part : (List<Object>) resource) {
                if (resourceEndsWith(part, suffix)) return true;
            }
            return false;
        }
        if (resource instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) resource;
            Object fnJoin = map.get("Fn::Join");
            if (fnJoin instanceof List<?> joinArgs && joinArgs.size() == 2) {
                return resourceEndsWith(joinArgs.get(1), suffix);
            }
            Object fnSub = map.get("Fn::Sub");
            if (fnSub instanceof String s) return s.endsWith(suffix);
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
