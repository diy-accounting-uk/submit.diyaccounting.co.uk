/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
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

    private static final int VIEW_COUNT = 8;

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
        template.resourceCountIs("Custom::AWS", VIEW_COUNT);
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
                "v_signup_to_first_submission",
                "v_traffic_by_country_daily");

        var customResources = template.findResources("Custom::AWS");
        var viewNamesFound = new ArrayList<String>();
        for (var resource : customResources.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            var create = String.valueOf(properties.get("Create"));
            assertTrue(create.contains("startQueryExecution"), "expected an Athena startQueryExecution call: " + create);
            assertTrue(create.contains("CREATE OR REPLACE VIEW"), "expected a CREATE OR REPLACE VIEW statement: " + create);
            for (String viewName : expectedViewNames) {
                if (create.contains("CREATE OR REPLACE VIEW " + viewName + " AS")) {
                    viewNamesFound.add(viewName);
                    break;
                }
            }
        }
        assertEquals(expectedViewNames.size(), viewNamesFound.size(), "expected every view name to appear exactly once");
        assertEquals(expectedViewNames, Set.copyOf(viewNamesFound));
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
