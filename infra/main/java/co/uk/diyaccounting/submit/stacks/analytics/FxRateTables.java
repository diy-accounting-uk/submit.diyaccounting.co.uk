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
 * A Glue table over the European Central Bank reference rates that {@code fxRatePull.js} writes
 * nightly to {@code curated/fx/fx_rates/dt=YYYY-MM-DD/}: {@code fx_rates}, one row per rate date
 * with the dollars and pounds one euro buys and the pounds one dollar buys.
 *
 * <p>Same shape as {@link AdsCostTables}: gzipped NDJSON, one {@code dt} partition-projection
 * column. The caller owns the Glue database and must add a dependency from the table field onto
 * it.
 */
public class FxRateTables {

    private static final String CURATED_FX_PREFIX = "curated/fx/";
    private static final String RATES_TABLE_NAME = "fx_rates";

    public final CfnTable ratesTable;

    @Value.Immutable
    public interface FxRateTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database this table belongs to. */
        String databaseName();

        /** The analytics lake bucket name, used to build the table's S3 location. */
        String lakeBucketName();

        static ImmutableFxRateTablesProps.Builder builder() {
            return ImmutableFxRateTablesProps.builder();
        }
    }

    public FxRateTables(final Construct scope, final FxRateTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();
        var location = "s3://%s/%s%s/".formatted(props.lakeBucketName(), CURATED_FX_PREFIX, RATES_TABLE_NAME);

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

        this.ratesTable = CfnTable.Builder.create(scope, props.idPrefix() + "-FxRates-Table")
                .catalogId(catalogId)
                .databaseName(props.databaseName())
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(RATES_TABLE_NAME)
                        .description(
                                "European Central Bank reference rates for the day: dollars and pounds per euro and pounds per dollar, one JSON object per line")
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
                                .columns(List.of(
                                        column("date", "string"),
                                        column("usd_per_eur", "double"),
                                        column("gbp_per_eur", "double"),
                                        column("gbp_per_usd", "double")))
                                .build())
                        .build())
                .build();
    }

    private static CfnTable.ColumnProperty column(String name, String type) {
        return CfnTable.ColumnProperty.builder().name(name).type(type).build();
    }
}
