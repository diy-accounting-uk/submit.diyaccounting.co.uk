/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.glue.CfnDataQualityRuleset;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;
import software.constructs.IDependable;

/**
 * Glue Data Quality over three catalog tables: {@code activity_events}, {@code
 * alarm_state_changes} and {@code dora_runs}. One ruleset, one CloudWatch alarm on the {@code
 * failed} metric and one entry in the runner Lambda's target list per table; one shared
 * evaluation role and one runner Lambda for all three.
 *
 * <p>No schedule, DLQ or rule of its own: {@code IngestionStack}'s {@code
 * NightlyIngestionWorkflow} state machine invokes {@link #runLambda} directly as one step in the
 * nightly chain, after the ingestion jobs and before the metrics publish. Only the Lambda-errors
 * alarm stays here, matching {@code IngestionStack.registerIngestionJob}'s shape.
 *
 * <p>The runner Lambda passes a scoped IAM role to Glue for the evaluation run itself: Glue reads
 * the table and, because {@code AdditionalRunOptions.CloudWatchMetricsEnabled} is set, publishes
 * the pass/fail metric under that role's credentials, not the Lambda's.
 */
public class DataQuality extends Construct {

    /** One table Glue Data Quality evaluates: its ruleset name suffix, curated prefix and DQDL text. */
    private record Target(String tableName, String curatedPrefix, String ruleset) {}

    private static final String ACTIVITY_EVENTS_TABLE_NAME = "activity_events";
    private static final String ACTIVITY_EVENTS_CURATED_PREFIX = "curated/activity-events/";
    private static final String ALARM_STATE_CHANGES_TABLE_NAME = "alarm_state_changes";
    private static final String ALARM_STATE_CHANGES_CURATED_PREFIX = "curated/alarm-state-changes/";
    private static final String DORA_RUNS_TABLE_NAME = "dora_runs";
    private static final String DORA_RUNS_CURATED_PREFIX = "curated/dora/";
    private static final String COMPLIANCE_ACCESSIBILITY_TABLE_NAME = "compliance_accessibility";
    private static final String COMPLIANCE_ACCESSIBILITY_CURATED_PREFIX = "curated/compliance/accessibility/";
    private static final String COMPLIANCE_FRAUD_HEADERS_TABLE_NAME = "compliance_fraud_headers";
    private static final String COMPLIANCE_FRAUD_HEADERS_CURATED_PREFIX = "curated/compliance/fraud-headers/";
    private static final String COST_FOCUS_TABLE_NAME = "cost_focus";
    private static final String COST_FOCUS_CURATED_PREFIX = "curated/cost/focus/";

    private static final String ACTIVITY_EVENTS_RULESET =
            """
            Rules = [
                RowCount > 0,
                IsComplete "event",
                IsComplete "event_ts",
                IsComplete "site",
                Completeness "actor" > 0.99,
                Completeness "flow" > 0.99,
                Uniqueness "event_id" > 0.99,
                ColumnValues "actor" in ["customer","test-user","synthetic","probe","system","visitor","ai-agent"],
                ColumnValues "flow" in ["user-journey","ci-pipeline","infrastructure","operational","unknown"],
                ColumnValues "site" in ["submit"],
                ColumnValues "outcome" in ["failure"] with threshold < 0.2,
                ColumnValues "event_ts" > (now() - 2 days)
            ]
            """;

    private static final String ALARM_STATE_CHANGES_RULESET =
            """
            Rules = [
                RowCount > 0,
                IsComplete "event_ts",
                ColumnValues "state" in ["ALARM","OK","INSUFFICIENT_DATA"]
            ]
            """;

    private static final String COST_FOCUS_RULESET =
            """
            Rules = [
                RowCount > 0,
                IsComplete "billed_cost"
            ]
            """;

    private static final String DORA_RUNS_RULESET =
            """
            Rules = [
                RowCount > 0,
                IsComplete "finished_at"
            ]
            """;

    // Simple emptiness checks, one per compliance source: the compliance panel's own job is to
    // say whether each source landed at all, not to grade its content.
    private static final String COMPLIANCE_ACCESSIBILITY_RULESET =
            """
            Rules = [
                RowCount > 0
            ]
            """;

    private static final String COMPLIANCE_FRAUD_HEADERS_RULESET =
            """
            Rules = [
                RowCount > 0
            ]
            """;

    private final List<Target> targets;

    private static final String GLUE_METRICS_NAMESPACE = "Glue Data Quality";
    private static final String GLUE_FAILED_METRIC_NAME = "glue.data.quality.rules.failed";
    private static final String RULESET_DIMENSION_NAME = "RulesetName";

