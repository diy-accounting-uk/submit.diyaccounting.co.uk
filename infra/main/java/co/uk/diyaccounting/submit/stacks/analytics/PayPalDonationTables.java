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
 * A Glue table over the PayPal receipts that {@code paypalDonationsPull.js} writes nightly to
 * {@code curated/paypal/paypal_donations/dt=YYYY-MM-DD/}: {@code paypal_donations}, one row per
 * settled incoming payment and one negative row per refund of one, {@code refund_of} naming the
 * receipt it refunds. {@code amount} is in pounds; {@code original_amount} and {@code
 * original_currency} keep what PayPal reported.
 *
 * <p>Always created, in every environment, even where no PayPal credentials exist and the pull
 * job is absent: the table is then empty and {@code v_revenue_daily} still compiles. Same shape
 * as {@link StripeReconciliationTables}: gzipped NDJSON, one {@code dt} partition-projection
 * column, so a new day's object is queryable the moment it lands. Amounts are in major units
 * ({@code double}), as PayPal returns them, unlike Stripe's minor-unit {@code bigint}.
 *
 * <p>The caller owns the Glue database and must add a dependency from the table field onto it.
 */
public class PayPalDonationTables {

    private static final String CURATED_PAYPAL_PREFIX = "curated/paypal/";
    private static final String DONATIONS_TABLE_NAME = "paypal_donations";

    public final CfnTable donationsTable;

    @Value.Immutable
    public interface PayPalDonationTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database this table belongs to. */
        String databaseName();

        /** The analytics lake bucket name, used to build the table's S3 location. */
        String lakeBucketName();

        static ImmutablePayPalDonationTablesProps.Builder builder() {
            return ImmutablePayPalDonationTablesProps.builder();
        }
    }

    public PayPalDonationTables(final Construct scope, final PayPalDonationTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();
        var location = "s3://%s/%s%s/".formatted(props.lakeBucketName(), CURATED_PAYPAL_PREFIX, DONATIONS_TABLE_NAME);

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

        this.donationsTable = CfnTable.Builder.create(scope, props.idPrefix() + "-PaypalDonations-Table")
                .catalogId(catalogId)
                .databaseName(props.databaseName())
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(DONATIONS_TABLE_NAME)
                        .description("PayPal settled receipts for the day, one JSON object per line")
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
                                        column("id", "string"),
                                        column("date", "string"),
                                        column("amount", "double"),
                                        column("fee", "double"),
                                        column("product", "string"),
                                        column("original_amount", "double"),
                                        column("original_currency", "string"),
                                        column("refund_of", "string")))
                                .build())
                        .build())
                .build();
    }

    private static CfnTable.ColumnProperty column(String name, String type) {
        return CfnTable.ColumnProperty.builder().name(name).type(type).build();
    }
}
