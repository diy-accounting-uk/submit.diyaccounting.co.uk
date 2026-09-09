/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import org.immutables.value.Value;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.glue.CfnTable;
import software.constructs.Construct;

/**
 * A Glue table over the FOCUS 1.2 cost export, copied nightly into {@code
 * curated/cost/focus/dt=<date>/} by {@link CostFocusIngestion}. The columns are {@link
 * CostFocusIngestion#FOCUS_1_2_COLUMNS}, lower-cased to Glue's conventional snake_case by {@link
 * #glueColumnName(String)}; {@code tags} is kept as a single map rather than one column per key,
 * since which cost allocation tags matter is a question for the SQL in {@code v_cost_*}, not for
 * this table's shape.
 *
 * <p>Modelled on {@link WorkflowRunTables}, but Parquet rather than JSON, matching the format
 * the export itself writes: one {@code dt} partition-projection column so a new day's objects
 * are queryable with no crawler and no {@code MSCK REPAIR}.
 *
 * <p>Not a {@link Construct} subclass itself, matching {@link WorkflowRunTables}: a plain class
 * that takes the parent scope and builds its children against it. The caller owns the Glue
 * database and must add a dependency from {@link #costFocusTable} onto it.
 */
public class CostFocusTables {

    private static final String CURATED_COST_FOCUS_PREFIX = "curated/cost/focus/";
    public static final String COST_FOCUS_TABLE_NAME = "cost_focus";

    public final CfnTable costFocusTable;

    @Value.Immutable
    public interface CostFocusTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database this table belongs to. */
        String databaseName();

        /** The analytics lake bucket name, used to build the table's S3 location. */
        String lakeBucketName();

        static ImmutableCostFocusTablesProps.Builder builder() {
            return ImmutableCostFocusTablesProps.builder();
        }
    }

    public CostFocusTables(final Construct scope, final CostFocusTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();
        var location = "s3://%s/%s".formatted(props.lakeBucketName(), CURATED_COST_FOCUS_PREFIX);

        var parameters = new LinkedHashMap<String, String>();
        parameters.put("classification", "parquet");
        parameters.put("has_encrypted_data", "false");
        parameters.put("projection.enabled", "true");
        parameters.put("projection.dt.type", "date");
        parameters.put("projection.dt.format", "yyyy-MM-dd");
        parameters.put("projection.dt.range", "2026-01-01,NOW");
        parameters.put("projection.dt.interval", "1");
        parameters.put("projection.dt.interval.unit", "DAYS");
        parameters.put("storage.location.template", location + "dt=${dt}/");

        this.costFocusTable = CfnTable.Builder.create(scope, props.idPrefix() + "-CostFocus-Table")
                .catalogId(catalogId)
                .databaseName(props.databaseName())
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(COST_FOCUS_TABLE_NAME)
                        .description(
                                "FOCUS 1.2 cost and usage export, copied in nightly from the " + "management account")
                        .tableType("EXTERNAL_TABLE")
                        .parameters(parameters)
                        .partitionKeys(List.of(CfnTable.ColumnProperty.builder()
                                .name("dt")
                                .type("date")
                                .build()))
                        .storageDescriptor(CfnTable.StorageDescriptorProperty.builder()
                                .location(location)
                                .inputFormat("org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat")
                                .outputFormat("org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat")
                                .serdeInfo(CfnTable.SerdeInfoProperty.builder()
                                        .serializationLibrary(
                                                "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe")
                                        .build())
                                .columns(buildColumns())
                                .build())
                        .build())
                .build();
    }

    /**
     * The Glue type for each of {@link CostFocusIngestion#FOCUS_1_2_COLUMNS}, in that same order.
     * Kept as a plain type list, rather than a second copy of the names, so there is exactly one
     * place a column's name can be spelled wrong for this table: {@link #glueColumnName(String)}.
     */
    private static final List<String> FOCUS_1_2_COLUMN_TYPES = List.of(
            "string", // BillingAccountId
            "string", // BillingAccountName
            "string", // BillingCurrency
            "string", // BillingPeriodStart
            "string", // BillingPeriodEnd
            "string", // ChargeCategory
            "string", // ChargeClass
            "string", // ChargeDescription
            "string", // ChargeFrequency
            "string", // ChargePeriodStart
            "string", // ChargePeriodEnd
            "double", // BilledCost
            "double", // ContractedCost
            "double", // EffectiveCost
            "double", // ListCost
            "double", // ListUnitPrice
            "double", // ContractedUnitPrice
            "double", // PricingQuantity
            "string", // PricingUnit
            "double", // ConsumedQuantity
            "string", // ConsumedUnit
            "string", // CommitmentDiscountCategory
            "string", // CommitmentDiscountId
            "string", // CommitmentDiscountStatus
            "string", // CommitmentDiscountType
            "string", // InvoiceId
            "string", // InvoiceIssuerName
            "string", // ProviderName
            "string", // PublisherName
            "string", // RegionId
            "string", // RegionName
            "string", // ResourceId
            "string", // ResourceName
            "string", // ResourceType
            "string", // ServiceCategory
            "string", // ServiceName
            "string", // SkuId
            "string", // SkuPriceId
            "string", // SubAccountId
            "string", // SubAccountName
            "map<string,string>", // Tags
            "string", // x_Discounts
            "string", // x_Operation
            "string" // x_ServiceCode
            );

    /**
     * Converts one of {@link CostFocusIngestion#FOCUS_1_2_COLUMNS}' literal FOCUS API column
     * names into this table's lowercase snake_case Glue column name, e.g. {@code SkuPriceId} to
     * {@code sku_price_id}, or {@code x_ServiceCode} to {@code x_service_code} for the three
     * columns that keep the AWS extension prefix. Glue and the Athena views over this table use
     * the conventional lowercase snake_case naming; the FOCUS API itself does not, so the two
     * naming styles are bridged mechanically here rather than by hand-pairing two lists.
     */
    public static String glueColumnName(String focusColumnName) {
        var prefix = "";
        var body = focusColumnName;
        if (body.startsWith("x_")) {
            prefix = "x_";
            body = body.substring(2);
        }
        var snake = body.replaceAll("(?<=[a-z0-9])(?=[A-Z])", "_").toLowerCase(Locale.ROOT);
        return prefix + snake;
    }

    private static List<CfnTable.ColumnProperty> buildColumns() {
        var focusColumns = CostFocusIngestion.FOCUS_1_2_COLUMNS;
        if (focusColumns.size() != FOCUS_1_2_COLUMN_TYPES.size()) {
            throw new IllegalStateException(
                    "CostFocusIngestion.FOCUS_1_2_COLUMNS has %d columns but CostFocusTables.FOCUS_1_2_COLUMN_TYPES has %d; they must list the same columns in the same order"
                            .formatted(focusColumns.size(), FOCUS_1_2_COLUMN_TYPES.size()));
        }
        var columns = new java.util.ArrayList<CfnTable.ColumnProperty>();
        for (int i = 0; i < focusColumns.size(); i++) {
            columns.add(CfnTable.ColumnProperty.builder()
                    .name(glueColumnName(focusColumns.get(i)))
                    .type(FOCUS_1_2_COLUMN_TYPES.get(i))
                    .build());
        }
        return columns;
    }
}
