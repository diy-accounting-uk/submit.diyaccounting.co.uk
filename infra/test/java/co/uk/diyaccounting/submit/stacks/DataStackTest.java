/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.ArrayList;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Matcher;
import software.amazon.awscdk.assertions.Template;

class DataStackTest {

    private static DataStack synthDataStack() {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new DataStack(
                app,
                "TestDataStack",
                DataStack.DataStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .build());
    }

    /**
     * Map.of does not preserve key order, so the fields of a serialized AwsSdkCall "Create" string
     * (action name, table name, nested parameters) can appear in any order. A lookahead-based regex
     * asserts all of them are present somewhere without pinning their relative order.
     *
     * <p>stringLikeRegexp evaluates as a JavaScript RegExp under the jsii bridge, not a Java Pattern:
     * Java-only syntax such as {@code \Q...\E} or the inline {@code (?s)} flag is invalid here. The
     * Create string is single-line JSON, so plain {@code .*} already covers it without a dotall flag.
     */
    private static Matcher createContaining(String... requiredSubstrings) {
        StringBuilder pattern = new StringBuilder();
        for (String substring : requiredSubstrings) {
            pattern.append("(?=.*").append(substring).append(")");
        }
        pattern.append(".*");
        return Match.stringLikeRegexp(pattern.toString());
    }

    @Test
    void streamedTablesGetNewAndOldImagesStreams() {
        DataStack dataStack = synthDataStack();
        Template template = Template.fromStack(dataStack);

        // The four tables usage analytics reads from: receipts, bundles, subscriptions, passes.
        for (String tableName : new String[] {
            dataStack.receiptsTable.getTableName(),
            dataStack.bundlesTable.getTableName(),
            dataStack.subscriptionsTable.getTableName(),
            dataStack.passesTable.getTableName(),
        }) {
            template.hasResourceProperties(
                    "Custom::AWS",
                    Map.of(
                            "Create",
                            createContaining(
                                    "updateTable", tableName, "\"StreamEnabled\":true", "NEW_AND_OLD_IMAGES")));
        }
    }

    @Test
    void excludedTablesGetNoStreamUpdate() {
        DataStack dataStack = synthDataStack();
        Template template = Template.fromStack(dataStack);

        // Async request tables, bundle capacity, the HMRC audit trail, and the security state
        // table are excluded: no updateTable call mentions StreamSpecification for any of their
        // table names.
        for (String tableName : new String[] {
            dataStack.bundlePostAsyncRequestsTable.getTableName(),
            dataStack.bundleDeleteAsyncRequestsTable.getTableName(),
            dataStack.hmrcVatReturnPostAsyncRequestsTable.getTableName(),
            dataStack.hmrcVatReturnGetAsyncRequestsTable.getTableName(),
            dataStack.hmrcVatObligationGetAsyncRequestsTable.getTableName(),
            dataStack.hmrcApiRequestsTable.getTableName(),
            dataStack.bundleCapacityTable.getTableName(),
            dataStack.securityStateTable.getTableName(),
        }) {
            assertEquals(
                    0,
                    template.findResources(
                                    "Custom::AWS",
                                    Map.of(
                                            "Properties",
                                            Map.of(
                                                    "Create",
                                                    createContaining("updateTable", tableName, "StreamSpecification"))))
                            .size(),
                    "expected no stream update for " + tableName);
        }
    }

    @Test
    void everyLambdaFunctionHasAnExplicitLogGroup() {
        DataStack dataStack = synthDataStack();
        Template template = Template.fromStack(dataStack);

        // DataStack creates no Lambda of its own: every Custom::AWS resource here (CreateTable,
        // PITR, GSI, TTL, stream enable/describe) shares one singleton provider Lambda, and that
        // singleton must carry the one explicit, retained LogGroup KindCdk hands it — otherwise
        // CDK gives it a bare auto-created log group with no retention and no removal policy.
        assertEquals(
                1,
                template.findResources("AWS::Lambda::Function").size(),
                "expected only the singleton AwsCustomResource provider Lambda");
        assertEveryLambdaHasAnExplicitLogGroup(template);
    }

    /**
     * Asserts every Lambda function carries an explicit {@code LoggingConfig.LogGroup}, so its logs
     * land in a group this stack retains and deletes with it, not an unnamed one CloudWatch creates
     * with no retention on first invoke.
     */
    @SuppressWarnings("unchecked")
    private static void assertEveryLambdaHasAnExplicitLogGroup(Template template) {
        var missing = new ArrayList<String>();
        template.findResources("AWS::Lambda::Function").forEach((id, resource) -> {
            var properties = (Map<String, Object>) resource.get("Properties");
            var loggingConfig = properties == null ? null : (Map<String, Object>) properties.get("LoggingConfig");
            if (loggingConfig == null || !loggingConfig.containsKey("LogGroup")) {
                missing.add(id);
            }
        });
        assertTrue(missing.isEmpty(), "Lambda functions with no explicit log group: " + missing);
    }

    @Test
    void streamCustomResourceDependsOnItsTableCustomResource() {
        DataStack dataStack = synthDataStack();
        Template template = Template.fromStack(dataStack);

        // Without an explicit dependency, the stream's UpdateTable call can race the table's
        // CreateTable call on a fresh stack. CloudFormation's DependsOn is where that ordering shows
        // up in the synthesized template.
        var resource = template.findResources(
                "Custom::AWS",
                Map.of(
                        "Properties",
                        Map.of(
                                "Create",
                                createContaining(
                                        "updateTable",
                                        dataStack.receiptsTable.getTableName(),
                                        "StreamSpecification"))));
        assertEquals(1, resource.size());
        var streamResource = resource.values().iterator().next();
        Object dependsOn = ((Map<?, ?>) streamResource).get("DependsOn");
        assertEquals(true, dependsOn != null, "expected the stream custom resource to declare a DependsOn");
    }
}
