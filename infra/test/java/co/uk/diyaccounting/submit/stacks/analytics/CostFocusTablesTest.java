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
                Match.objectLike(
                        Map.of(
                                "TableInput",
                                Match.objectLike(
                                        Map.of(
                                                "StorageDescriptor",
                                                Match.objectLike(
                                                        Map.of(
                                                                "Location",
                                                                "s3://docs-env-analytics-lake-111111111111/curated/cost/focus/",
                                                                "SerdeInfo",
                                                                Match.objectLike(
                                                                        Map.of(
                                                                                "SerializationLibrary",
                                                                                "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe")))))))));
    }

    @Test
    void glueColumnNameLowersTheFocusApisPascalCasingToSnakeCase() {
        assertEquals("billing_account_id", CostFocusTables.glueColumnName("BillingAccountId"));
        assertEquals("sku_price_id", CostFocusTables.glueColumnName("SkuPriceId"));
        assertEquals("tags", CostFocusTables.glueColumnName("Tags"));
        assertEquals("x_discounts", CostFocusTables.glueColumnName("x_Discounts"));
        assertEquals("x_service_code", CostFocusTables.glueColumnName("x_ServiceCode"));
    }

    @SuppressWarnings("unchecked")
    @Test
    void glueColumnsMatchFocusApiColumnsInNameCountAndOrder() {
        Template template = synthTemplate();

        var table = template.findResources("AWS::Glue::Table").values().iterator().next();
        var properties = (Map<String, Object>) table.get("Properties");
        var tableInput = (Map<String, Object>) properties.get("TableInput");
        var storageDescriptor = (Map<String, Object>) tableInput.get("StorageDescriptor");
        var columns = (List<Map<String, Object>>) storageDescriptor.get("Columns");

        var actualNames = columns.stream().map(column -> (String) column.get("Name")).toList();
        var expectedNames = CostFocusIngestion.FOCUS_1_2_COLUMNS.stream()
                .map(CostFocusTables::glueColumnName)
                .toList();

        assertEquals(expectedNames, actualNames);
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
                                        Match.arrayWith(
                                                List.of(
                                                        Map.of("Name", "billed_cost", "Type", "double"),
                                                        Map.of("Name", "service_name", "Type", "string"),
                                                        Map.of("Name", "sub_account_id", "Type", "string"),
                                                        Map.of("Name", "tags", "Type", "map<string,string>"))))))))));
    }
}
