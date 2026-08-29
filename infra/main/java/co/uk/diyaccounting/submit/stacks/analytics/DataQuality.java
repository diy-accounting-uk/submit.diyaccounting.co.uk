/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.events.CronOptions;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
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
import software.amazon.awscdk.services.sqs.Queue;
import software.constructs.Construct;
import software.constructs.IDependable;

/**
 * Glue Data Quality over {@code activity_events}: a ruleset in DQDL, a daily Lambda that starts
 * one evaluation run, and an alarm on the {@code failed} metric Glue itself publishes.
 *
 * <p>Not wired through {@code IngestionStack.registerScheduledJob}: that method lives on a
 * sibling stack owned by concurrent work this wave, and this job's target table lives in {@code
 * AnalyticsStack}, not {@code IngestionStack}. This construct reproduces the same shape (one DLQ,
 * one retrying schedule rule, a Lambda-errors alarm and a DLQ-depth alarm) so a later pass can
 * fold both into one shared helper without changing behaviour.
 *
 * <p>The runner Lambda passes a scoped IAM role to Glue for the evaluation run itself: Glue reads
 * the table and, because {@code AdditionalRunOptions.CloudWatchMetricsEnabled} is set, publishes
 * the pass/fail metric under that role's credentials, not the Lambda's.
 */
public class DataQuality extends Construct {

    // Must match AnalyticsStack's ACTIVITY_EVENTS_CURATED_TABLE_NAME: the ruleset targets the
    // typed Parquet table, not the JSON spike table, since only the typed table has the promoted
    // columns (actor, flow, outcome, ...) the rules below check.
    private static final String TARGET_TABLE_NAME = "activity_events";

    private static final String RULESET = """
            Rules = [
                RowCount > 0,
                IsComplete "event",
                IsComplete "event_ts",
                IsComplete "site",
                Completeness "actor" > 0.99,
                Completeness "flow" > 0.99,
                Uniqueness "event_id" > 0.99,
                ColumnValues "actor" in ["customer","test-user","synthetic","system","visitor","ai-agent"],
                ColumnValues "flow" in ["user-journey","ci-pipeline","infrastructure","operational","unknown"],
                ColumnValues "site" in ["submit"],
                ColumnValues "outcome" in ["failure"] with threshold < 0.2,
                ColumnValues "event_ts" > (now() - 2 days)
            ]
            """;

    private static final String GLUE_METRICS_NAMESPACE = "Glue Data Quality";
    private static final String GLUE_FAILED_METRIC_NAME = "glue.data.quality.rules.failed";
    private static final String RULESET_DIMENSION_NAME = "RulesetName";

    public final CfnDataQualityRuleset ruleset;
    public final Role evaluationRole;
    public final Function runLambda;
    public final Queue dlq;
    public final Rule schedule;
    public final Alarm rulesFailedAlarm;

    @Value.Immutable
    public interface DataQualityProps {

        String envName();

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String resourceNamePrefix();

        String glueDatabaseName();

        /**
         * The Glue database resource, so the ruleset carries an explicit CloudFormation
         * dependency on it. Optional because a standalone test of this construct has no separate
         * database resource to depend on.
         */
        @Value.Default
        default Optional<IDependable> glueDatabaseDependency() {
            return Optional.empty();
        }

        /**
         * The curated {@code activity_events} Glue table resource, so the ruleset waits for it to
         * exist before targeting it. Optional for the same reason as {@link
         * #glueDatabaseDependency()}.
         */
        @Value.Default
        default Optional<IDependable> targetTableDependency() {
            return Optional.empty();
        }

        /** The analytics lake bucket, so the evaluation role can read the table's S3 location. */
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
        // Underscored like glueDatabaseName: Glue and Athena identifiers reject hyphens.
        var rulesetName = "%s_env_activity_events_dq".formatted(props.envName());

        // ============================================================================
        // Ruleset
        // ============================================================================
        this.ruleset = CfnDataQualityRuleset.Builder.create(this, prefix + "-DataQualityRuleset")
                .name(rulesetName)
                .description("Data quality checks over " + TARGET_TABLE_NAME)
                .ruleset(RULESET)
                .targetTable(CfnDataQualityRuleset.DataQualityTargetTableProperty.builder()
                        .databaseName(props.glueDatabaseName())
                        .tableName(TARGET_TABLE_NAME)
                        .build())
                .build();
        props.glueDatabaseDependency().ifPresent(dependency -> this.ruleset.getNode().addDependency(dependency));
        props.targetTableDependency().ifPresent(dependency -> this.ruleset.getNode().addDependency(dependency));

