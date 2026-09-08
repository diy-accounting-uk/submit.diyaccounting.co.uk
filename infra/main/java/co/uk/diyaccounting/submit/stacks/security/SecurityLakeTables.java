/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.security;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.glue.CfnTable;
import software.constructs.Construct;

/**
 * Glue tables over the security dashboard's sources, one JSON-lines file per source per day at
 * {@code curated/security/<source>/dt=<date>/data.json}: Security Hub findings, GuardDuty
 * findings, GitHub alert counts, the lifecycle calendar, WAF blocks per rule and the secret
 * rotation record, all written by {@code securityLakeNightly.js}, plus the SBOM/KEV match
 * {@code .github/workflows/sbom.yml} writes on every push to main.
 *
 * <p>Modelled line for line on {@code WorkflowRunTables}: one {@code dt} partition-projection
 * column (type {@code date}, format {@code yyyy-MM-dd}), so a new day's object is queryable the
 * moment it lands with no crawler and no {@code MSCK REPAIR}. Not a {@link Construct} subclass
 * itself, matching {@code WorkflowRunTables}: a plain class that takes the parent scope and builds
 * its children against it, exposing the created resources as public fields.
 *
 * <p>The caller owns the Glue database and is responsible for ordering this construct's creation
 * after it (a CDK stack-level dependency is enough; these tables reference the database by name,
 * not by object, so no per-table CloudFormation dependency is needed).
 */
public class SecurityLakeTables {

    public final CfnTable securityHubTable;
    public final CfnTable guardDutyTable;
    public final CfnTable githubAlertsTable;
    public final CfnTable lifecycleTable;
    public final CfnTable wafTable;
    public final CfnTable rotationTable;
    public final CfnTable sbomKevTable;

    @Value.Immutable
    public interface SecurityLakeTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database these tables belong to. */
        String databaseName();

        /** The analytics lake bucket name, used to build each table's S3 location. */
        String lakeBucketName();

        static ImmutableSecurityLakeTablesProps.Builder builder() {
            return ImmutableSecurityLakeTablesProps.builder();
        }
    }

    public SecurityLakeTables(final Construct scope, final SecurityLakeTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();

        this.securityHubTable = buildTable(
                scope,
                props,
                catalogId,
                "security_hub_findings",
                "curated/security/security-hub/",
                "One row per active Security Hub finding, one JSON object per line, checked nightly",
                columnsOf(
                        "finding_id", "string",
                        "title", "string",
                        "severity_label", "string",
                        "severity_normalized", "int",
                        "types", "string",
                        "resource_id", "string",
                        "resource_type", "string",
                        "record_state", "string",
                        "workflow_status", "string",
                        "generator_id", "string",
                        "first_observed_at", "string",
                        "updated_at", "string",
                        "zero_findings", "boolean",
                        "checked_at", "string"));

        this.guardDutyTable = buildTable(
                scope,
                props,
                catalogId,
                "guardduty_findings",
                "curated/security/guardduty/",
                "One row per active GuardDuty finding, one JSON object per line, checked nightly",
                columnsOf(
                        "finding_id", "string",
                        "type", "string",
                        "severity", "double",
                        "resource_type", "string",
                        "region", "string",
                        "account_id", "string",
                        "title", "string",
                        "created_at", "string",
                        "updated_at", "string",
                        "zero_findings", "boolean",
                        "checked_at", "string"));

        this.githubAlertsTable = buildTable(
                scope,
                props,
                catalogId,
                "github_alerts",
                "curated/security/github-alerts/",
                "One row per (alert type, severity) of open code scanning, Dependabot and secret"
                        + " scanning alerts, checked nightly",
                columnsOf(
                        "alert_type", "string",
                        "severity", "string",
                        "count", "int",
                        "oldest_created_at", "string"));

        this.lifecycleTable = buildTable(
                scope,
                props,
                catalogId,
                "lifecycle",
                "curated/security/lifecycle/",
                "One row per lifecycle.toml entry, with a live end date and days remaining, checked nightly",
                columnsOf(
                        "name", "string",
                        "kind", "string",
                        "current", "string",
                        "end_date", "string",
                        "days_remaining", "int",
                        "source", "string",
                        "checked_at", "string"));

        this.wafTable = buildTable(
                scope,
                props,
                catalogId,
                "waf_blocks",
                "curated/security/waf/",
                "One row per WAF rule that blocked at least one request that day, checked nightly",
                columnsOf(
                        "rule", "string",
                        "blocks", "bigint",
                        "log_group", "string",
                        "zero_findings", "boolean"));

        this.rotationTable = buildTable(
                scope,
                props,
                catalogId,
                "secret_rotation",
                "curated/security/rotation/",
                "One row per secrets-rotation.toml entry, with the rotated-at tag and its age, checked nightly",
                columnsOf(
                        "secret_name", "string",
                        "console", "string",
                        "found", "boolean",
                        "rotated_at", "string",
                        "age_days", "int",
                        "zero_findings", "boolean",
                        "checked_at", "string"));

        this.sbomKevTable = buildTable(
                scope,
                props,
                catalogId,
                "sbom_kev_matches",
                "curated/security/sbom/",
                "One row per push-to-main build, matching the npm CycloneDX SBOM against CISA's"
                        + " Known Exploited Vulnerabilities catalogue (.github/workflows/sbom.yml)",
                columnsOf(
                        "run_id", "string",
                        "sha", "string",
                        "component_count", "int",
                        "kev_catalogue_count", "int",
                        "match_count", "int",
                        "matches", "string",
                        "checked_at", "string"));
    }

    private static CfnTable buildTable(
            Construct scope,
            SecurityLakeTablesProps props,
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

    private static String tableIdPrefix(SecurityLakeTablesProps props, String tableName) {
        // "security_hub_findings" -> "SecurityHubFindings"
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