    public final List<CfnDataQualityRuleset> rulesets = new ArrayList<>();
    public final Role evaluationRole;
    public final Function runLambda;
    public final Alarm errorsAlarm;
    public final List<Alarm> rulesFailedAlarms = new ArrayList<>();

    @Value.Immutable
    public interface DataQualityProps {

        String envName();

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String resourceNamePrefix();

        String glueDatabaseName();

        /**
         * The Glue database resource, so every ruleset carries an explicit CloudFormation
         * dependency on it. Optional because a standalone test of this construct has no separate
         * database resource to depend on.
         */
        @Value.Default
        default Optional<IDependable> glueDatabaseDependency() {
            return Optional.empty();
        }

        /**
         * Each target table's Glue table resource, keyed by table name, so its ruleset waits for
         * the table to exist before targeting it. A table with no entry here (or in a standalone
         * test of this construct) carries no such dependency.
         */
        @Value.Default
        default Map<String, IDependable> targetTableDependencies() {
            return Map.of();
        }

        /** The analytics lake bucket, so the evaluation role can read every target table's S3 location. */
        IBucket lakeBucket();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        static ImmutableDataQualityProps.Builder builder() {
            return ImmutableDataQualityProps.builder();
        }
    }

    public DataQuality(final Construct scope, final String id, final DataQualityProps props) {
        super(scope, id);

        var stack = Stack.of(this);
        var prefix = props.resourceNamePrefix();

        this.targets = List.of(
                new Target(ACTIVITY_EVENTS_TABLE_NAME, ACTIVITY_EVENTS_CURATED_PREFIX, ACTIVITY_EVENTS_RULESET),
                new Target(
                        ALARM_STATE_CHANGES_TABLE_NAME,
                        ALARM_STATE_CHANGES_CURATED_PREFIX,
                        ALARM_STATE_CHANGES_RULESET),
                new Target(DORA_RUNS_TABLE_NAME, DORA_RUNS_CURATED_PREFIX, DORA_RUNS_RULESET),
                new Target(
                        COMPLIANCE_ACCESSIBILITY_TABLE_NAME,
                        COMPLIANCE_ACCESSIBILITY_CURATED_PREFIX,
                        COMPLIANCE_ACCESSIBILITY_RULESET),
                new Target(
                        COMPLIANCE_FRAUD_HEADERS_TABLE_NAME,
                        COMPLIANCE_FRAUD_HEADERS_CURATED_PREFIX,
                        COMPLIANCE_FRAUD_HEADERS_RULESET),
                new Target(COST_FOCUS_TABLE_NAME, COST_FOCUS_CURATED_PREFIX, COST_FOCUS_RULESET));

        // ============================================================================
        // Rulesets, one per target table
        // ============================================================================
        for (Target target : this.targets) {
            var rulesetName = rulesetName(props.envName(), target.tableName());
            // The activity_events ruleset keeps the construct id it was first deployed under: a
            // Glue ruleset name is unique, and a changed logical id makes CloudFormation create the
            // replacement before it deletes the original, which the change set refuses.
            var rulesetId = ACTIVITY_EVENTS_TABLE_NAME.equals(target.tableName())
                    ? prefix + "-DataQualityRuleset"
                    : prefix + "-" + target.tableName() + "-Ruleset";
            var ruleset = CfnDataQualityRuleset.Builder.create(this, rulesetId)
                    .name(rulesetName)
                    .description("Data quality checks over " + target.tableName())
                    .ruleset(target.ruleset())
                    .targetTable(CfnDataQualityRuleset.DataQualityTargetTableProperty.builder()
                            .databaseName(props.glueDatabaseName())
                            .tableName(target.tableName())
                            .build())
                    .build();
            props.glueDatabaseDependency()
                    .ifPresent(dependency -> ruleset.getNode().addDependency(dependency));
            Optional.ofNullable(props.targetTableDependencies().get(target.tableName()))
                    .ifPresent(dependency -> ruleset.getNode().addDependency(dependency));
            this.rulesets.add(ruleset);
        }

        // ============================================================================
        // Evaluation role: assumed by Glue, not by the Lambda, to read every target table and
        // publish the CloudWatch metric
        // ============================================================================
        this.evaluationRole = Role.Builder.create(this, prefix + "-DataQualityEvaluationRole")
                .roleName(prefix + "-data-quality-eval")
                .assumedBy(new ServicePrincipal("glue.amazonaws.com"))
                .build();

        var targetTableArns = this.targets.stream()
                .map(target -> glueTableArn(stack, props.glueDatabaseName(), target.tableName()))
                .toList();
        var rulesetArns = this.targets.stream()
                .map(target -> glueRulesetArn(stack, rulesetName(props.envName(), target.tableName())))
                .toList();
        var curatedPrefixResources = this.targets.stream()
                .map(target -> props.lakeBucket().getBucketArn() + "/" + target.curatedPrefix() + "*")
                .toList();

        this.evaluationRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "glue:GetDatabase",
                        "glue:GetTable",
                        "glue:GetTableVersion",
                        "glue:GetTableVersions",
                        "glue:GetPartitions"))
                .resources(withCatalogAndDatabase(stack, props.glueDatabaseName(), targetTableArns))
                .build());

        // The evaluation session reads its own run and ruleset back and publishes the result
        // against the ruleset while it works.
        this.evaluationRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "glue:GetDataQualityRuleset",
                        "glue:GetDataQualityRulesetEvaluationRun",
                        "glue:GetDataQualityResult",
                        "glue:PublishDataQuality"))
                .resources(rulesetArns)
                .build());

        this.evaluationRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:GetBucketLocation", "s3:ListBucket"))
                .resources(prepend(props.lakeBucket().getBucketArn(), curatedPrefixResources))
                .build());

        // Glue sets up continuous logging for the evaluation run against /aws-glue/jobs/logs-v2
        // before it evaluates anything; without these the role's own log group and stream can
        // never be created, which is non-fatal (the evaluation still runs and publishes its
        // result) but denies CreateLogGroup on every run.
        this.evaluationRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"))
                .resources(List.of("arn:aws:logs:%s:%s:log-group:/aws-glue/jobs/logs-v2:*"
                        .formatted(stack.getRegion(), stack.getAccount())))
                .build());

        // CloudWatch's PutMetricData has no ARN form to scope to, so the wildcard resource is
        // narrowed with a namespace condition instead: the role can publish only to the "Glue
        // Data Quality" namespace Glue itself writes to, nothing else in the account.
        this.evaluationRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("cloudwatch:PutMetricData"))
                .resources(List.of("*"))
                .conditions(Map.of("StringEquals", Map.of("cloudwatch:namespace", GLUE_METRICS_NAMESPACE)))
                .build());

        // ============================================================================
        // Runner Lambda
        // ============================================================================
        var runLambdaFunctionName = prefix + "-data-quality-run";

        IRepository ecrRepository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-DataQualityRun-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(props.ecrRepositoryArn())
                        .repositoryName(props.ecrRepositoryName())
                        .build());

        // AnalyticsStack is env-scoped (one deployment per environment, redeployed
        // indefinitely), so this function name is stable forever, not per-deployment: it has
        // already run in ci and prod, and Lambda already auto-created its log group with no
        // retention or removal policy. A plain LogGroup construct here would fail at deploy with
        // "already exists" - use the idempotent create-if-missing path instead.
        var runLambdaLogGroup = ensureLogGroupWithDependency(
                stack, prefix + "-DataQualityRunLogGroup", "/aws/lambda/" + runLambdaFunctionName);

        this.runLambda = DockerImageFunction.Builder.create(this, prefix + "-DataQualityRunFn")
                .functionName(runLambdaFunctionName)
                .code(DockerImageCode.fromEcr(
                        ecrRepository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/analytics/dataQualityRun.handler"))
                                .build()))
                .timeout(Duration.seconds(30))
                .memorySize(256)
                .architecture(Architecture.ARM_64)
                .logGroup(runLambdaLogGroup.logGroup())
                .environment(Map.of(
                        "ENVIRONMENT_NAME", props.envName(),
                        "GLUE_DATABASE_NAME", props.glueDatabaseName(),
                        "GLUE_DATA_QUALITY_ROLE_ARN", this.evaluationRole.getRoleArn(),
                        "ANALYTICS_LAKE_BUCKET_NAME", props.lakeBucket().getBucketName(),
                        "GLUE_DATA_QUALITY_TARGETS", buildTargetsJson(props.envName(), this.targets)))
                .build();
        this.runLambda.getNode().addDependency(runLambdaLogGroup.ensureResource());

        this.runLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:StartDataQualityRulesetEvaluationRun"))
                .resources(rulesetArns)
                .build());

        // Starting a run validates the ruleset's target table through the catalog, so the
        // caller needs the same read the evaluation role has. GetPartitions/BatchCreatePartition
        // let it register partitions from S3 before the run starts, since Glue Data Quality reads
        // partitions from the catalog only and these tables use Athena partition projection
        // (no partitions registered by default).
        this.runLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(
                        List.of("glue:GetDatabase", "glue:GetTable", "glue:GetPartitions", "glue:BatchCreatePartition"))
                .resources(withCatalogAndDatabase(stack, props.glueDatabaseName(), targetTableArns))
                .build());

        // Lists each target's curated prefix to discover partitions to register; scoped to those
        // prefixes so the Lambda can't enumerate the rest of the lake bucket.
        this.runLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(props.lakeBucket().getBucketArn()))
                .conditions(Map.of(
                        "StringLike",
                        Map.of(
                                "s3:prefix",
                                this.targets.stream()
                                        .map(target -> target.curatedPrefix() + "*")
                                        .toList())))
                .build());

        // The Lambda only ever hands this one role to Glue: iam:PassRole is scoped to it, with
        // the service condition so nothing else could receive it even if the ARN leaked.
        this.runLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("iam:PassRole"))
                .resources(List.of(this.evaluationRole.getRoleArn()))
                .conditions(Map.of("StringEquals", Map.of("iam:PassedToService", "glue.amazonaws.com")))
                .build());

        // ============================================================================
        // Lambda-errors alarm. No schedule, DLQ or DLQ-depth alarm: the nightly state machine
        // invokes this Lambda directly and a failure here stops the chain.
        // ============================================================================
        this.errorsAlarm = Alarm.Builder.create(this, prefix + "-DataQualityRun-ErrorsAlarm")
                .alarmName(runLambdaFunctionName + "-errors")
                .alarmDescription("The data quality run Lambda errored at least once in 24 hours")
                .metric(this.runLambda.metricErrors(
                        MetricOptions.builder().period(Duration.hours(24)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // ============================================================================
        // Data-quality-failed alarm, one per target: Glue publishes this metric itself once
        // CloudWatchMetricsEnabled is set on the evaluation run, dimensioned by ruleset name
        // ============================================================================
        for (Target target : this.targets) {
            var rulesetName = rulesetName(props.envName(), target.tableName());
            var alarm = Alarm.Builder.create(this, prefix + "-" + target.tableName() + "-DataQualityRulesFailedAlarm")
                    .alarmName(prefix + "-" + target.tableName().replace('_', '-') + "-data-quality-rules-failed")
                    .alarmDescription("At least one data quality rule failed on " + target.tableName() + " in 24 hours")
                    .metric(Metric.Builder.create()
                            .namespace(GLUE_METRICS_NAMESPACE)
                            .metricName(GLUE_FAILED_METRIC_NAME)
                            .dimensionsMap(Map.of(RULESET_DIMENSION_NAME, rulesetName))
                            .statistic("Sum")
                            .period(Duration.hours(24))
                            .build())
                    .threshold(1)
                    .evaluationPeriods(1)
                    .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                    .treatMissingData(TreatMissingData.NOT_BREACHING)
                    .build();
            this.rulesFailedAlarms.add(alarm);
        }
    }

    // Underscored like glueDatabaseName: Glue and Athena identifiers reject hyphens.
    private static String rulesetName(String envName, String tableName) {
        return "%s_env_%s_dq".formatted(envName, tableName);
    }

    private static String buildTargetsJson(String envName, List<Target> targets) {
        var builder = new StringBuilder("[");
        for (int i = 0; i < targets.size(); i++) {
            if (i > 0) builder.append(",");
            var target = targets.get(i);
            builder.append("{\"table\":\"")
                    .append(escapeJson(target.tableName()))
                    .append("\",\"ruleset\":\"")
                    .append(escapeJson(rulesetName(envName, target.tableName())))
                    .append("\",\"curatedPrefix\":\"")
                    .append(escapeJson(target.curatedPrefix()))
                    .append("\"}");
        }
        builder.append("]");
        return builder.toString();
    }

    private static String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static List<String> withCatalogAndDatabase(Stack stack, String databaseName, List<String> tableArns) {
        var all = new ArrayList<String>();
        all.add(glueCatalogArn(stack));
        all.add(glueDatabaseArn(stack, databaseName));
        all.addAll(tableArns);
        return all;
    }

    private static List<String> prepend(String first, List<String> rest) {
        var all = new ArrayList<String>();
        all.add(first);
        all.addAll(rest);
        return all;
    }

    private static String glueCatalogArn(Stack stack) {
        return "arn:aws:glue:%s:%s:catalog".formatted(stack.getRegion(), stack.getAccount());
    }

    private static String glueDatabaseArn(Stack stack, String databaseName) {
        return "arn:aws:glue:%s:%s:database/%s".formatted(stack.getRegion(), stack.getAccount(), databaseName);
    }

    private static String glueTableArn(Stack stack, String databaseName, String tableName) {
        return "arn:aws:glue:%s:%s:table/%s/%s"
                .formatted(stack.getRegion(), stack.getAccount(), databaseName, tableName);
    }

    private static String glueRulesetArn(Stack stack, String rulesetName) {
        return "arn:aws:glue:%s:%s:dataQualityRuleset/%s".formatted(stack.getRegion(), stack.getAccount(), rulesetName);
    }
}
