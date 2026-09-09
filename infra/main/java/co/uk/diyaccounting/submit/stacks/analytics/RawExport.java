/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import java.util.List;
import java.util.Map;
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
 * The nightly raw export: one CSV per Athena view and one JSON per one-stop-dashboard objective,
 * written to {@code s3://<lake>/exports/<env>/<date>/} so every figure on the objectives page is
 * readable by Claude without the page (see {@code PLAN_ONE_STOP_DASHBOARD.md}'s "Raw data for
 * indexing" section). {@code scripts/analytics-pull.sh} syncs that prefix down to
 * {@code analytics/<env>/} at the workspace root, where {@code index/corpus.toml}'s
 * {@code analytics} source picks it up.
 *
 * <p>Not a {@link software.constructs.Construct} subclass itself, matching {@link
 * AnalyticsDashboard} and {@link DataQuality}: a plain class that takes the parent scope and
 * builds its children against it, exposing the created resources as public fields. Lives in
 * {@code AnalyticsStack}, which already owns the results bucket, the lake bucket, the Glue
 * database and the Athena workgroup this construct's Lambda reads through; {@code
 * IngestionStack}'s {@code NightlyIngestionWorkflow} imports {@link #publishLambda} by name, the
 * same import-by-name habit the rest of this repo uses for a resource owned by a sibling stack.
 */
public class RawExport extends Construct {

    public final Function publishLambda;
    public final Alarm errorsAlarm;

    @Value.Immutable
    public interface RawExportProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        String envName();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        /** The Lambda reads and writes its own Athena query output here. */
        IBucket resultsBucket();

        /** The Lambda reads every view through Athena and writes the export under {@code exports/}. */
        IBucket lakeBucket();

        String glueDatabaseName();

        String athenaWorkGroupName();

        static ImmutableRawExportProps.Builder builder() {
            return ImmutableRawExportProps.builder();
        }
    }

    public RawExport(final Construct scope, final RawExportProps props) {
        super(scope, props.idPrefix() + "-RawExport");

        var stack = Stack.of(scope);
        var region = stack.getRegion();
        var account = stack.getAccount();
        var prefix = props.idPrefix();

        // ============================================================================
        // Publish Lambda
        // ============================================================================
        var functionName = prefix + "-raw-export-publish";

        var environment = Map.of(
                "ENVIRONMENT_NAME", props.envName(),
                "ATHENA_WORK_GROUP_NAME", props.athenaWorkGroupName(),
                "GLUE_DATABASE_NAME", props.glueDatabaseName(),
                "ANALYTICS_LAKE_BUCKET_NAME", props.lakeBucket().getBucketName());

        IRepository repository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-RawExportPublish-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(props.ecrRepositoryArn())
                        .repositoryName(props.ecrRepositoryName())
                        .build());

        // AnalyticsStack is env-scoped (one deployment per environment, redeployed
        // indefinitely), so this function name is stable forever, not per-deployment - use the
        // idempotent create-if-missing path, not a plain LogGroup, the same as every other
        // function in this stack.
        var publishLogGroup =
                ensureLogGroupWithDependency(stack, prefix + "-RawExportPublishLogGroup", "/aws/lambda/" + functionName);

        this.publishLambda = DockerImageFunction.Builder.create(this, prefix + "-RawExportPublishFn")
                .functionName(functionName)
                .code(DockerImageCode.fromEcr(
                        repository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/analytics/rawExportPublish.handler"))
                                .build()))
                .timeout(Duration.minutes(5))
                .memorySize(512)
                .architecture(Architecture.ARM_64)
                .environment(environment)
                .logGroup(publishLogGroup.logGroup())
                .build();
        this.publishLambda.getNode().addDependency(publishLogGroup.ensureResource());

        // Athena: run and poll queries against the one workgroup this stack owns, same grant
        // AnalyticsDashboard.metricsPublishLambda carries.
        this.publishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "athena:StartQueryExecution",
                        "athena:GetQueryExecution",
                        "athena:GetQueryResults",
                        "athena:StopQueryExecution"))
                .resources(List.of(athenaWorkGroupArn(region, account, props.athenaWorkGroupName())))
                .build());

        this.publishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetDatabase", "glue:GetTable", "glue:GetPartitions"))
                .resources(List.of(
                        glueCatalogArn(region, account),
                        glueDatabaseArn(region, account, props.glueDatabaseName()),
                        glueAllTablesArn(region, account, props.glueDatabaseName())))
                .build());

        // Athena writes its own query output to the results bucket and this Lambda reads it back.
        this.publishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:PutObject"))
                .resources(List.of(props.resultsBucket().getBucketArn() + "/*"))
                .build());
        this.publishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetBucketLocation", "s3:ListBucket"))
                .resources(List.of(props.resultsBucket().getBucketArn()))
                .build());

        // Own prefix only, not the whole lake: the job never touches another entity's data.
        this.publishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:PutObject"))
                .resources(List.of(props.lakeBucket().getBucketArn() + "/exports/*"))
                .build());

        // ============================================================================
        // Lambda-errors alarm. No schedule, DLQ or DLQ-depth alarm: the nightly state machine
        // invokes this Lambda directly as one step in the chain, so a failure here (or upstream)
        // ends the execution rather than retrying in isolation off a DLQ.
        // ============================================================================
        this.errorsAlarm = Alarm.Builder.create(this, prefix + "-RawExportPublish-ErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription("The raw export publish Lambda errored at least once in 24 hours")
                .metric(this.publishLambda.metricErrors(
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
