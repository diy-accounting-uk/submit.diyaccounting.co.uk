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

class Ga4TablesTest {

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

        new Ga4Tables(
                stack,
                Ga4Tables.Ga4TablesProps.builder()
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

        for (String tableName : List.of("ga4_traffic", "ga4_pages", "ga4_events")) {
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
    void eachTableLocationSitsUnderItsOwnReportPrefix() {
        Template template = synthTemplate();

        var tables = template.findResources("AWS::Glue::Table");
        assertEquals(3, tables.size());

        var expectedReportNames =
                Map.of("ga4_traffic", "traffic", "ga4_pages", "pages", "ga4_events", "events");

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
                    "s3://docs-env-analytics-lake-111111111111/curated/ga4/report="
                            + expectedReportNames.get(tableName) + "/",
                    location);
        }
    }

    @Test
    void trafficAndEventMetricColumnsUseNumericTypesNotString() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "ga4_traffic",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(List.of(
                                                Map.of("Name", "sessions", "Type", "bigint"),
                                                Map.of("Name", "activeUsers", "Type", "bigint"),
                                                Map.of(
                                                        "Name",
                                                        "averageSessionDuration",
                                                        "Type",
                                                        "double"))))))))));

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "ga4_events",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(List.of(
                                                Map.of("Name", "eventCount", "Type", "bigint"),
                                                Map.of(
                                                        "Name", "eventValue", "Type", "double"))))))))));
    }

    @Test
    void dateDimensionColumnIsKeptAsAPlainStringAlongsideTheDtPartition() {
        Template template = synthTemplate();

        for (String tableName : List.of("ga4_traffic", "ga4_pages", "ga4_events")) {
            template.hasResourceProperties(
                    "AWS::Glue::Table",
                    Match.objectLike(Map.of(
                            "TableInput",
                            Match.objectLike(Map.of(
                                    "Name",
                                    tableName,
                                    "StorageDescriptor",
                                    Match.objectLike(Map.of(
                                            "Columns",
                                            Match.arrayWith(
                                                    List.of(Map.of("Name", "date", "Type", "string"))))))))));
        }
    }
}
