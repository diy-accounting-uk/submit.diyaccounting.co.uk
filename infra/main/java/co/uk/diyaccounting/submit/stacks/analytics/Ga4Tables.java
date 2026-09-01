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
 * Glue tables over the GA4 Data API reports that {@code ga4ReportPull.js} writes nightly to
 * {@code curated/ga4/report=<name>/dt=YYYY-MM-DD/}: {@code ga4_traffic}, {@code ga4_pages} and
 * {@code ga4_events}. Also the {@code ga4_bq_events} table over the BigQuery event export that
 * {@code ga4EventExportPull.js} writes to {@code curated/ga4_bq/events/dt=YYYY-MM-DD/}: one row
 * per event with a session id, which the Data API's aggregated reports cannot provide. The name
 * {@code ga4_events} is already taken by the Data API's aggregated event-name report, hence
 * {@code ga4_bq_events} rather than a name that collides.
 *
 * <p>Not a {@link software.constructs.Construct} subclass itself, matching {@link
 * StripeReconciliationTables} and {@link co.uk.diyaccounting.submit.constructs.Lambda} elsewhere
 * in this repo: a plain class that takes the parent scope and builds its children against it,
 * exposing the created resources as public fields.
 *
 * <p>Each table uses partition projection on a single {@code dt} column, so a new day's object is
 * queryable the moment it lands with no crawler and no {@code MSCK REPAIR}. The {@code date}
 * dimension GA4 returns is also kept as an ordinary string column, even though it duplicates the
 * {@code dt} partition value, because the Lambda writes it as part of every row and dropping it at
 * the catalog layer would mean two representations of "the source data" to keep in sync.
 *
 * <p>{@code ga4_bq_events.user_pseudo_id} is a pseudonymous identifier and counts as personal data
 * under UK GDPR. It stays because counting users and stitching sessions needs it; the lake bucket
 * carries a dedicated, shorter-than-default lifecycle rule on {@code curated/ga4_bq/} for it (see
 * {@code AnalyticsStack.buildLakeLifecycleRules}), the same pattern {@code CloudFrontAccessLogs}
 * uses for {@code c_ip}.
 *
 * <p>The caller owns the Glue database and must add a dependency from each table field onto it,
 * the same way {@code AnalyticsStack} does for {@code activity_events} and for {@link
 * StripeReconciliationTables}.
 */
public class Ga4Tables {

    private static final String CURATED_GA4_PREFIX = "curated/ga4/";
    private static final String CURATED_GA4_BQ_PREFIX = "curated/ga4_bq/";
    private static final String TRAFFIC_TABLE_NAME = "ga4_traffic";
    private static final String PAGES_TABLE_NAME = "ga4_pages";
    private static final String EVENTS_TABLE_NAME = "ga4_events";
    private static final String BQ_EVENTS_TABLE_NAME = "ga4_bq_events";

    public final CfnTable trafficTable;
    public final CfnTable pagesTable;
    public final CfnTable eventsTable;
    public final CfnTable bqEventsTable;

    @Value.Immutable
    public interface Ga4TablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database these tables belong to. */
        String databaseName();

        /** The analytics lake bucket name, used to build each table's S3 location. */
        String lakeBucketName();

        static ImmutableGa4TablesProps.Builder builder() {
            return ImmutableGa4TablesProps.builder();
        }
    }

    public Ga4Tables(final Construct scope, final Ga4TablesProps props) {
        var catalogId = Stack.of(scope).getAccount();

        this.trafficTable = buildTable(
                scope,
                props,
                catalogId,
                TRAFFIC_TABLE_NAME,
                "traffic",
                "GA4 daily traffic by country and channel, one JSON object per line",
                buildTrafficColumns());

        this.pagesTable = buildTable(
                scope,
                props,
                catalogId,
                PAGES_TABLE_NAME,
                "pages",
                "GA4 daily page views by path, one JSON object per line",
                buildPagesColumns());

        this.eventsTable = buildTable(
                scope,
                props,
                catalogId,
                EVENTS_TABLE_NAME,
                "events",
                "GA4 daily event counts by event name, one JSON object per line",
                buildEventsColumns());

        this.bqEventsTable = buildTableAtLocation(
                scope,
                props,
                catalogId,
                BQ_EVENTS_TABLE_NAME,
                "s3://%s/%sevents/".formatted(props.lakeBucketName(), CURATED_GA4_BQ_PREFIX),
                "GA4 BigQuery event export, one row per event with a session id, one JSON object "
                        + "per line. user_pseudo_id is pseudonymous personal data under UK GDPR; "
                        + "see the lifecycle rule on curated/ga4_bq/ in AnalyticsStack.",
                buildBqEventsColumns());
    }

    private static CfnTable buildTable(
            Construct scope,
            Ga4TablesProps props,
            String catalogId,
            String tableName,
            String reportName,
            String description,
            List<CfnTable.ColumnProperty> columns) {
        var location = "s3://%s/%sreport=%s/".formatted(props.lakeBucketName(), CURATED_GA4_PREFIX, reportName);
        return buildTableAtLocation(scope, props, catalogId, tableName, location, description, columns);
    }

    private static CfnTable buildTableAtLocation(
            Construct scope,
            Ga4TablesProps props,
            String catalogId,
            String tableName,
            String location,
            String description,
            List<CfnTable.ColumnProperty> columns) {
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
                                .compressed(true)
                                .serdeInfo(CfnTable.SerdeInfoProperty.builder()
                                        .serializationLibrary("org.openx.data.jsonserde.JsonSerDe")
                                        .parameters(Map.of("ignore.malformed.json", "true"))
                                        .build())
                                .columns(columns)
                                .build())
                        .build())
                .build();
    }

    private static String tableIdPrefix(Ga4TablesProps props, String tableName) {
        // "ga4_traffic" -> "Ga4Traffic"
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

    private static List<CfnTable.ColumnProperty> buildTrafficColumns() {
        return columnsOf(
                "date", "string",
                "country", "string",
                "sessionDefaultChannelGroup", "string",
                "sessions", "bigint",
                "activeUsers", "bigint",
                "newUsers", "bigint",
                "engagedSessions", "bigint",
                "averageSessionDuration", "double");
    }

    private static List<CfnTable.ColumnProperty> buildPagesColumns() {
        return columnsOf(
                "date", "string",
                "pagePath", "string",
                "hostName", "string",
                "screenPageViews", "bigint",
                "activeUsers", "bigint");
    }

    private static List<CfnTable.ColumnProperty> buildEventsColumns() {
        return columnsOf(
                "date", "string",
                "eventName", "string",
                "eventCount", "bigint",
                "activeUsers", "bigint",
                "eventValue", "double");
    }

    private static List<CfnTable.ColumnProperty> buildBqEventsColumns() {
        return columnsOf(
                "event_ts", "string",
                "event_name", "string",
                "user_pseudo_id", "string",
                "ga_session_id", "bigint",
                "ga_session_number", "bigint",
                "page_location", "string",
                "page_referrer", "string",
                "engagement_time_msec", "bigint",
                "transaction_id", "string",
                "event_value", "double",
                "currency", "string",
                "device_category", "string",
                "device_os", "string",
                "country", "string",
                "traffic_source", "string",
                "traffic_medium", "string",
                "traffic_campaign", "string",
                "stream_id", "string",
                "platform", "string");
    }
}
