/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.glue.CfnTable;
import software.constructs.Construct;

/**
 * Glue tables over the Stripe reconciliation data that {@code stripeReconcile.js} writes nightly
 * to {@code curated/stripe/<entity>/dt=YYYY-MM-DD/}: {@code stripe_balance_transactions},
 * {@code stripe_charges} and {@code stripe_subscriptions}.
 *
 * <p>Not a {@link software.constructs.Construct} subclass itself, matching the shape of {@link
 * co.uk.diyaccounting.submit.constructs.Lambda} elsewhere in this repo: a plain class that takes
 * the parent scope and builds its children against it, exposing the created resources as public
 * fields.
 *
 * <p>Each table uses partition projection on a single {@code dt} column, so a new day's object
 * is queryable the moment it lands with no crawler and no {@code MSCK REPAIR}. Amounts stay in
 * minor units as {@code bigint}, exactly as Stripe returns them; a view divides by 100 in one
 * place rather than every query doing it separately.
 *
 * <p>The caller owns the Glue database and must add a dependency from each table field onto it,
 * e.g. {@code stripeTables.balanceTransactionsTable.addResourceDependency(this.glueDatabase)},
 * the same way {@code AnalyticsStack} does for {@code activity_events}.
 */
public class StripeReconciliationTables {

    private static final String CURATED_STRIPE_PREFIX = "curated/stripe/";
    private static final String BALANCE_TRANSACTIONS_TABLE_NAME = "stripe_balance_transactions";
    private static final String CHARGES_TABLE_NAME = "stripe_charges";
    private static final String SUBSCRIPTIONS_TABLE_NAME = "stripe_subscriptions";

    public final CfnTable balanceTransactionsTable;
    public final CfnTable chargesTable;
    public final CfnTable subscriptionsTable;

    @Value.Immutable
    public interface StripeReconciliationTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database these tables belong to. */
        String databaseName();

        /** The analytics lake bucket name, used to build each table's S3 location. */
        String lakeBucketName();

        static ImmutableStripeReconciliationTablesProps.Builder builder() {
            return ImmutableStripeReconciliationTablesProps.builder();
        }
    }

    public StripeReconciliationTables(final Construct scope, final StripeReconciliationTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();

        this.balanceTransactionsTable = buildTable(
                scope,
                props,
                catalogId,
                BALANCE_TRANSACTIONS_TABLE_NAME,
                "Stripe balance transactions for the day, one JSON object per line",
                buildBalanceTransactionColumns());

        this.chargesTable = buildTable(
                scope,
                props,
                catalogId,
                CHARGES_TABLE_NAME,
                "Stripe charges created that day, one JSON object per line",
                buildChargeColumns());

        this.subscriptionsTable = buildTable(
                scope,
                props,
                catalogId,
                SUBSCRIPTIONS_TABLE_NAME,
                "Full Stripe subscription snapshot as at that day, one JSON object per line",
                buildSubscriptionColumns());
    }

    private static CfnTable buildTable(
            Construct scope,
            StripeReconciliationTablesProps props,
            String catalogId,
            String tableName,
            String description,
            List<CfnTable.ColumnProperty> columns) {
        var location = "s3://%s/%s%s/".formatted(props.lakeBucketName(), CURATED_STRIPE_PREFIX, tableName);

        var parameters = new LinkedHashMap<String, String>();
        parameters.put("classification", "json");
        parameters.put("compressionType", "gzip");
        parameters.put("has_encrypted_data", "false");
        parameters.put("projection.enabled", "true");
        parameters.put("projection.dt.type", "date");
        parameters.put("projection.dt.format", "yyyy-MM-dd");
        parameters.put("projection.dt.range", "2026-01-01,NOW");
        parameters.put("projection.dt.interval", "1");
        parameters.put("projection.dt.interval.unit", "DAYS");
        parameters.put("storage.location.template", location + "dt=${dt}/");

        var table = CfnTable.Builder.create(scope, tableIdPrefix(props, tableName) + "-Table")
                .catalogId(catalogId)
                .databaseName(props.databaseName())
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(tableName)
                        .description(description)
                        .tableType("EXTERNAL_TABLE")
                        .parameters(parameters)
                        .partitionKeys(List.of(CfnTable.ColumnProperty.builder()
                                .name("dt")
                                .type("date")
                                .build()))
                        .storageDescriptor(CfnTable.StorageDescriptorProperty.builder()
                                .location(location)
                                .inputFormat("org.apache.hadoop.mapred.TextInputFormat")
                                .outputFormat("org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat")
                                .compressed(true)
                                .serdeInfo(CfnTable.SerdeInfoProperty.builder()
                                        .serializationLibrary("org.openx.data.jsonserde.JsonSerDe")
                                        .parameters(Map.of("ignore.malformed.json", "true"))
                                        .build())
                                .columns(columns)
                                .build())
                        .build())
                .build();
        return table;
    }

    private static String tableIdPrefix(StripeReconciliationTablesProps props, String tableName) {
        // "stripe_balance_transactions" -> "StripeBalanceTransactions"
        var camel = new StringBuilder();
        for (var part : tableName.split("_")) {
            camel.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return props.idPrefix() + "-" + camel;
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

    private static List<CfnTable.ColumnProperty> buildBalanceTransactionColumns() {
        return columnsOf(
                "id", "string",
                "type", "string",
                "amount", "bigint",
                "net", "bigint",
                "fee", "bigint",
                "currency", "string",
                "created", "bigint",
                "available_on", "bigint",
                "source_id", "string",
                "description", "string");
    }

    private static List<CfnTable.ColumnProperty> buildChargeColumns() {
        return columnsOf(
                "id", "string",
                "amount", "bigint",
                "amount_refunded", "bigint",
                "currency", "string",
                "created", "bigint",
                "paid", "boolean",
                "refunded", "boolean",
                "status", "string",
                "failure_code", "string",
                "customer", "string",
                "invoice", "string",
                "bundle_id", "string");
    }

    private static List<CfnTable.ColumnProperty> buildSubscriptionColumns() {
        return columnsOf(
                "id", "string",
                "status", "string",
                "created", "bigint",
                "current_period_start", "bigint",
                "current_period_end", "bigint",
                "cancel_at_period_end", "boolean",
                "canceled_at", "bigint",
                "customer", "string",
                "price_id", "string",
                "unit_amount", "bigint",
                "bundle_id", "string");
    }
}
