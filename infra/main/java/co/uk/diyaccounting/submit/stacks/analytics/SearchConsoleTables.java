/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
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
 * The Glue table {@code search_console_queries} over the Search Console search analytics that
 * {@code app/lib/searchConsolePull.js} writes nightly, through {@code ga4ReportPull.js}, to
 * {@code curated/searchconsole/report=queries/dt=YYYY-MM-DD/<property>.json.gz}: one row per
 * date, page, query, country and device for each of the two domain properties. A day holds one
 * object per property, and a re-run replaces that day's objects.
 *
 * <p>Modelled on {@link Ga4Tables}: one {@code dt} partition-projection column, so a new day is
 * queryable the moment it lands. The caller owns the Glue database and adds a dependency from
 * the table onto it.
 */
public class SearchConsoleTables {

    private static final String CURATED_PREFIX = "curated/searchconsole/";
    private static final String QUERIES_TABLE_NAME = "search_console_queries";

    public final CfnTable queriesTable;

    @Value.Immutable
    public interface SearchConsoleTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database this table belongs to. */
        String databaseName();

        /** The analytics lake bucket name, used to build the table's S3 location. */
        String lakeBucketName();

        static ImmutableSearchConsoleTablesProps.Builder builder() {
            return ImmutableSearchConsoleTablesProps.builder();
        }
    }

    public SearchConsoleTables(final Construct scope, final SearchConsoleTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();
        var location = "s3://%s/%sreport=queries/".formatted(props.lakeBucketName(), CURATED_PREFIX);

        var parameters = new LinkedHashMap<String, String>();
        parameters.put("classification", "json");
        parameters.put("compressionType", "gzip");
        parameters.put("has_encrypted_data", "false");
        parameters.put("projection.enabled", "true");
        parameters.put("projection.dt.type", "date");
        parameters.put("projection.dt.format", "yyyy-MM-dd");
        parameters.put("projection.dt.range", "2026-08-01,NOW");
        parameters.put("projection.dt.interval", "1");
        parameters.put("projection.dt.interval.unit", "DAYS");
        parameters.put("storage.location.template", location + "dt=${dt}/");

        this.queriesTable = CfnTable.Builder.create(scope, props.idPrefix() + "-SearchConsoleQueries-Table")
                .catalogId(catalogId)
                .databaseName(props.databaseName())
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(QUERIES_TABLE_NAME)
                        .description("Search Console clicks and impressions by date, page, query, country and device,"
                                + " for each domain property, one JSON object per line")
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
                                .columns(buildQueriesColumns())
                                .build())
                        .build())
                .build();
    }

    private static List<CfnTable.ColumnProperty> buildQueriesColumns() {
        var pairs = new String[] {
            "property", "string",
            "date", "string",
            "page", "string",
            "query", "string",
            "country", "string",
            "device", "string",
            "clicks", "bigint",
            "impressions", "bigint",
            "ctr", "double",
            "position", "double"
        };
        var columns = new java.util.ArrayList<CfnTable.ColumnProperty>();
        for (int i = 0; i < pairs.length; i += 2) {
            columns.add(CfnTable.ColumnProperty.builder()
                    .name(pairs[i])
                    .type(pairs[i + 1])
                    .build());
        }
        return columns;
    }
}
