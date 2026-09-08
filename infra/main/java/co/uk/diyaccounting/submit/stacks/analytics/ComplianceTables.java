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
 * Glue tables over the two sources the compliance panel reads: {@code compliance_accessibility},
 * one row per page per tool per WCAG standard from {@code compliance.yml}'s pa11y and axe runs,
 * and {@code compliance_fraud_headers}, one row per month from
 * {@code data/compliance/fraud-prevention-headers/<YYYY-MM>.json} (written by {@code
 * scripts/fraud-header-email-check.js}, see {@code PLAN_FRAUD_HEADER_EMAIL_CHECK.md}). Both
 * tables are written by a workflow step through {@code .github/actions/dora-row}, not by a
 * Lambda: the source data already exists as a file, and the composite action already does one
 * put per row.
 *
 * <p>Modelled line for line on {@link WorkflowRunTables}: one {@code dt} partition-projection
 * column (type {@code date}, format {@code yyyy-MM-dd}), so a new day's object is queryable the
 * moment it lands with no crawler and no {@code MSCK REPAIR}. Not a {@link Construct} subclass
 * itself, matching {@link WorkflowRunTables} and {@link OperatorEffortTables}: a plain class that
 * takes the parent scope and builds its children against it, exposing the created resources as
 * public fields.
 *
 * <p>The caller owns the Glue database and must add a dependency from each table field onto it,
 * the same way {@code AnalyticsStack} does for {@link WorkflowRunTables}.
 */
public class ComplianceTables {

    private static final String CURATED_ACCESSIBILITY_PREFIX = "curated/compliance/accessibility/";
    private static final String CURATED_FRAUD_HEADERS_PREFIX = "curated/compliance/fraud-headers/";
    private static final String ACCESSIBILITY_TABLE_NAME = "compliance_accessibility";
    private static final String FRAUD_HEADERS_TABLE_NAME = "compliance_fraud_headers";

    public final CfnTable accessibilityTable;
    public final CfnTable fraudHeadersTable;

    @Value.Immutable
    public interface ComplianceTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database these tables belong to. */
        String databaseName();

        /** The analytics lake bucket name, used to build each table's S3 location. */
        String lakeBucketName();

        static ImmutableComplianceTablesProps.Builder builder() {
            return ImmutableComplianceTablesProps.builder();
        }
    }

    public ComplianceTables(final Construct scope, final ComplianceTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();

        this.accessibilityTable = buildTable(
                scope,
                props,
                catalogId,
                ACCESSIBILITY_TABLE_NAME,
                CURATED_ACCESSIBILITY_PREFIX,
                "One row per page per tool per WCAG standard from compliance.yml, one JSON object per line",
                columnsOf(
                        "run_id", "string",
                        "environment", "string",
                        "tool", "string",
                        "standard", "string",
                        "page", "string",
                        "violations", "bigint",
                        "passes", "bigint",
                        "checked_at", "string"));

        this.fraudHeadersTable = buildTable(
                scope,
                props,
                catalogId,
                FRAUD_HEADERS_TABLE_NAME,
                CURATED_FRAUD_HEADERS_PREFIX,
                "One row per month from data/compliance/fraud-prevention-headers/, one JSON object per line",
                columnsOf(
                        "month", "string",
                        "status", "string",
                        "needs_action", "boolean",
                        "traffic_count", "bigint",
                        "advisories_count", "bigint",
                        "errors_count", "bigint",
                        "checked_at", "string"));
    }

    private static CfnTable buildTable(
            Construct scope,
            ComplianceTablesProps props,
            String catalogId,
            String tableName,
            String curatedPrefix,
            String description,
            List<CfnTable.ColumnProperty> columns) {
        var location = "s3://%s/%s".formatted(props.lakeBucketName(), curatedPrefix);

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
                                .columns(columns)
                                .build())
                        .build())
                .build();
    }

    private static String tableIdPrefix(ComplianceTablesProps props, String tableName) {
        // "compliance_accessibility" -> "ComplianceAccessibility"
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
