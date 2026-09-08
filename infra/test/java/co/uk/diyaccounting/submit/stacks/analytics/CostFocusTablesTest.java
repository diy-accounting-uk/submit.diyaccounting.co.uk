/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
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

class CostFocusTablesTest {

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

        new CostFocusTables(
                stack,
                CostFocusTables.CostFocusTablesProps.builder()
                        .idPrefix("docs-env")
                        .databaseName("docs_env_analytics")
                        .lakeBucketName("docs-env-analytics-lake-111111111111")
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void createsOneParquetTableWithDatePartitionProjection() {
        Template template = synthTemplate();

        template.resourceCountIs("AWS::Glue::Table", 1);
        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "cost_focus",
                                "PartitionKeys",
                                List.of(Map.of("Name", "dt", "Type", "date")),
                                "Parameters",
                                Match.objectLike(Map.of(
                                        "classification",
                                        "parquet",
                                        "projection.enabled",
                                        "true",
                                        "projection.dt.type",
                                        "date")))))));
    }

    @Test
    void locationSitsUnderCuratedCostFocus() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Location",
                                        "s3://docs-env-analytics-lake-111111111111/curated/cost/focus/",
                                        "SerdeInfo",
                                        Match.objectLike(Map.of(
                                                "SerializationLibrary",
                                                "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe")))))))));
    }

    @Test
    void columnsCarryCostAndTagFields() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(List.of(
                                                Map.of("Name", "billed_cost", "Type", "double"),
                                                Map.of("Name", "service_name", "Type", "string"),
                                                Map.of("Name", "sub_account_id", "Type", "string"),
                                                Map.of("Name", "tags", "Type", "map<string,string>"))))))))));
    }
}
