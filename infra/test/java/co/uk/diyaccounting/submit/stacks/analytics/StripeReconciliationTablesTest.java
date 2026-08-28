/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class StripeReconciliationTablesTest {

    private static Template synthTemplate() {
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

        new StripeReconciliationTables(
                stack,
                StripeReconciliationTables.StripeReconciliationTablesProps.builder()
                        .idPrefix("docs-env")
                        .databaseName("docs_env_analytics")
                        .lakeBucketName("docs-env-analytics-lake-111111111111")
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void createsThreeTablesWithDateProjectionAndNoOtherPartitionKey() {
        Template template = synthTemplate();

        template.resourceCountIs("AWS::Glue::Table", 3);

        for (String tableName :
                List.of("stripe_balance_transactions", "stripe_charges", "stripe_subscriptions")) {
            template.hasResourceProperties(
                    "AWS::Glue::Table",
                    Match.objectLike(Map.of(
                            "TableInput",
                            Match.objectLike(Map.of(
                                    "Name",
                                    tableName,
                                    "PartitionKeys",
                                    List.of(Map.of("Name", "dt", "Type", "date")),
                                    "Parameters",
                                    Match.objectLike(Map.of(
                                            "classification",
                                            "json",
                                            "compressionType",
                                            "gzip",
                                            "projection.enabled",
                                            "true",
                                            "projection.dt.type",
                                            "date",
                                            "projection.dt.format",
                                            "yyyy-MM-dd")))))));
        }
    }

    @Test
    void eachTableLocationSitsUnderItsOwnCuratedStripePrefix() {
        Template template = synthTemplate();

        var tables = template.findResources("AWS::Glue::Table");
        assertEquals(3, tables.size());

        for (var resource : tables.values()) {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            @SuppressWarnings("unchecked")
            var tableInput = (Map<String, Object>) properties.get("TableInput");
            var tableName = (String) tableInput.get("Name");
            @SuppressWarnings("unchecked")
            var storageDescriptor = (Map<String, Object>) tableInput.get("StorageDescriptor");
            var location = (String) storageDescriptor.get("Location");

            assertEquals(
                    "s3://docs-env-analytics-lake-111111111111/curated/stripe/" + tableName + "/", location);
        }
    }

    @Test
    void balanceTransactionAmountColumnsAreBigintNotDouble() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "stripe_balance_transactions",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(List.of(
                                                Map.of("Name", "amount", "Type", "bigint"),
                                                Map.of("Name", "net", "Type", "bigint"),
                                                Map.of("Name", "fee", "Type", "bigint"))))))))));
    }

    @Test
    void chargeAndSubscriptionColumnsCarryTheHashedCustomerFieldNotARawId() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "stripe_charges",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(
                                                List.of(Map.of("Name", "customer", "Type", "string"))))))))));

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "stripe_subscriptions",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(
                                                List.of(Map.of("Name", "customer", "Type", "string"))))))))));
    }
}
