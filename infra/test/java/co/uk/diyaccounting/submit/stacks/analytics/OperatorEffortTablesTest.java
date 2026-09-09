/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class OperatorEffortTablesTest {

    private static Template synthTemplate() {
        App app = new App();
        Stack stack = new Stack(
                app,
                "TestStack",
                StackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .build());

        new OperatorEffortTables(
                stack,
                OperatorEffortTables.OperatorEffortTablesProps.builder()
                        .idPrefix("docs-env")
                        .databaseName("docs_env_analytics")
                        .lakeBucketName("docs-env-analytics-lake-111111111111")
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void createsThreeTablesWithDateProjectionAndNoOtherPartitionKey() {
        Template template = synthTemplate();

        template.resourceCountIs("AWS::Glue::Table", 3);

        for (String tableName : List.of("github_workflow_runs", "github_issue_events", "github_commits")) {
            template.hasResourceProperties(
                    "AWS::Glue::Table",
                    Match.objectLike(Map.of(
                            "TableInput",
                            Match.objectLike(Map.of(
                                    "Name",
                                    tableName,
                                    "PartitionKeys",
                                    List.of(Map.of("Name", "dt", "Type", "date")),
                                    "Parameters",
                                    Match.objectLike(Map.of(
                                            "classification",
                                            "json",
                                            "projection.enabled",
                                            "true",
                                            "projection.dt.type",
                                            "date",
                                            "projection.dt.format",
                                            "yyyy-MM-dd")))))));
        }
    }

    @Test
    void eachTableLocationSitsUnderItsOwnCuratedPrefix() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(
                        Map.of(
                                "TableInput",
                                Match.objectLike(
                                        Map.of(
                                                "Name",
                                                "github_workflow_runs",
                                                "StorageDescriptor",
                                                Match.objectLike(
                                                        Map.of(
                                                                "Location",
                                                                "s3://docs-env-analytics-lake-111111111111/curated/operator/workflow-runs/")))))));

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "github_commits",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Location",
                                        "s3://docs-env-analytics-lake-111111111111/curated/operator/commits/")))))));
    }

    @Test
    void workflowRunsColumnsCarryTheEventAndActorFields() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "github_workflow_runs",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(
                                                List.of(
                                                        Map.of("Name", "event", "Type", "string"),
                                                        Map.of("Name", "actor", "Type", "string"))))))))));
    }

    @Test
    void commitsColumnsCarryTheClaudeCoauthorFlag() {
        Template template = synthTemplate();

        template.hasResourceProperties(
                "AWS::Glue::Table",
                Match.objectLike(Map.of(
                        "TableInput",
                        Match.objectLike(Map.of(
                                "Name",
                                "github_commits",
                                "StorageDescriptor",
                                Match.objectLike(Map.of(
                                        "Columns",
                                        Match.arrayWith(
                                                List.of(
                                                        Map.of(
                                                                "Name",
                                                                "has_claude_coauthor",
                                                                "Type",
                                                                "boolean"))))))))));
    }

    @Test
    void tableCountStaysAtThree() {
        assertEquals(3, synthTemplate().findResources("AWS::Glue::Table").size());
    }
}
