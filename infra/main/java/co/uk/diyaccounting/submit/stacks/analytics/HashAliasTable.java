/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.util.List;
import java.util.Map;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.glue.CfnTable;
import software.constructs.Construct;

/**
 * Glue table {@code hash_aliases} over the one object that {@code scripts/salt-rotate.js} writes:
 * each earlier hash of a user, a pass or a Stripe customer, and its current hash. Lake rows keep
 * the hash they were written with, so {@code activity_events_all} and the {@code aliased_*} views
 * read a hash through this table, and one account keeps one hash across a salt rotation.
 *
 * <p>The object sits under {@code curated/} on purpose. The curated expiry rule removes it no
 * sooner than it removes the rows that are older than the rotation, and only those rows need it.
 * The table is empty until the first rotation, and a left join to an empty table changes nothing.
 *
 * <p>The caller owns the Glue database and adds the dependency onto it.
 */
public final class HashAliasTable {

    public static final String TABLE_NAME = "hash_aliases";
    private static final String PREFIX = "curated/hash-aliases/";

    private HashAliasTable() {}

    public static CfnTable create(Construct scope, String idPrefix, String databaseName, String lakeBucketName) {
        return CfnTable.Builder.create(scope, idPrefix + "-HashAliases-Table")
                .catalogId(Stack.of(scope).getAccount())
                .databaseName(databaseName)
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(TABLE_NAME)
                        .description("Each earlier hash and its current hash, one JSON object per line")
                        .tableType("EXTERNAL_TABLE")
                        .parameters(Map.of("classification", "json", "compressionType", "gzip"))
                        .storageDescriptor(CfnTable.StorageDescriptorProperty.builder()
                                .location("s3://%s/%s".formatted(lakeBucketName, PREFIX))
                                .inputFormat("org.apache.hadoop.mapred.TextInputFormat")
                                .outputFormat("org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat")
                                .compressed(true)
                                .serdeInfo(CfnTable.SerdeInfoProperty.builder()
                                        .serializationLibrary("org.openx.data.jsonserde.JsonSerDe")
                                        .parameters(Map.of("ignore.malformed.json", "true"))
                                        .build())
                                .columns(List.of(column("old_hash"), column("current_hash")))
                                .build())
                        .build())
                .build();
    }

    private static CfnTable.ColumnProperty column(String name) {
        return CfnTable.ColumnProperty.builder().name(name).type("string").build();
    }
}
