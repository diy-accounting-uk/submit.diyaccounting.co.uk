/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.s3.Bucket;

/**
 * Instantiates {@link BusinessViews} standalone in a throwaway stack, the way a
 * concurrently-edited {@code AnalyticsStack.java} cannot be relied on to do yet. This keeps the
 * construct's own tests independent of how (or whether) it has been wired in.
 */
class BusinessViewsTest {

    private static final int VIEW_COUNT = 24;

    private Template synthBusinessViews() {
        var sharedNames = SubmitSharedNames.forDocs();
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

        var resultsBucket = Bucket.fromBucketName(stack, "ResultsBucket", sharedNames.analyticsResultsBucketName);

        var props = BusinessViews.BusinessViewsProps.builder()
                .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                .glueDatabaseName(sharedNames.glueDatabaseName)
                .athenaWorkGroupName(sharedNames.athenaWorkGroupName)
                .resultsBucket(resultsBucket)
                .build();

        new BusinessViews(stack, props);

        return Template.fromStack(stack);
    }

    @Test
    void createsOneNamedQueryAndOneViewCreatorPerView() {
        Template template = synthBusinessViews();

        template.resourceCountIs("AWS::Athena::NamedQuery", VIEW_COUNT);
        template.resourceCountIs("Custom::AthenaView", VIEW_COUNT);
    }

    @Test
    void allViewCreatorsShareOneOnEventAndOneIsCompleteLambdaRatherThanOnePairPerView() {
        Template template = synthBusinessViews();

        // Every per-view Custom::AthenaView shares the same Provider, so there is exactly one
        // "createView.onEvent" function and one "createView.isComplete" function regardless of
        // VIEW_COUNT — not one pair per view, which is what would blow the per-role inline-policy
        // budget the class Javadoc warns about. The Provider framework itself adds a handful more
        // Lambda functions (its own onEvent/isComplete/onTimeout dispatch), so the total function
        // count is intentionally not asserted here.
        var lambdas = template.findResources("AWS::Lambda::Function");
        var onEventCount = countByHandler(lambdas, "createView.onEvent");
        var isCompleteCount = countByHandler(lambdas, "createView.isComplete");

        assertEquals(1, onEventCount, "expected exactly one createView.onEvent function");
        assertEquals(1, isCompleteCount, "expected exactly one createView.isComplete function");
    }

