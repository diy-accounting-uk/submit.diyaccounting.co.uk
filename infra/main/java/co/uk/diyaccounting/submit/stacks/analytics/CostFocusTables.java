/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.util.LinkedHashMap;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.glue.CfnTable;
import software.constructs.Construct;

/**
 * A Glue table over the FOCUS 1.2 cost export, copied nightly into {@code
 * curated/cost/focus/dt=<date>/} by {@link CostFocusIngestion}. The columns are the FOCUS 1.2
 * with AWS columns schema (see AWS's own table dictionary for the full spec); {@code tags} is
 * kept as a single map rather than one column per key, since which cost allocation tags matter
 * is a question for the SQL in {@code v_cost_*}, not for this table's shape.
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
                        .description("FOCUS 1.2 cost and usage export, copied in nightly from the "
                                + "management account")
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

    private static List<CfnTable.ColumnProperty> columnsOf(String... nameTypePairs) {
        var columns = new java.util.ArrayList<CfnTable.ColumnProperty>();
        for (int i = 0; i < nameTypePairs.length; i += 2) {
            columns.add(CfnTable.ColumnProperty.builder()
                    .name(nameTypePairs[i])
                    .type(nameTypePairs[i + 1])
                    .build());
        }
        return columns;
    }

    private static List<CfnTable.ColumnProperty> buildColumns() {
        return columnsOf(
                "billing_account_id", "string",
                "billing_account_name", "string",
                "billing_currency", "string",
                "billing_period_start", "string",
                "billing_period_end", "string",
                "charge_category", "string",
                "charge_class", "string",
                "charge_description", "string",
                "charge_frequency", "string",
                "charge_period_start", "string",
                "charge_period_end", "string",
                "billed_cost", "double",
                "contracted_cost", "double",
                "effective_cost", "double",
                "list_cost", "double",
                "list_unit_price", "double",
                "contracted_unit_price", "double",
                "pricing_quantity", "double",
                "pricing_unit", "string",
                "consumed_quantity", "double",
                "consumed_unit", "string",
                "commitment_discount_category", "string",
                "commitment_discount_id", "string",
                "commitment_discount_status", "string",
                "commitment_discount_type", "string",
                "invoice_id", "string",
                "invoice_issuer_name", "string",
                "provider_name", "string",
                "publisher_name", "string",
                "region_id", "string",
                "region_name", "string",
                "resource_id", "string",
                "resource_name", "string",
                "resource_type", "string",
                "service_category", "string",
                "service_name", "string",
                "sku_id", "string",
                "sku_price_id", "string",
                "sub_account_id", "string",
                "sub_account_name", "string",
                "tags", "map<string,string>",
                "x_discounts", "string",
                "x_operation", "string",
                "x_service_code", "string");
    }
}
