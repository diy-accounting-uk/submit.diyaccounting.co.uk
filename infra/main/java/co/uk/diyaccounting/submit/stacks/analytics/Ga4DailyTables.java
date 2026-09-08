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
 * Glue tables over the lake's copy of the four one-stop-dashboard aggregate tables {@code
 * analytics/ga4-bigquery.toml} maintains in BigQuery's {@code ga4_daily} dataset, which {@code
 * app/functions/analytics/ga4DailyPull.js} writes nightly to {@code
 * curated/ga4_daily/<table>/dt=YYYY-MM-DD/data.json.gz}: {@code sessions_by_host_source_daily},
 * {@code funnel_steps_daily}, {@code key_events_daily} and {@code downloads_by_product_daily}.
 *
 * <p>Modelled line for line on {@link Ga4Tables}: one {@code dt} partition-projection column
 * (type {@code date}, format {@code yyyy-MM-dd}), so a new day's object is queryable the moment
 * it lands with no crawler and no {@code MSCK REPAIR}. Not a {@link Construct} subclass itself,
 * matching {@link Ga4Tables} and {@link StripeReconciliationTables}: a plain class that takes the
 * parent scope and builds its children against it, exposing the created resources as public
 * fields.
 *
 * <p>The caller owns the Glue database and must add a dependency from each table field onto it,
 * the same way {@code AnalyticsStack} does for {@link Ga4Tables}.
 */
public class Ga4DailyTables {

    private static final String CURATED_PREFIX = "curated/ga4_daily/";

    private static final String SESSIONS_BY_HOST_SOURCE_TABLE_NAME = "sessions_by_host_source_daily";
    private static final String FUNNEL_STEPS_TABLE_NAME = "funnel_steps_daily";
    private static final String KEY_EVENTS_TABLE_NAME = "key_events_daily";
    private static final String DOWNLOADS_BY_PRODUCT_TABLE_NAME = "downloads_by_product_daily";

    public final CfnTable sessionsByHostSourceTable;
    public final CfnTable funnelStepsTable;
    public final CfnTable keyEventsTable;
    public final CfnTable downloadsByProductTable;

    @Value.Immutable
    public interface Ga4DailyTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database these tables belong to. */
        String databaseName();

        /** The analytics lake bucket name, used to build each table's S3 location. */
        String lakeBucketName();

        static ImmutableGa4DailyTablesProps.Builder builder() {
            return ImmutableGa4DailyTablesProps.builder();
        }
    }

    public Ga4DailyTables(final Construct scope, final Ga4DailyTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();

        this.sessionsByHostSourceTable = buildTable(
                scope,
                props,
                catalogId,
                SESSIONS_BY_HOST_SOURCE_TABLE_NAME,
                "Sessions by hostname, session source/medium and visitor kind, one day at a time",
                buildSessionsByHostSourceColumns());

        this.funnelStepsTable = buildTable(
                scope,
                props,
                catalogId,
                FUNNEL_STEPS_TABLE_NAME,
                "Distinct sessions reaching each login-to-submission funnel step, one day at a time",
                buildFunnelStepsColumns());

        this.keyEventsTable = buildTable(
                scope,
                props,
                catalogId,
                KEY_EVENTS_TABLE_NAME,
                "Key events by hostname, one day at a time",
                buildKeyEventsColumns());

        this.downloadsByProductTable = buildTable(
                scope,
                props,
                catalogId,
                DOWNLOADS_BY_PRODUCT_TABLE_NAME,
                "Downloads by product, one day at a time",
                buildDownloadsByProductColumns());
    }

    private static CfnTable buildTable(
            Construct scope,
            Ga4DailyTablesProps props,
            String catalogId,
            String tableName,
            String description,
            List<CfnTable.ColumnProperty> columns) {
        var location = "s3://%s/%s%s/".formatted(props.lakeBucketName(), CURATED_PREFIX, tableName);

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

        return CfnTable.Builder.create(scope, tableIdPrefix(props, tableName) + "-Table")
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
                                .serdeInfo(CfnTable.SerdeInfoProperty.builder()
                                        .serializationLibrary("org.openx.data.jsonserde.JsonSerDe")
                                        .parameters(Map.of("ignore.malformed.json", "true"))
                                        .build())
                                .columns(columns)
                                .build())
                        .build())
                .build();
    }

    private static String tableIdPrefix(Ga4DailyTablesProps props, String tableName) {
        // "sessions_by_host_source_daily" -> "SessionsByHostSourceDaily"
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

    private static List<CfnTable.ColumnProperty> buildSessionsByHostSourceColumns() {
        return columnsOf(
                "day", "string",
                "hostname", "string",
                "session_source", "string",
                "session_medium", "string",
                "visitor_kind", "string",
                "sessions", "bigint",
                "users", "bigint");
    }

    private static List<CfnTable.ColumnProperty> buildFunnelStepsColumns() {
        return columnsOf(
                "day", "string",
                "sessions", "bigint",
                "logins", "bigint",
                "checkouts", "bigint",
                "purchases", "bigint");
    }

    private static List<CfnTable.ColumnProperty> buildKeyEventsColumns() {
        return columnsOf(
                "day", "string",
                "hostname", "string",
                "key_event", "string",
                "events", "bigint",
                "users", "bigint");
    }

    private static List<CfnTable.ColumnProperty> buildDownloadsByProductColumns() {
        return columnsOf(
                "day", "string",
                "product", "string",
                "downloads", "bigint",
                "users", "bigint");
    }
}
