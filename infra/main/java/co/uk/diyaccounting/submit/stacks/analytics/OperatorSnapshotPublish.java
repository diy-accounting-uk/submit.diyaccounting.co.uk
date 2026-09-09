/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.events.CronOptions;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

/**
 * The nightly Lambda behind the one-stop objectives dashboard (B52g): reads the B52d views and
 * writes one JSON snapshot per environment to {@code s3://<lake>/snapshots/<env>/latest.json},
 * plus a dated copy, organised by the eight objectives {@code PLAN_ONE_STOP_DASHBOARD.md}
 * names. {@code operatorSnapshotGet.js} (the API read route) only ever reads what this writes;
 * it never queries Athena itself.
 *
 * <p>Not a {@code Stack}: lives inside {@code AnalyticsStack}, matching {@link
 * AnalyticsDashboard}'s {@code metricsPublishLambda}, which this construct is modelled on. Its
 * own {@link Rule} and {@link Schedule} rather than a step in {@code NightlyIngestionWorkflow}:
 * that state machine belongs to the ingestion jobs and the single-day metrics publish, and this
 * Lambda reads trailing 30- and 90-day windows over the same views once ingestion has already
 * landed the day, not once per ingested day.
 */
public class OperatorSnapshotPublish extends Construct {

    public final Function snapshotPublishLambda;
    public final Alarm errorsAlarm;
    public final Rule schedule;

    @Value.Immutable
    public interface OperatorSnapshotPublishProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        String envName();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        /** The analytics results bucket: Athena writes its query output here, and the Lambda's
         * own role (not a separate Athena service role) needs to read and write it. */
        IBucket resultsBucket();

        /** The analytics lake bucket: read via Athena for every view query, and written
         * directly for the snapshot itself under {@code snapshots/<env>/}. */
        IBucket lakeBucket();

        String glueDatabaseName();

        String athenaWorkGroupName();

        static ImmutableOperatorSnapshotPublishProps.Builder builder() {
            return ImmutableOperatorSnapshotPublishProps.builder();
        }
    }

    public OperatorSnapshotPublish(final Construct scope, final OperatorSnapshotPublishProps props) {
        super(scope, props.idPrefix() + "-OperatorSnapshotPublish");

        var stack = Stack.of(scope);
        var region = stack.getRegion();
        var account = stack.getAccount();
        var prefix = props.idPrefix();
        var isProd = "prod".equals(props.envName());

        // ============================================================================
        // Snapshot-publish Lambda
        // ============================================================================
        var functionName = prefix + "-operator-snapshot-publish";

        var environment = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ATHENA_WORK_GROUP_NAME", props.athenaWorkGroupName())
                .with("GLUE_DATABASE_NAME", props.glueDatabaseName())
                .with("ANALYTICS_LAKE_BUCKET_NAME", props.lakeBucket().getBucketName());

        IRepository repository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-OperatorSnapshotPublish-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(props.ecrRepositoryArn())
                        .repositoryName(props.ecrRepositoryName())
                        .build());

        // AnalyticsStack is env-scoped, so this function name is stable forever, not
        // per-deployment - the idempotent create-if-missing path, matching metricsPublishLambda.
        var snapshotPublishLogGroup = ensureLogGroupWithDependency(
                stack, prefix + "-OperatorSnapshotPublishLogGroup", "/aws/lambda/" + functionName);

        this.snapshotPublishLambda = DockerImageFunction.Builder.create(this, prefix + "-OperatorSnapshotPublishFn")
                .functionName(functionName)
                .code(DockerImageCode.fromEcr(
                        repository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/analytics/operatorSnapshotPublish.handler"))
                                .build()))
                .timeout(Duration.minutes(5))
                .memorySize(256)
                .architecture(Architecture.ARM_64)
                .environment(environment)
                .logGroup(snapshotPublishLogGroup.logGroup())
                .build();
        this.snapshotPublishLambda.getNode().addDependency(snapshotPublishLogGroup.ensureResource());

        // Athena: run and poll queries against the one workgroup this stack owns.
        this.snapshotPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "athena:StartQueryExecution",
                        "athena:GetQueryExecution",
                        "athena:GetQueryResults",
                        "athena:StopQueryExecution"))
                .resources(List.of(athenaWorkGroupArn(region, account, props.athenaWorkGroupName())))
                .build());

        // Glue: read the database and every table in it (the views and the tables they read).
        this.snapshotPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetDatabase", "glue:GetTable", "glue:GetPartitions"))
                .resources(List.of(
                        glueCatalogArn(region, account),
                        glueDatabaseArn(region, account, props.glueDatabaseName()),
                        glueAllTablesArn(region, account, props.glueDatabaseName())))
                .build());

        // Athena writes its own query output to the results bucket and this Lambda reads it
        // back via GetQueryResults' underlying CSV, so both actions are needed even though the
        // Lambda never calls S3 directly for it - same grant as metricsPublishLambda.
        this.snapshotPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:PutObject"))
                .resources(List.of(props.resultsBucket().getBucketArn() + "/*"))
                .build());
        this.snapshotPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetBucketLocation", "s3:ListBucket"))
                .resources(List.of(props.resultsBucket().getBucketArn()))
                .build());

        // The lake: read for every view Athena scans, write for the snapshot this Lambda
        // produces itself.
        this.snapshotPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(props.lakeBucket().getBucketArn() + "/*"))
                .build());
        this.snapshotPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(props.lakeBucket().getBucketArn()))
                .build());
        this.snapshotPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:PutObject"))
                .resources(List.of(props.lakeBucket().getBucketArn() + "/snapshots/*"))
                .build());

        // ============================================================================
        // Schedule: prod nightly, ci weekly - the same cadence split
        // NightlyIngestionWorkflow uses for the third-party ingestion calls, so a trailing
        // window read runs no more often in ci than the data underneath it changes.
        // ============================================================================
        var cronOptions = isProd
                ? CronOptions.builder().minute("15").hour("3").build()
                : CronOptions.builder().minute("15").hour("3").weekDay("MON").build();

        this.schedule = Rule.Builder.create(this, prefix + "-OperatorSnapshotPublishSchedule")
                .ruleName(functionName + "-schedule")
                .description("Publish the operator objectives snapshot")
                .schedule(Schedule.cron(cronOptions))
                .targets(List.of(
                        LambdaFunction.Builder.create(this.snapshotPublishLambda).build()))
                .build();

        // ============================================================================
        // Alarm
        // ============================================================================
        this.errorsAlarm = Alarm.Builder.create(this, prefix + "-OperatorSnapshotPublish-ErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription("Operator snapshot publish errored at least once in 24 hours")
                .metric(this.snapshotPublishLambda.metricErrors(
                        MetricOptions.builder().period(Duration.hours(24)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();
    }

    private static String glueCatalogArn(String region, String account) {
        return "arn:aws:glue:%s:%s:catalog".formatted(region, account);
    }

    private static String glueDatabaseArn(String region, String account, String databaseName) {
        return "arn:aws:glue:%s:%s:database/%s".formatted(region, account, databaseName);
    }

    private static String glueAllTablesArn(String region, String account, String databaseName) {
        return "arn:aws:glue:%s:%s:table/%s/*".formatted(region, account, databaseName);
    }

    private static String athenaWorkGroupArn(String region, String account, String workGroupName) {
        return "arn:aws:athena:%s:%s:workgroup/%s".formatted(region, account, workGroupName);
    }
}
