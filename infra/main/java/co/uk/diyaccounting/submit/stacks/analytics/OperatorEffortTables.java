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
 * Glue tables over the nightly GitHub pull {@code app/functions/analytics/operatorEffortPull.js}
 * writes to {@code curated/operator/}: {@code github_workflow_runs} (every Actions run, by
 * trigger and actor), {@code github_issue_events} (issue timeline events, by actor) and {@code
 * github_commits} (commits by author, flagged for a Claude Code co-author trailer). Together
 * these back {@code v_operator_interventions_daily}, the operator-effort objective's headline
 * view.
 *
 * <p>Modelled line for line on {@link WorkflowRunTables}: one {@code dt} partition-projection
 * column (type {@code date}, format {@code yyyy-MM-dd}), so a new day's object is queryable the
 * moment it lands with no crawler and no {@code MSCK REPAIR}. Not a {@link Construct} subclass
 * itself, matching {@link WorkflowRunTables} and {@link Ga4Tables}: a plain class that takes the
 * parent scope and builds its children against it, exposing the created resources as public
 * fields.
 *
 * <p>The caller owns the Glue database and must add a dependency from each table field onto it,
 * the same way {@code AnalyticsStack} does for {@link WorkflowRunTables}.
 */
public class OperatorEffortTables {

    private static final String CURATED_WORKFLOW_RUNS_PREFIX = "curated/operator/workflow-runs/";
    private static final String CURATED_ISSUE_EVENTS_PREFIX = "curated/operator/issue-events/";
    private static final String CURATED_COMMITS_PREFIX = "curated/operator/commits/";
    private static final String WORKFLOW_RUNS_TABLE_NAME = "github_workflow_runs";
    private static final String ISSUE_EVENTS_TABLE_NAME = "github_issue_events";
    private static final String COMMITS_TABLE_NAME = "github_commits";

    public final CfnTable workflowRunsTable;
    public final CfnTable issueEventsTable;
    public final CfnTable commitsTable;

    @Value.Immutable
    public interface OperatorEffortTablesProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The Glue database these tables belong to. */
        String databaseName();

        /** The analytics lake bucket name, used to build each table's S3 location. */
        String lakeBucketName();

        static ImmutableOperatorEffortTablesProps.Builder builder() {
            return ImmutableOperatorEffortTablesProps.builder();
        }
    }

    public OperatorEffortTables(final Construct scope, final OperatorEffortTablesProps props) {
        var catalogId = Stack.of(scope).getAccount();

        this.workflowRunsTable = buildTable(
                scope,
                props,
                catalogId,
                WORKFLOW_RUNS_TABLE_NAME,
                CURATED_WORKFLOW_RUNS_PREFIX,
                "One row per GitHub Actions workflow run, one JSON object per line",
                columnsOf(
                        "run_id", "string",
                        "workflow_name", "string",
                        "event", "string",
                        "actor", "string",
                        "status", "string",
                        "conclusion", "string",
                        "created_at", "string",
                        "updated_at", "string",
                        "html_url", "string"));

        this.issueEventsTable = buildTable(
                scope,
                props,
                catalogId,
                ISSUE_EVENTS_TABLE_NAME,
                CURATED_ISSUE_EVENTS_PREFIX,
                "One row per issue timeline event, one JSON object per line",
                columnsOf(
                        "issue_number", "bigint",
                        "event_type", "string",
                        "actor", "string",
                        "is_operator", "boolean",
                        "created_at", "string"));

        this.commitsTable = buildTable(
                scope,
                props,
                catalogId,
                COMMITS_TABLE_NAME,
                CURATED_COMMITS_PREFIX,
                "One row per commit on the default branch, one JSON object per line",
                columnsOf(
                        "sha", "string",
                        "author", "string",
                        "authored_at", "string",
                        "has_claude_coauthor", "boolean"));
    }

    private static CfnTable buildTable(
            Construct scope,
            OperatorEffortTablesProps props,
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

    private static String tableIdPrefix(OperatorEffortTablesProps props, String tableName) {
        // "github_workflow_runs" -> "GithubWorkflowRuns"
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
