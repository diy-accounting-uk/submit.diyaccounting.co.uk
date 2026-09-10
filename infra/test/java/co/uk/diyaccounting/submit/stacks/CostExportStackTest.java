/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.stacks.analytics.CostFocusIngestion;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class CostExportStackTest {

    private static final String PROD_READER_ROLE = "arn:aws:iam::972912397388:role/prod-env-cost-focus-copy-role";
    private static final String CI_READER_ROLE = "arn:aws:iam::367191799875:role/ci-env-cost-focus-copy-role";

    private static Template synthCostExportStack() {
        App app = new App();
        var stack = new CostExportStack(
                app,
                "cost-CostExportStack",
                CostExportStack.CostExportStackProps.builder()
                        .env(Environment.builder()
                                .account("887764105431")
                                .region("eu-west-2")
                                .build())
                        .bucketName("diy-accounting-cost-focus-887764105431")
                        .exportName("diy-focus-1-2")
                        .readerRoleArns(List.of(PROD_READER_ROLE, CI_READER_ROLE))
                        .build());
        return Template.fromStack(stack);
    }

    @Test
    void bucketIsPrivateAndDestroyableWithALifecycleRule() {
        Template template = synthCostExportStack();

        template.resourceCountIs("AWS::S3::Bucket", 1);
        template.hasResourceProperties(
                "AWS::S3::Bucket",
                Match.objectLike(Map.of(
                        "BucketName",
                        "diy-accounting-cost-focus-887764105431",
                        "PublicAccessBlockConfiguration",
                        Match.objectLike(Map.of(
                                "BlockPublicAcls", true,
                                "BlockPublicPolicy", true,
                                "IgnorePublicAcls", true,
                                "RestrictPublicBuckets", true)))));
        template.hasResource("AWS::S3::Bucket", Map.of("DeletionPolicy", "Delete"));
    }

    @Test
    void bucketPolicyGrantsDataExportsDeliveryAndTheDeploymentAccountsReadAccess() {
        Template template = synthCostExportStack();

        template.hasResourceProperties(
                "AWS::S3::BucketPolicy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(
                                        Match.objectLike(
                                                Map.of(
                                                        "Sid",
                                                        "AllowBcmDataExportsDelivery",
                                                        "Principal",
                                                        Map.of("Service", "bcm-data-exports.amazonaws.com"))),
                                        Match.objectLike(
                                                Map.of(
                                                        "Sid", "AllowDeploymentAccountsToReadTheExport",
                                                        "Action", "s3:GetObject")),
                                        Match.objectLike(
                                                Map.of(
                                                        "Sid", "AllowDeploymentAccountsToListTheExport",
                                                        "Action", "s3:ListBucket")))))))));
    }

    @Test
    void exportIsFocusOneTwoInParquetWithDailyGranularity() {
        Template template = synthCostExportStack();

        template.resourceCountIs("AWS::BCMDataExports::Export", 1);
        template.hasResourceProperties(
                "AWS::BCMDataExports::Export",
                Match.objectLike(Map.of(
                        "Export",
                        Match.objectLike(Map.of(
                                "Name",
                                "diy-focus-1-2",
                                "DataQuery",
                                Match.objectLike(Map.of(
                                        "QueryStatement",
                                        "SELECT " + String.join(", ", CostFocusIngestion.FOCUS_1_2_COLUMNS)
                                                + " FROM FOCUS_1_2_AWS",
                                        "TableConfigurations",
                                        Map.of("FOCUS_1_2_AWS", Map.of("TIME_GRANULARITY", "DAILY")))),
                                "DestinationConfigurations",
                                Match.objectLike(Map.of(
                                        "S3Destination",
                                        Match.objectLike(
                                                Map.of(
                                                        "S3Bucket",
                                                        "diy-accounting-cost-focus-887764105431",
                                                        "S3Prefix",
                                                        "focus",
                                                        "S3OutputConfigurations",
                                                        Match.objectLike(
                                                                Map.of(
                                                                        "Format", "PARQUET",
                                                                        "OutputType", "CUSTOM")))))),
                                "RefreshCadence",
                                Map.of("Frequency", "SYNCHRONOUS"))))));
    }

    /**
     * Pins the column names to the exact PascalCase the FOCUS Data Exports table dictionary
     * gives them (confirmed with {@code aws bcm-data-exports get-table --table-name
     * FOCUS_1_2_AWS}), independently of {@link CostFocusIngestion#FOCUS_1_2_COLUMNS} itself, so a
     * regression to Glue's lowercase snake_case convention — the mistake that broke this export
     * before — fails here rather than at deploy time.
     */
    private static final List<String> FOCUS_1_2_COLUMNS_AS_THE_API_SPELLS_THEM = List.of(
            "BillingAccountId",
            "BillingAccountName",
            "BillingCurrency",
            "BillingPeriodStart",
            "BillingPeriodEnd",
            "ChargeCategory",
            "ChargeClass",
            "ChargeDescription",
            "ChargeFrequency",
            "ChargePeriodStart",
            "ChargePeriodEnd",
            "BilledCost",
            "ContractedCost",
            "EffectiveCost",
            "ListCost",
            "ListUnitPrice",
            "ContractedUnitPrice",
            "PricingQuantity",
            "PricingUnit",
            "ConsumedQuantity",
            "ConsumedUnit",
            "CommitmentDiscountCategory",
            "CommitmentDiscountId",
            "CommitmentDiscountStatus",
            "CommitmentDiscountType",
            "InvoiceId",
            "InvoiceIssuerName",
            "ProviderName",
            "PublisherName",
            "RegionId",
            "RegionName",
            "ResourceId",
            "ResourceName",
            "ResourceType",
            "ServiceCategory",
            "ServiceName",
            "SkuId",
            "SkuPriceId",
            "SubAccountId",
            "SubAccountName",
            "Tags",
            "x_Discounts",
            "x_Operation",
            "x_ServiceCode");

    @Test
    void queryStatementUsesTheFocusApisOwnPascalCasingNotGluesSnakeCase() {
        Template template = synthCostExportStack();

        template.hasResourceProperties(
                "AWS::BCMDataExports::Export",
                Match.objectLike(Map.of(
                        "Export",
                        Match.objectLike(Map.of(
                                "DataQuery",
                                Match.objectLike(Map.of(
                                        "QueryStatement",
                                        "SELECT "
                                                + String.join(", ", FOCUS_1_2_COLUMNS_AS_THE_API_SPELLS_THEM)
                                                + " FROM FOCUS_1_2_AWS")))))));
    }

    @Test
    void noBucketPolicyWhenNoReaderRolesAreConfigured() {
        App app = new App();
        var stack = new CostExportStack(
                app,
                "cost-CostExportStack",
                CostExportStack.CostExportStackProps.builder()
                        .env(Environment.builder()
                                .account("887764105431")
                                .region("eu-west-2")
                                .build())
                        .bucketName("diy-accounting-cost-focus-887764105431")
                        .exportName("diy-focus-1-2")
                        .readerRoleArns(List.of())
                        .build());
        Template template = Template.fromStack(stack);

        var policies = template.findResources("AWS::S3::BucketPolicy");
        assertNoStatementNamed(policies, "AllowDeploymentAccountsToReadTheExport");
    }

    @SuppressWarnings("unchecked")
    private static void assertNoStatementNamed(Map<String, Map<String, Object>> policies, String sid) {
        for (var policy : policies.values()) {
            var properties = (Map<String, Object>) policy.get("Properties");
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            var statements = (List<Map<String, Object>>) document.get("Statement");
            for (var statement : statements) {
                if (sid.equals(statement.get("Sid"))) {
                    throw new AssertionError("did not expect a statement named " + sid);
                }
            }
        }
    }
}
