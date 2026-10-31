/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.SubmitApplicationCdkSupport.*;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.constructs.Lambda;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import org.opentest4j.AssertionFailedError;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class SubmitApplicationCdkResourceTest extends SubmitApplicationCdkTestEnvironment {

    @Test
    void everyLambdaThatPublishesActivityEventsCanReadTheOperatorList() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());

        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        new SubmitApplication(app, appProps);
        app.synth();

        var result = ActivityPublisherGrants.check(app);
        assertTrue(result.checked() > 0, "no Lambda names ACTIVITY_BUS_NAME");
        assertEquals(List.of(), result.ungranted());
    }

    @Test
    void everyLambdaBehindAnAuthorizerCanReadTheOperatorList() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());

        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        var submitApplication = new SubmitApplication(app, appProps);
        app.synth();

        var result = ActivityPublisherGrants.checkAuthenticatedApiLambdas(app, submitApplication);
        assertTrue(result.checked() > 0, "no ApiLambda sits behind an authorizer");
        assertEquals(List.of(), result.ungranted());
    }

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
        assertGroupedStackHealthAlarm(
                authStackTemplate, List.of("cognito-token-post", "custom-authorizer"), List.of(), routedPrefixes);

        infof("Created stack:", submitApplication.hmrcStack.getStackName());
        Template hmrcStackTemplate = Template.fromStack(submitApplication.hmrcStack);
        hmrcStackTemplate.resourceCountIs("AWS::Lambda::Function", 46);
        // Every HMRC caller keeps a log-errors alarm of its own; the receipt read is the only
        // function under /api/v1/hmrc here that does not call HMRC.
        assertGroupedStackHealthAlarm(
                hmrcStackTemplate,
                List.of(
                        "hmrc-itsa-bsas-se-adjust-post",
                        "hmrc-itsa-bsas-se-get",
                        "hmrc-itsa-bsas-trigger-post",
                        "hmrc-itsa-business-details-get",
                        "hmrc-itsa-calculation-get",
                        "hmrc-itsa-calculation-trigger-post",
                        "hmrc-itsa-crystallisation-get",
                        "hmrc-itsa-final-declaration-post",
                        "hmrc-itsa-obligations-get",
                        "hmrc-itsa-se-annual-get",
                        "hmrc-itsa-se-annual-put",
                        "hmrc-itsa-se-period-get",
                        "hmrc-itsa-se-period-post",
                        "hmrc-itsa-se-period-put",
                        "hmrc-itsa-se-periods-get",
                        "hmrc-itsa-status-get",
                        "hmrc-receipt-get",
                        "hmrc-token-post",
                        "hmrc-vat-liabilities-get",
                        "hmrc-vat-obligation-get",
                        "hmrc-vat-payments-get",
                        "hmrc-vat-penalties-get",
                        "hmrc-vat-return-get",
                        "hmrc-vat-return-post"),
                outsideCallerQueueChecks(
                        "hmrc-itsa-bsas-se-adjust-post",
                        "hmrc-itsa-bsas-se-get",
                        "hmrc-itsa-bsas-trigger-post",
                        "hmrc-itsa-business-details-get",
                        "hmrc-itsa-calculation-get",
                        "hmrc-itsa-calculation-trigger-post",
                        "hmrc-itsa-crystallisation-get",
                        "hmrc-itsa-final-declaration-post",
                        "hmrc-itsa-obligations-get",
                        "hmrc-itsa-se-annual-get",
                        "hmrc-itsa-se-annual-put",
                        "hmrc-itsa-se-period-get",
                        "hmrc-itsa-se-period-post",
                        "hmrc-itsa-se-period-put",
                        "hmrc-itsa-se-periods-get",
                        "hmrc-itsa-status-get",
                        "hmrc-vat-liabilities-get",
                        "hmrc-vat-obligation-get",
                        "hmrc-vat-payments-get",
                        "hmrc-vat-penalties-get",
                        "hmrc-vat-return-get",
                        "hmrc-vat-return-post"),
                routedPrefixes);

        infof("Created stack:", submitApplication.hmrcItsaStack.getStackName());
        Template hmrcItsaStackTemplate = Template.fromStack(submitApplication.hmrcItsaStack);
        hmrcItsaStackTemplate.resourceCountIs("AWS::Lambda::Function", 52);
        // The four assist functions call no external API and share the /api/v1/hmrc alarm.
        assertGroupedStackHealthAlarm(
                hmrcItsaStackTemplate,
                List.of(
                        "hmrc",
                        "hmrc-itsa-bsas-uk-property-adjust-post",
                        "hmrc-itsa-bsas-uk-property-get",
                        "hmrc-itsa-foreign-property-annual-get",
                        "hmrc-itsa-foreign-property-annual-put",
                        "hmrc-itsa-foreign-property-details-get",
                        "hmrc-itsa-foreign-property-details-post",
                        "hmrc-itsa-foreign-property-details-put",
                        "hmrc-itsa-foreign-property-period-get",
                        "hmrc-itsa-foreign-property-period-post",
                        "hmrc-itsa-foreign-property-period-put",
                        "hmrc-itsa-losses-and-claims-delete",
                        "hmrc-itsa-losses-and-claims-get",
                        "hmrc-itsa-losses-and-claims-put",
                        "hmrc-itsa-tax-liability-adjust-delete",
                        "hmrc-itsa-tax-liability-adjust-get",
                        "hmrc-itsa-tax-liability-adjust-put",
                        "hmrc-itsa-uk-property-annual-get",
                        "hmrc-itsa-uk-property-annual-put",
                        "hmrc-itsa-uk-property-period-get",
                        "hmrc-itsa-uk-property-period-post",
                        "hmrc-itsa-uk-property-period-put",
                        "hmrc-itsa-uk-property-periods-get"),
                joined(
                        outsideCallerQueueChecks(
                                "hmrc-itsa-bsas-uk-property-adjust-post",
                                "hmrc-itsa-bsas-uk-property-get",
                                "hmrc-itsa-foreign-property-annual-get",
                                "hmrc-itsa-foreign-property-annual-put",
                                "hmrc-itsa-foreign-property-details-get",
                                "hmrc-itsa-foreign-property-details-post",
                                "hmrc-itsa-foreign-property-details-put",
                                "hmrc-itsa-foreign-property-period-get",
                                "hmrc-itsa-foreign-property-period-post",
                                "hmrc-itsa-foreign-property-period-put",
                                "hmrc-itsa-losses-and-claims-delete",
                                "hmrc-itsa-losses-and-claims-get",
                                "hmrc-itsa-losses-and-claims-put",
                                "hmrc-itsa-tax-liability-adjust-delete",
                                "hmrc-itsa-tax-liability-adjust-get",
                                "hmrc-itsa-tax-liability-adjust-put",
                                "hmrc-itsa-uk-property-annual-get",
                                "hmrc-itsa-uk-property-annual-put",
                                "hmrc-itsa-uk-property-period-get",
                                "hmrc-itsa-uk-property-period-post",
                                "hmrc-itsa-uk-property-period-put",
                                "hmrc-itsa-uk-property-periods-get"),
                        // the four assist functions share one grouped pair
                        List.of("hmrc-itsa-dlq-not-empty", "hmrc-itsa-queue-message-age")),
                routedPrefixes);

        infof("Created stack:", submitApplication.hmrcItsaPropertyStack.getStackName());
        Template hmrcItsaPropertyStackTemplate = Template.fromStack(submitApplication.hmrcItsaPropertyStack);
        hmrcItsaPropertyStackTemplate.resourceCountIs("AWS::Lambda::Function", 4);
        assertGroupedStackHealthAlarm(
                hmrcItsaPropertyStackTemplate,
                List.of("hmrc-itsa-bsas-foreign-property-adjust", "hmrc-itsa-bsas-foreign-property-get"),
                outsideCallerQueueChecks(
                        "hmrc-itsa-bsas-foreign-property-adjust", "hmrc-itsa-bsas-foreign-property-get"),
                routedPrefixes);

        infof("Created stack:", submitApplication.companiesHouseStack.getStackName());
        Template companiesHouseStackTemplate = Template.fromStack(submitApplication.companiesHouseStack);
        companiesHouseStackTemplate.resourceCountIs("AWS::Lambda::Function", 24);
        // The two previews call no external API and share the /api/v1/companies-house alarm.
        assertGroupedStackHealthAlarm(
                companiesHouseStackTemplate,
                List.of(
                        "companies-house",
                        "companies-house-accounts-get",
                        "companies-house-accounts-post",
                        "companies-house-company-get",
                        "companies-house-confirmation-statement-get",
                        "companies-house-confirmation-statement-post",
                        "companies-house-email-address-post",
                        "companies-house-email-eligibility-get",
                        "companies-house-filing-data-post",
                        "companies-house-office-address-get",
                        "companies-house-office-address-post",
                        "companies-house-officers-get",
                        "companies-house-psc-get",
                        "companies-house-psc-verification-statement-get",
                        "companies-house-psc-verification-statement-post",
                        "companies-house-search-get",
                        "companies-house-token-post",
                        "companies-house-transaction-get",
                        "companies-house-transaction-post",
                        "companies-house-transaction-put",
                        "hmrc-ct-return-get",
                        "hmrc-ct-return-post",
                        "hmrc-ct-return-preview-post"),
                List.of(),
                routedPrefixes);

        // Every route that can carry a clientId resolves it via enforceBundles -> getClient(),
        // which needs the practice clients table name on the Lambda's own environment. Regression
        // guard for the gap PU-7h found: PU-7g wired the getClient() call into these three routes
        // without also wiring the table name and read access to reach it.
        assertHasEnvironmentVariable(
                hmrcStackTemplate,
                submitApplication.hmrcStack.hmrcVatReturnPostLambdaProps.ingestFunctionName(),
                "PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
        assertHasEnvironmentVariable(
                hmrcStackTemplate,
                submitApplication.hmrcStack.hmrcVatObligationGetLambdaProps.ingestFunctionName(),
                "PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
        assertHasEnvironmentVariable(
                companiesHouseStackTemplate,
                submitApplication.companiesHouseStack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                "PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");

        infof("Created stack:", submitApplication.accountStack.getStackName());
        // 29 Lambdas: bundleGet(1), bundlePost(2), bundleDelete(2), operatorSnapshotGet(1),
        // practiceClientsListGet(1), practiceClientsPost(1), practiceClientGet(1),
        // practiceClientDelete(1), practiceClientAuthorisationInvitePost(1),
        // practiceClientAuthorisationGet(1), practiceClientAuthorisationInviteDelete(1),
        // interestPost(1), passGet(1), passPost(1), passAdminPost(1), passReleasePost(1),
        // affiliatePost(1), affiliateGet(1),
        // passHeldGet(1), passGeneratePost(1), passMyPassesGet(1), bundleCapacityReconcile(1), commissionRelease(1),
        // sessionBeaconPost(1),
        // sessionSignOutPost(1), activityStartedPost(1), accountSettingsPut(1)
        Template accountStackTemplate = Template.fromStack(submitApplication.accountStack);
        accountStackTemplate.resourceCountIs("AWS::Lambda::Function", 29);
        assertGroupedStackHealthAlarm(
                accountStackTemplate,
                List.of(
                        "account-settings-put",
                        "activity-started-post",
                        "affiliate",
                        "bundle",
                        "bundle-capacity-reconcile",
                        "commission-release",
                        "interest-post",
                        "operator-snapshot-get",
                        "pass",
                        "practice",
                        "practice-client-authorisation-get",
                        "practice-client-authorisation-invite-delete",
                        "practice-client-authorisation-invite-post",
                        "session"),
                List.of("account-dlq-not-empty", "account-queue-message-age"),
                routedPrefixes);

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
        // with customer data. Two functions use BatchGetItem by key: bundleGet reads several capacity
        // counters at once, and passMyPassesGet reads the figures item of each of the caller's own
        // passes. Any other role holding either action has been granted more than it calls.
        List<String> rolesThatReadInBulk = List.of("bundle-get", "pass-my-passes-get");
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
        // 5 Lambdas: billingCheckoutPost(1), billingActivityCheckoutPost(1), billingCheckoutSessionGet(1),
        // billingPortalGet(1), billingRecoverPost(1)
        // billingWebhookPost moved to env-level BillingWebhookStack
        Template billingStackTemplate = Template.fromStack(submitApplication.billingStack);
        billingStackTemplate.resourceCountIs("AWS::Lambda::Function", 5);
        assertGroupedStackHealthAlarm(
                billingStackTemplate,
                List.of(
                        "billing-activity-checkout-post",
                        "billing-checkout-post",
                        "billing-checkout-session-get",
                        "billing-portal-get",
                        "billing-recover-post"),
                List.of(),
                routedPrefixes);

        assertGroupedStackHealthAlarm(
                Template.fromStack(submitApplication.diyaGlStack),
                List.of("diya-gl", "practice-client-book-move-post"),
                List.of(),
                routedPrefixes);

        // One invocation-errors alarm covers the whole deployment set and is routed directly.
        opsStackTemplateForRouting.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName",
                        "tt-witheight-app" + Lambda.DEPLOYMENT_ERRORS_SUFFIX,
                        "Namespace",
                        Lambda.LOG_METRIC_NAMESPACE,
                        "MetricName",
                        "tt-witheight-app" + Lambda.DEPLOYMENT_ERRORS_SUFFIX)));
        org.junit.jupiter.api.Assertions.assertTrue(
                startsWithAny("tt-witheight-app" + Lambda.DEPLOYMENT_ERRORS_SUFFIX, routedPrefixes));

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
        Template apiRoutesStackTemplate = Template.fromStack(submitApplication.apiRoutesStack);
        apiRoutesStackTemplate.resourceCountIs("AWS::ApiGatewayV2::Api", 0);
        List<Template> apiTemplates = List.of(apiStackTemplate, apiRoutesStackTemplate);
        // Each API stack keeps headroom under CloudFormation's 500-resource limit, which the
        // deploy otherwise only reports at synth in the pipeline.
        assertResourceTotalUnder(apiStackTemplate, 450);
        assertResourceTotalUnder(apiRoutesStackTemplate, 450);
        // Confirm key routes exist, including multiple HTTP methods on the same path
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/bundle"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "DELETE /api/v1/bundle"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "DELETE /api/v1/bundle/{id}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/companies-house/search"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/companies-house/company/{companyNumber}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/companies-house/token"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/companies-house/transaction"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/companies-house/transaction/{transactionId}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "PUT /api/v1/companies-house/transaction/{transactionId}"));
        assertApiRoute(
                apiTemplates,
                Map.of("RouteKey", "GET /api/v1/companies-house/company/{companyNumber}/registered-office-address"));
        assertApiRoute(
                apiTemplates,
                Map.of(
                        "RouteKey",
                        "POST /api/v1/companies-house/transaction/{transactionId}/registered-office-address"));
        assertApiRoute(
                apiTemplates,
                Map.of(
                        "RouteKey",
                        "GET /api/v1/companies-house/company/{companyNumber}/registered-email-address/eligibility"));
        assertApiRoute(
                apiTemplates,
                Map.of(
                        "RouteKey",
                        "POST /api/v1/companies-house/transaction/{transactionId}/registered-email-address"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/companies-house/accounts/render"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/companies-house/accounts"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/companies-house/accounts/{submissionNumber}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/hmrc/ct/return/preview"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/hmrc/ct/return"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/hmrc/ct/return/{correlationId}"));
        assertApiRoute(
                apiTemplates, Map.of("RouteKey", "GET /api/v1/companies-house/company/{companyNumber}/officers"));
        assertApiRoute(
                apiTemplates,
                Map.of(
                        "RouteKey",
                        "GET /api/v1/companies-house/company/{companyNumber}/persons-with-significant-control"));
        assertApiRoute(
                apiTemplates, Map.of("RouteKey", "POST /api/v1/companies-house/company/{companyNumber}/filing-data"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/companies-house/confirmation-statement/render"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "POST /api/v1/companies-house/confirmation-statement"));
        assertApiRoute(
                apiTemplates,
                Map.of("RouteKey", "GET /api/v1/companies-house/confirmation-statement/{submissionNumber}"));
        // The new diya-gl paths are the primary routes; the old books paths are served alongside
        // them permanently, since the spreadsheets site's cloud.js keeps calling the old paths.
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/diya-gl"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/diya-gl/{bookId}/versions/{version}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "PUT /api/v1/diya-gl/{bookId}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "DELETE /api/v1/diya-gl/{bookId}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "OPTIONS /api/v1/diya-gl"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "OPTIONS /api/v1/diya-gl/{bookId}/versions/{version}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "OPTIONS /api/v1/diya-gl/{bookId}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/books"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "GET /api/v1/books/{bookId}/versions/{version}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "PUT /api/v1/books/{bookId}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "DELETE /api/v1/books/{bookId}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "OPTIONS /api/v1/books"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "OPTIONS /api/v1/books/{bookId}/versions/{version}"));
        assertApiRoute(apiTemplates, Map.of("RouteKey", "OPTIONS /api/v1/books/{bookId}"));

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
        // total to 135 + 8 = 143. GET and POST /api/v1/practice/clients share one path (2 method
        // routes + 1 auto-HEAD), and GET and DELETE /api/v1/practice/clients/{clientId} share
        // another (2 + 1), for another 3 + 3 = 6 routes, bringing the total to 143 + 6 = 149. GET
        // /api/v1/practice/clients/{clientId}/authorisation adds its own route plus its own
        // auto-HEAD route, since no other method shares that path, for 149 + 2 = 151. POST and
        // DELETE /api/v1/practice/clients/{clientId}/authorisation/invitations share one path (2
        // method routes + 1 auto-HEAD, since auto-HEAD is added once per path regardless of which
        // method registers it first), for another 3 routes, bringing the total to 151 + 3 = 154.
        // POST /api/v1/practice/clients/{clientId}/books/{bookId}/move adds its own route plus
        // its own auto-HEAD route, since no other method shares that path, for 154 + 2 = 156. The
        // six confirmation statement routes (officers, PSCs, filing-data, preview, submit, poll)
        // each sit on their own unshared path, adding six primary routes plus six auto-HEAD
        // routes, for 156 + 12 = 168. POST /api/v1/billing/activity-checkout adds its own route
        // plus its own auto-HEAD route, since no other method shares that path, for 168 + 2 = 170.
        // POST /api/v1/session/sign-out adds its own route, its own auto-HEAD route, and an
        // unauthenticated OPTIONS preflight route (every Cognito app client's origin needs the
        // cross-origin browser preflight to reach a route with no authoriser, the same reason
        // the books routes get one), for 170 + 3 = 173. POST /api/v1/activity/started adds its own
        // route plus its own auto-HEAD route, for 173 + 2 = 175. The three Company Tax Return routes
        // each sit on their own unshared path, adding three primary routes and three auto-HEAD
        // routes, for 187 + 6 = 193. GET, POST and PUT /api/v1/hmrc/itsa/foreign-property/details
        // share one path, adding three primary routes and one auto-HEAD route, for 193 + 4 = 197.
        // GET, POST and PUT /api/v1/hmrc/itsa/foreign-property/period share one path and add the
        // same four, for 197 + 4 = 201. GET and PUT /api/v1/hmrc/itsa/foreign-property/annual share one
        // path and add two primary routes and one auto-HEAD route, for 201 + 3 = 204. GET
        // /api/v1/hmrc/itsa/bsas/foreign-property and POST its /adjust path each sit on their own
        // unshared path, adding two primary routes and two auto-HEAD routes, for 204 + 4 = 208. PUT
        // /api/v1/account/settings sits on its own unshared path, adding its primary route and its
        // auto-HEAD route, for 208 + 2 = 210. POST /api/v1/pass/release sits on its own unshared path,
        // adding its primary route and its auto-HEAD route, for 210 + 2 = 212. GET and POST /api/v1/affiliate
        // share one path and add two primary routes and one auto-HEAD route, for 212 + 3 = 215. GET /api/v1/pass/held
        // sits on its own unshared path and adds
        // a primary route and an auto-HEAD route, for 217 in total.
        assertEquals(
                217,
                apiStackTemplate.findResources("AWS::ApiGatewayV2::Route").size()
                        + apiRoutesStackTemplate
                                .findResources("AWS::ApiGatewayV2::Route")
                                .size());

        // Dashboard moved to environment-level ObservabilityStack
        infof("Created stack:", submitApplication.opsStack.getStackName());
        // The Telegram forwarder moved to env-level ActivityStack, and the alarm-to-GitHub-issue
        // Lambda only exists when a GitHub token ARN is configured (this test's config doesn't
        // set one), so this stack builds no Lambda construct of its own and has no composite
        // health alarm.
        opsStackTemplateForRouting.resourceCountIs("AWS::CloudWatch::CompositeAlarm", 0);

        // The Synthetics canaries are prod-only (OpsStackTest covers both sides of that gate);
        // this environment's own deploy pipeline runs behaviour tests against every fresh set
        // instead.
        opsStackTemplateForRouting.resourceCountIs("AWS::Synthetics::Canary", 0);

        infof("Created stack:", submitApplication.edgeStack.getStackName());
        Template edgeStackTemplate = Template.fromStack(submitApplication.edgeStack);
        edgeStackTemplate.resourceCountIs("AWS::CloudFront::Distribution", 1);
        // The WAF scan-detect Lambda is this stack's only Lambda construct.
        assertGroupedStackHealthAlarm(edgeStackTemplate, List.of("waf-scan-detect"), List.of(), routedPrefixes);

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
            assertGroupedStackHealthAlarm(
                    selfDestructStackTemplate, List.of("self-destruct"), List.of(), routedPrefixes);
        }

        // Every Lambda function in every app stack must route its logs to an explicit, retained log
        // group — otherwise CDK (or CloudFormation's own custom-resource provider framework) gives
        // it an unnamed one with no retention and no removal policy, and it outlives the stack.
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.authStack));
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.hmrcStack));
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.hmrcItsaStack));
        assertEveryLambdaHasAnExplicitLogGroup(Template.fromStack(submitApplication.hmrcItsaPropertyStack));
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
        org.junit.jupiter.api.Assertions.assertTrue(thrown.getMessage().contains("spreadsheets-diya-gl-app-client-id"));
    }

    @Test
    @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "ci")
    @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "ci-set1")
    @SetEnvironmentVariable(key = "COGNITO_MCP_CLIENT_ID", value = "ci-set1-cognito-mcp-client-id")
    @SetEnvironmentVariable(key = "GITHUB_APP_ID", value = "123")
    @SetEnvironmentVariable(key = "GITHUB_APP_INSTALLATION_ID", value = "456")
    void ciDeploymentSetFunctionsCarryNoChecks() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);

        for (var stack : List.of(
                submitApplication.authStack,
                submitApplication.hmrcStack,
                submitApplication.hmrcItsaStack,
                submitApplication.hmrcItsaPropertyStack,
                submitApplication.companiesHouseStack,
                submitApplication.accountStack,
                submitApplication.billingStack,
                submitApplication.diyaGlStack,
                submitApplication.mcpStack,
                submitApplication.opsStack)) {
            Template template = Template.fromStack(stack);
            org.junit.jupiter.api.Assertions.assertFalse(
                    template.findResources("AWS::Lambda::Function").isEmpty(),
                    stack.getStackName() + " builds no Lambda function");
            template.resourceCountIs("AWS::CloudWatch::CompositeAlarm", 0);
            template.resourcePropertiesCountIs(
                    "AWS::CloudWatch::Alarm",
                    Match.objectLike(
                            Map.of("AlarmName", Match.stringLikeRegexp("^" + Lambda.CHECK_ALARM_NAME_PREFIX + ".*"))),
                    0);
            template.resourcePropertiesCountIs(
                    "AWS::Logs::MetricFilter",
                    Match.objectLike(Map.of(
                            "MetricTransformations",
                            List.of(Match.objectLike(Map.of("MetricNamespace", "Submit/LambdaLogs"))))),
                    0);
        }
    }
}
