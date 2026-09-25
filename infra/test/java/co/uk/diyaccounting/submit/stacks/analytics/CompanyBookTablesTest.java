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

class CompanyBookTablesTest {

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

        new CompanyBookTables(
                stack,
                CompanyBookTables.CompanyBookTablesProps.builder()
                        .idPrefix("docs-env")
                        .databaseName("docs_env_analytics")
                        .lakeBucketName("docs-env-analytics-lake-111111111111")
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void createsOneTableWithDateProjectionAndNoOtherPartitionKey() {
        Template template = synthTemplate();

        template.resourceCountIs("AWS::Glue::Table", 1);

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "company_accounts",
                                "PartitionKeys",
                                List.of(Map.of("Name", "dt", "Type", "date")),
                                "Parameters",
                                Match.objectLike(Map.of(
                                        "classification",
                                        "json",
                                        "projection.enabled",
                                        "true",
                                        "projection.dt.type",
                                        "date",
                                        "projection.dt.format",
                                        "yyyy-MM-dd")))))));
    }

    @Test
    void tableCarriesNoCompressionTypeBecauseTheSourceObjectIsPlainJson() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Parameters",
                                Match.not(Match.objectLike(Map.of("compressionType", Match.anyValue()))))))));
    }

    @Test
    void tableLocationSitsUnderTheCuratedFinancePrefix() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Location",
                                        "s3://docs-env-analytics-lake-111111111111/curated/finance/")))))));
    }

    @Test
    void columnsCarryTheTopLevelFieldsAlongsideTheAccountsStruct() {
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
                                                Map.of("Name", "date", "Type", "string"),
                                                Map.of("Name", "bookid", "Type", "string"),
                                                Map.of("Name", "latestversion", "Type", "bigint"),
                                                Map.of("Name", "latestetag", "Type", "string"))))))))));
    }

    @Test
    void accountsColumnCarriesProfitAndLossAndBalanceSheetStructs() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(List.of(Match.objectLike(Map.of(
                                                "Name",
                                                "accounts",
                                                "Type",
                                                Match.stringLikeRegexp(
                                                        ".*profitandloss:struct<turnover:bigint,costs:bigint,profit:bigint>.*balancesheet:struct<currentyear:struct<fixedassets:bigint.*"))))))))))));
    }

    @Test
    void tableCountStaysAtOne() {
        assertEquals(1, synthTemplate().findResources("AWS::Glue::Table").size());
    }
}
