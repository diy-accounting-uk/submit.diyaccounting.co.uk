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
 * A Glue table over the Google Ads spend that {@code adsCostPull.js} writes nightly to
 * {@code curated/ads/ads_cost/dt=YYYY-MM-DD/}: {@code ads_cost}, one row per day, campaign and
 * ad group with its impressions, clicks and cost in pounds.
 *
 * <p>Always created, in every environment, even where the pull job is absent: the table is then
 * empty and {@code v_ads_cost_daily} still compiles. Same shape as {@link PayPalDonationTables}:
 * gzipped NDJSON, one {@code dt} partition-projection column, so a new day's object is
 * queryable the moment it lands.
 *
 * <p>The caller owns the Glue database and must add a dependency from the table field onto it.
 */
public class AdsCostTables {

    private static final String CURATED_ADS_PREFIX = "curated/ads/";
    private static final String COST_TABLE_NAME = "ads_cost";

    public final CfnTable costTable;

    @Value.Immutable
    public interface AdsCostTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database this table belongs to. */
        String databaseName();

        /** The analytics lake bucket name, used to build the table's S3 location. */
        String lakeBucketName();

        static ImmutableAdsCostTablesProps.Builder builder() {
            return ImmutableAdsCostTablesProps.builder();
        }
    }

    public AdsCostTables(final Construct scope, final AdsCostTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();
        var location = "s3://%s/%s%s/".formatted(props.lakeBucketName(), CURATED_ADS_PREFIX, COST_TABLE_NAME);

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

        this.costTable = CfnTable.Builder.create(scope, props.idPrefix() + "-AdsCost-Table")
                .catalogId(catalogId)
                .databaseName(props.databaseName())
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(COST_TABLE_NAME)
                        .description("Google Ads impressions, clicks and cost for the day by campaign and ad group, one JSON object per line")
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
                                        column("campaign_id", "string"),
                                        column("campaign_name", "string"),
                                        column("ad_group_id", "string"),
                                        column("ad_group_name", "string"),
                                        column("impressions", "bigint"),
                                        column("clicks", "bigint"),
                                        column("cost_gbp", "double")))
                                .build())
                        .build())
                .build();
    }

    private static CfnTable.ColumnProperty column(String name, String type) {
        return CfnTable.ColumnProperty.builder().name(name).type(type).build();
    }
}
