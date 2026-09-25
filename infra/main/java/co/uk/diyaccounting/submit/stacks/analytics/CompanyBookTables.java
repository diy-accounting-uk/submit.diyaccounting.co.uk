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
 * A Glue table over {@code curated/finance/}, where {@code companyBookPull.js} writes one JSON
 * object per day at {@code curated/finance/dt=YYYY-MM-DD/company-accounts.json}: the derived FRS
 * 105 balance sheet and published profit and loss for DIY Accounting Limited's own resident
 * diya-gl book.
 *
 * <p>Modelled on {@link Ga4DailyTables}: one {@code dt} partition-projection column (type {@code
 * date}, format {@code yyyy-MM-dd}), so a new day's object is queryable the moment it lands with
 * no crawler and no {@code MSCK REPAIR}. The object itself is plain JSON, not gzipped, so the
 * table carries no {@code compressionType} parameter, matching {@link WorkflowRunTables}. Not a
 * {@link Construct} subclass itself, matching {@link Ga4DailyTables} and {@link
 * WorkflowRunTables}: a plain class that takes the parent scope and builds its child against it,
 * exposing the created resource as a public field.
 *
 * <p>The columns mirror {@code companyBookPull.js}'s JSON shape field for field, lower-cased
 * (Glue column names are lower case; {@code org.openx.data.jsonserde.JsonSerDe} matches a JSON
 * object's keys to a struct's field names case-insensitively, so the camelCase JSON needs no
 * {@code mapping.*} parameters or renaming).
 *
 * <p>The caller owns the Glue database and must add a dependency from the table field onto it,
 * the same way {@code AnalyticsStack} does for {@link Ga4DailyTables}.
 */
public class CompanyBookTables {

    private static final String CURATED_FINANCE_PREFIX = "curated/finance/";
    private static final String COMPANY_ACCOUNTS_TABLE_NAME = "company_accounts";

    private static final String FRS105_LINES_BIGINT =
            "struct<fixedassets:bigint,currentassets:bigint,creditorswithinoneyear:bigint,creditorsafteroneyear:bigint,"
                    + "calledupsharecapital:bigint,profitandlossaccount:bigint,capitalandreserves:bigint>";

    private static final String FRS105_LINES_DOUBLE =
            "struct<fixedassets:double,currentassets:double,creditorswithinoneyear:double,creditorsafteroneyear:double,"
                    + "calledupsharecapital:double,profitandlossaccount:double,capitalandreserves:double>";

    private static final String PROFIT_AND_LOSS_TYPE = "struct<turnover:bigint,costs:bigint,profit:bigint>";

    private static final String BALANCE_SHEET_TYPE =
            "struct<currentyear:" + FRS105_LINES_BIGINT + ",prioryear:" + FRS105_LINES_BIGINT + ">";

    private static final String DERIVATION_YEAR_TYPE = "struct<sheet:string,lines:" + FRS105_LINES_DOUBLE + ">";

    private static final String DERIVATION_TYPE =
            "struct<currentyear:" + DERIVATION_YEAR_TYPE + ",prioryear:" + DERIVATION_YEAR_TYPE + ">";

    private static final String ACCOUNTS_TYPE = "struct<"
            + "companynumber:string,"
            + "companyname:string,"
            + "periodstart:string,"
            + "periodend:string,"
            + "priorbalancesheetdate:string,"
            + "averagenumberofemployees:bigint,"
            + "directorname:string,"
            + "dormant:boolean,"
            + "profitandloss:" + PROFIT_AND_LOSS_TYPE + ","
            + "balancesheet:" + BALANCE_SHEET_TYPE + ","
            + "derivation:" + DERIVATION_TYPE + ","
            + "notes:array<string>"
            + ">";

    public final CfnTable companyAccountsTable;

    @Value.Immutable
    public interface CompanyBookTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database this table belongs to. */
        String databaseName();

        /** The analytics lake bucket name, used to build the table's S3 location. */
        String lakeBucketName();

        static ImmutableCompanyBookTablesProps.Builder builder() {
            return ImmutableCompanyBookTablesProps.builder();
        }
    }

    public CompanyBookTables(final Construct scope, final CompanyBookTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();

        this.companyAccountsTable = buildTable(
                scope,
                props,
                catalogId,
                COMPANY_ACCOUNTS_TABLE_NAME,
                "The company's own resident diya-gl book, derived nightly to the FRS 105 balance sheet and published profit and loss, one JSON object per day");
    }

    private static CfnTable buildTable(
            Construct scope, CompanyBookTablesProps props, String catalogId, String tableName, String description) {
        var location = "s3://%s/%s".formatted(props.lakeBucketName(), CURATED_FINANCE_PREFIX);

        var parameters = new LinkedHashMap<String, String>();
        parameters.put("classification", "json");
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
                                .columns(columnsOf(
                                        "date", "string",
                                        "bookid", "string",
                                        "latestversion", "bigint",
                                        "latestetag", "string",
                                        "accounts", ACCOUNTS_TYPE))
                                .build())
                        .build())
                .build();
    }

    private static String tableIdPrefix(CompanyBookTablesProps props, String tableName) {
        // "company_accounts" -> "CompanyAccounts"
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
}
