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
 * Glue tables over the two workflow-written sources the {@code put-lake-row} composite action
 * writes: {@code dora_runs} from every deploy and destroy run, and {@code probe_runs} from every
 * probe suite in {@code probe-test.yml}, at {@code curated/dora/dt=<date>/<run-id>-<attempt>.json}
 * and {@code curated/probe/dt=<date>/<run-id>-<suite>.json}.
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
public class WorkflowRunTables {

    private static final String CURATED_DORA_PREFIX = "curated/dora/";
    private static final String CURATED_PROBE_PREFIX = "curated/probe/";
    private static final String DORA_RUNS_TABLE_NAME = "dora_runs";
    private static final String PROBE_RUNS_TABLE_NAME = "probe_runs";

    public final CfnTable doraRunsTable;
    public final CfnTable probeRunsTable;

    @Value.Immutable
    public interface WorkflowRunTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database these tables belong to. */
        String databaseName();

        /** The analytics lake bucket name, used to build each table's S3 location. */
        String lakeBucketName();

        static ImmutableWorkflowRunTablesProps.Builder builder() {
            return ImmutableWorkflowRunTablesProps.builder();
        }
    }

    public WorkflowRunTables(final Construct scope, final WorkflowRunTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();

        this.doraRunsTable = buildTable(
                scope,
                props,
                catalogId,
                DORA_RUNS_TABLE_NAME,
                CURATED_DORA_PREFIX,
                "One row per deploy or destroy workflow run, one JSON object per line",
                buildDoraRunsColumns());

        this.probeRunsTable = buildTable(
                scope,
                props,
                catalogId,
                PROBE_RUNS_TABLE_NAME,
                CURATED_PROBE_PREFIX,
                "One row per probe suite run, one JSON object per line",
                buildProbeRunsColumns());
    }

    private static CfnTable buildTable(
            Construct scope,
            WorkflowRunTablesProps props,
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

    private static String tableIdPrefix(WorkflowRunTablesProps props, String tableName) {
        // "dora_runs" -> "DoraRuns"
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

    private static List<CfnTable.ColumnProperty> buildDoraRunsColumns() {
        return columnsOf(
                "workflow", "string",
                "environment", "string",
                "deployment", "string",
                "branch", "string",
                "sha", "string",
                "run_id", "string",
                "run_attempt", "bigint",
                "run_number", "bigint",
                "actor", "string",
                "trigger", "string",
                "started_at", "string",
                "finished_at", "string",
                "duration_seconds", "bigint",
                "conclusion", "string",
                "merged_at", "string",
                "lead_time_seconds", "bigint");
    }

    private static List<CfnTable.ColumnProperty> buildProbeRunsColumns() {
        return columnsOf(
                "environment", "string",
                "deployment", "string",
                "suite", "string",
                "run_id", "string",
                "run_attempt", "bigint",
                "finished_at", "string",
                "duration_seconds", "bigint",
                "trigger", "string",
                "passed", "boolean");
    }
}
