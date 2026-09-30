/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
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

class PayPalDonationTablesTest {

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

        new PayPalDonationTables(
                stack,
                PayPalDonationTables.PayPalDonationTablesProps.builder()
                        .idPrefix("docs-env")
                        .databaseName("docs_env_analytics")
                        .lakeBucketName("docs-env-analytics-lake-111111111111")
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void createsOneGzippedJsonTableWithDateProjectionAsItsOnlyPartitionKey() {
        Template template = synthTemplate();

        template.resourceCountIs("AWS::Glue::Table", 1);
        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "paypal_donations",
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

    @Test
    void locationSitsUnderCuratedPaypalAndColumnsMatchWhatThePullJobWrites() {
        Template template = synthTemplate();

        var table =
                template.findResources("AWS::Glue::Table").values().iterator().next();
        @SuppressWarnings("unchecked")
        var tableInput = (Map<String, Object>) ((Map<String, Object>) table.get("Properties")).get("TableInput");
        @SuppressWarnings("unchecked")
        var storage = (Map<String, Object>) tableInput.get("StorageDescriptor");
        assertEquals(
                "s3://docs-env-analytics-lake-111111111111/curated/paypal/paypal_donations/", storage.get("Location"));

        @SuppressWarnings("unchecked")
        var columns = (List<Map<String, String>>) storage.get("Columns");
        assertEquals(
                List.of(
                        "id:string",
                        "date:string",
                        "amount:double",
                        "fee:double",
                        "product:string",
                        "original_amount:double",
                        "original_currency:string",
                        "refund_of:string"),
                columns.stream().map(c -> c.get("Name") + ":" + c.get("Type")).toList());
    }
}
