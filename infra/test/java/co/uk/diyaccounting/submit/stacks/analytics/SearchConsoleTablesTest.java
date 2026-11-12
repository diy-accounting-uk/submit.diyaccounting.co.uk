/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class SearchConsoleTablesTest {

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

        new SearchConsoleTables(
                stack,
                SearchConsoleTables.SearchConsoleTablesProps.builder()
                        .idPrefix("docs-env")
                        .databaseName("docs_env_analytics")
                        .lakeBucketName("docs-env-analytics-lake-111111111111")
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void createsOneTableWithDateProjectionUnderTheSearchConsolePrefix() {
        Template template = synthTemplate();

        template.resourceCountIs("AWS::Glue::Table", 1);
        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(
                        Map.of(
                                "TableInput",
                                Match.objectLike(
                                        Map.of(
                                                "Name",
                                                "search_console_queries",
                                                "PartitionKeys",
                                                List.of(Map.of("Name", "dt", "Type", "date")),
                                                "Parameters",
                                                Match.objectLike(
                                                        Map.of(
                                                                "projection.enabled",
                                                                "true",
                                                                "projection.dt.type",
                                                                "date",
                                                                "projection.dt.format",
                                                                "yyyy-MM-dd",
                                                                "storage.location.template",
                                                                "s3://docs-env-analytics-lake-111111111111/curated/searchconsole/report=queries/dt=${dt}/")),
                                                "StorageDescriptor",
                                                Match.objectLike(
                                                        Map.of(
                                                                "Location",
                                                                "s3://docs-env-analytics-lake-111111111111/curated/searchconsole/report=queries/")))))));
    }

    @Test
    void holdsTheColumnsTheNightlyPullWrites() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        List.of(
                                                Map.of("Name", "property", "Type", "string"),
                                                Map.of("Name", "date", "Type", "string"),
                                                Map.of("Name", "page", "Type", "string"),
                                                Map.of("Name", "query", "Type", "string"),
                                                Map.of("Name", "country", "Type", "string"),
                                                Map.of("Name", "device", "Type", "string"),
                                                Map.of("Name", "clicks", "Type", "bigint"),
                                                Map.of("Name", "impressions", "Type", "bigint"),
                                                Map.of("Name", "ctr", "Type", "double"),
                                                Map.of("Name", "position", "Type", "double")))))))));
    }
}