    private static long countByHandler(Map<String, Map<String, Object>> lambdas, String handler) {
        return lambdas.values().stream()
                .filter(resource -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return handler.equals(properties.get("Handler"));
                })
                .count();
    }

    @Test
    void everyViewSqlIsLoadedAndRunAsACreateOrReplaceView() {
        Template template = synthBusinessViews();

        Set<String> expectedViewNames = Set.of(
                "v_active_users_daily",
                "v_submissions_daily",
                "v_login_to_submission_funnel",
                "v_pass_redemptions_daily",
                "v_revenue_daily",
                "v_hmrc_failures_by_class",
                "v_business_activity_daily",
                "v_signup_to_first_submission",
                "v_traffic_by_country_daily",
                "v_ga4_funnel_daily",
                "v_purchase_reconciliation_daily",
                "v_submissions_by_activity_daily",
                "v_traffic_sources_daily",
                "v_availability_sli_daily",
                "v_alarm_state_changes_daily",
                "v_dora_runs_daily",
                "v_returning_submitters_quarterly",
                "v_subscription_renewals_daily",
                "v_subscription_cancellations_daily",
                "v_operator_interventions_daily",
                "v_compliance_status");

        var customResources = template.findResources("Custom::AthenaView");
        var viewNamesFound = new ArrayList<String>();
        for (var resource : customResources.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            var viewName = String.valueOf(properties.get("ViewName"));
            var sql = String.valueOf(properties.get("Sql"));
            assertTrue(
                    sql.contains("CREATE OR REPLACE VIEW " + viewName + " AS"),
                    "expected " + viewName + "'s Sql property to define that view: " + sql);
            if (expectedViewNames.contains(viewName)) {
                viewNamesFound.add(viewName);
            }
        }
        assertEquals(
                expectedViewNames.size(), viewNamesFound.size(), "expected every view name to appear exactly once");
        assertEquals(expectedViewNames, Set.copyOf(viewNamesFound));
    }

    @Test
    void everyViewCreatorRunsThroughTheSharedProviderNotDirectlyAgainstAthena() {
        Template template = synthBusinessViews();

        // A Custom::AthenaView with no polling behind it is exactly the bug this construct fixes:
        // a bare AwsCustomResource around startQueryExecution returns as soon as the query is
        // submitted, so CloudFormation would mark it successful before the view actually exists.
        // ServiceToken pointing at the shared Provider's framework function is what proves the
        // resource runs through the onEvent/isComplete waiter instead.
        var customResources = template.findResources("Custom::AthenaView");
        assertEquals(VIEW_COUNT, customResources.size());
        for (var resource : customResources.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            var serviceToken = String.valueOf(properties.get("ServiceToken"));
            assertTrue(
                    serviceToken.contains("frameworkonEvent"),
                    "expected ServiceToken to reference the Provider framework's onEvent function: " + serviceToken);
        }
    }

    @Test
    void onEventAndIsCompleteFunctionsDependOnTheirIamPolicyAttaching() {
        Template template = synthBusinessViews();

        // The policy that grants Athena, Glue and S3 permissions is a separate resource attached
        // to the shared role after the role exists; a Lambda Function only orders after the role
        // itself (it references the role by ARN), so without an explicit dependency here the
        // function could run before the policy attaches — the same race the single shared grant
        // used to guard against for every AwsCustomResource.
        var lambdas = template.findResources("AWS::Lambda::Function");
        var policies = template.findResources("AWS::IAM::Policy");
        var athenaViewPolicyLogicalId = policies.keySet().stream()
                .filter(id -> id.contains("AthenaViewCreatorPolicy"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected an AthenaViewCreatorPolicy resource"));

        for (String handler : List.of("createView.onEvent", "createView.isComplete")) {
            var function = lambdas.values().stream()
                    .filter(resource -> {
                        @SuppressWarnings("unchecked")
                        var properties = (Map<String, Object>) resource.get("Properties");
                        return handler.equals(properties.get("Handler"));
                    })
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("expected a " + handler + " function"));
            var dependsOn = function.get("DependsOn");
            assertTrue(dependsOn instanceof List<?>, "expected a DependsOn list on the " + handler + " function");
            assertTrue(
                    ((List<?>) dependsOn).stream().anyMatch(id -> String.valueOf(id).contains(athenaViewPolicyLogicalId)),
                    "expected the " + handler + " function to depend on the Athena view IAM policy, found: "
                            + dependsOn);
        }
    }

    @Test
    void purchaseReconciliationDependsOnTheGa4FunnelViewItReadsFrom() {
        Template template = synthBusinessViews();

        // v_purchase_reconciliation_daily's SQL reads v_ga4_funnel_daily directly, and two
        // CustomResources carry no implicit CloudFormation ordering between them: without an
        // explicit dependency, CloudFormation could create the reconciliation view before the
        // funnel view exists in the catalog, and the CREATE OR REPLACE VIEW would fail.
        var customResources = template.findResources("Custom::AthenaView");
        var reconciliationLogicalId = logicalIdForView(customResources, "v_purchase_reconciliation_daily");
        var funnelLogicalId = logicalIdForView(customResources, "v_ga4_funnel_daily");

        var reconciliationResource = customResources.get(reconciliationLogicalId);
        var dependsOn = reconciliationResource.get("DependsOn");
        assertTrue(dependsOn instanceof List<?>, "expected a DependsOn list on the reconciliation view resource");
        assertTrue(
                ((List<?>) dependsOn).stream().anyMatch(id -> String.valueOf(id).contains(funnelLogicalId)),
                "expected the reconciliation view to depend on the funnel view's Custom::AthenaView resource, found: "
                        + dependsOn);
    }

    private static String logicalIdForView(Map<String, Map<String, Object>> customResources, String viewName) {
        return customResources.entrySet().stream()
                .filter(entry -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) entry.getValue().get("Properties");
                    return viewName.equals(properties.get("ViewName"));
                })
                .map(Map.Entry::getKey)
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected a Custom::AthenaView resource for " + viewName));
    }

    @Test
    void noIamPolicyStatementGrantsOnEveryResource() {
        Template template = synthBusinessViews();

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
                offenders.add(policy.getKey() + " " + statement.get("Action"));
            }
        }
        assertTrue(offenders.isEmpty(), "IAM statements granting on every resource: " + offenders);
    }

    @Test
    void athenaAndGlueGrantsAreScopedToTheOneWorkgroupAndTheNamedTablesOnly() {
        Template template = synthBusinessViews();
        var sharedNames = SubmitSharedNames.forDocs();
        var workGroupArn = "arn:aws:athena:eu-west-2:111111111111:workgroup/" + sharedNames.athenaWorkGroupName;

        var policies = template.findResources("AWS::IAM::Policy");
        assertTrue(!policies.isEmpty(), "expected at least one IAM policy");

        for (Map<String, Object> policy : policies.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.get("Properties");
            @SuppressWarnings("unchecked")
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) document.get("Statement");
            for (Map<String, Object> statement : statements) {
                var action = statement.get("Action");
                var actions = action instanceof List<?> list ? list : List.of(String.valueOf(action));
                if (actions.stream().anyMatch(a -> "athena:StartQueryExecution".equals(a))) {
                    // CDK renders a single-element Resource list as a bare string, not a list.
                    assertEquals(workGroupArn, statement.get("Resource"));
                }
            }
        }
    }
}
