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

class Ga4DailyTablesTest {

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

        new Ga4DailyTables(
                stack,
                Ga4DailyTables.Ga4DailyTablesProps.builder()
                        .idPrefix("docs-env")
                        .databaseName("docs_env_analytics")
                        .lakeBucketName("docs-env-analytics-lake-111111111111")
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void createsFourTablesWithDateProjectionAndNoOtherPartitionKey() {
        Template template = synthTemplate();

        template.resourceCountIs("AWS::Glue::Table", 4);

        for (String tableName :
                List.of(
                        "sessions_by_host_source_daily",
                        "funnel_steps_daily",
                        "key_events_daily",
                        "downloads_by_product_daily")) {
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
    void eachTableLocationSitsUnderItsOwnCuratedPrefix() {
        Template template = synthTemplate();

        var tables = template.findResources("AWS::Glue::Table");
        assertEquals(4, tables.size());

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
                    "s3://docs-env-analytics-lake-111111111111/curated/ga4_daily/" + tableName + "/", location);
        }
    }

    @Test
    void sessionsByHostSourceColumnsCarryTheDimensionAndCountFields() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "sessions_by_host_source_daily",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(List.of(
                                                Map.of("Name", "hostname", "Type", "string"),
                                                Map.of("Name", "session_source", "Type", "string"),
                                                Map.of("Name", "visitor_kind", "Type", "string"),
                                                Map.of("Name", "sessions", "Type", "bigint"))))))))));
    }

    @Test
    void downloadsByProductColumnsCarryTheProductDimension() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "downloads_by_product_daily",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(List.of(
                                                Map.of("Name", "product", "Type", "string"),
                                                Map.of("Name", "downloads", "Type", "bigint"))))))))));
    }
}