        // ============================================================================
        // Evaluation role: assumed by Glue, not by the Lambda, to read the table and publish
        // the CloudWatch metric
        // ============================================================================
        this.evaluationRole = Role.Builder.create(this, prefix + "-DataQualityEvaluationRole")
                .roleName(prefix + "-data-quality-eval")
                .assumedBy(new ServicePrincipal("glue.amazonaws.com"))
                .build();

        this.evaluationRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "glue:GetDatabase",
                        "glue:GetTable",
                        "glue:GetTableVersion",
                        "glue:GetTableVersions",
                        "glue:GetPartitions"))
                .resources(List.of(
                        glueCatalogArn(stack),
                        glueDatabaseArn(stack, props.glueDatabaseName()),
                        glueTableArn(stack, props.glueDatabaseName(), TARGET_TABLE_NAME)))
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
                .resources(List.of(glueRulesetArn(stack, rulesetName)))
                .build());

        this.evaluationRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:GetBucketLocation", "s3:ListBucket"))
                .resources(List.of(
                        props.lakeBucket().getBucketArn(),
                        props.lakeBucket().getBucketArn() + "/curated/activity-events/*"))
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
                .environment(Map.of(
                        "ENVIRONMENT_NAME", props.envName(),
                        "GLUE_DATABASE_NAME", props.glueDatabaseName(),
                        "GLUE_DATA_QUALITY_TABLE_NAME", TARGET_TABLE_NAME,
                        "GLUE_DATA_QUALITY_RULESET_NAME", rulesetName,
                        "GLUE_DATA_QUALITY_ROLE_ARN", this.evaluationRole.getRoleArn()))
                .build();

        this.runLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:StartDataQualityRulesetEvaluationRun"))
                .resources(List.of(glueRulesetArn(stack, rulesetName)))
                .build());

        // Starting a run validates the ruleset's target table through the catalog, so the
        // caller needs the same read the evaluation role has.
        this.runLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetDatabase", "glue:GetTable"))
                .resources(List.of(
                        glueCatalogArn(stack),
                        glueDatabaseArn(stack, props.glueDatabaseName()),
                        glueTableArn(stack, props.glueDatabaseName(), TARGET_TABLE_NAME)))
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
        // Schedule: DLQ, retrying rule, Lambda-errors alarm, DLQ-depth alarm
        // ============================================================================
        this.dlq = Queue.Builder.create(this, prefix + "-DataQualityRun-Dlq")
                .queueName(runLambdaFunctionName + "-dlq")
                .retentionPeriod(Duration.days(14))
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        this.schedule = Rule.Builder.create(this, prefix + "-DataQualityRun-Schedule")
                .ruleName(runLambdaFunctionName + "-schedule")
                .description("Start the daily Glue data quality evaluation run over " + TARGET_TABLE_NAME)
                .schedule(Schedule.cron(
                        CronOptions.builder().minute("0").hour("4").build()))
                .targets(List.of(LambdaFunction.Builder.create(this.runLambda)
                        .retryAttempts(3)
                        .deadLetterQueue(this.dlq)
                        .maxEventAge(Duration.hours(2))
                        .build()))
                .build();

        Alarm.Builder.create(this, prefix + "-DataQualityRun-ErrorsAlarm")
                .alarmName(runLambdaFunctionName + "-errors")
                .alarmDescription("The data quality run Lambda errored at least once in 24 hours")
                .metric(this.runLambda.metricErrors(
                        MetricOptions.builder().period(Duration.hours(24)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        Alarm.Builder.create(this, prefix + "-DataQualityRun-DlqDepthAlarm")
                .alarmName(runLambdaFunctionName + "-dlq-depth")
                .alarmDescription("The data quality run's dead-letter queue holds at least one failed run")
                .metric(this.dlq.metricApproximateNumberOfMessagesVisible(
                        MetricOptions.builder().period(Duration.minutes(5)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // ============================================================================
        // Data-quality-failed alarm: Glue publishes this metric itself once
        // CloudWatchMetricsEnabled is set on the evaluation run, dimensioned by ruleset name
        // ============================================================================
        this.rulesFailedAlarm = Alarm.Builder.create(this, prefix + "-DataQualityRulesFailedAlarm")
                .alarmName(prefix + "-data-quality-rules-failed")
                .alarmDescription("At least one data quality rule failed on " + TARGET_TABLE_NAME + " in 24 hours")
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
        return "arn:aws:glue:%s:%s:dataQualityRuleset/%s"
                .formatted(stack.getRegion(), stack.getAccount(), rulesetName);
    }
}
