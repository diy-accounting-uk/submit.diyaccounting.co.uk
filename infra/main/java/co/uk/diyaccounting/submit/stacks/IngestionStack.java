/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.stacks.analytics.NightlyIngestionWorkflow;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
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
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

/**
 * Environment-scoped orchestration for the scheduled jobs that pull third-party usage data into
 * the analytics lake: Stripe reconciliation, GA4 report pulls and CloudFront partition
 * maintenance. This stack owns the scheduling pattern only. Each job lands as one Lambda plus one
 * call to {@link #registerIngestionJob}, so later work adding a job never touches another job's
 * code. Scheduling itself lives in {@link NightlyIngestionWorkflow}, the Step Functions state
 * machine this stack builds at the end of its constructor: {@link #registerIngestionJob} keeps
 * only the Lambda-errors alarm, since a failed job now stops the whole chain rather than retrying
 * in isolation off a DLQ.
 *
 * <p>Env-scoped rather than app-scoped for the same reason as {@link AnalyticsStack}: the jobs
 * write into the lake, which has to outlive any one deployment.
 */
public class IngestionStack extends Stack {

    public final IBucket lakeBucket;
    public final String glueDatabaseName;

    @Value.Immutable
    public interface IngestionStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        // Not read by this stack yet: no job Lambda exists until the first ingestion job lands.
        // Declared now, alongside the AnalyticsStack.baseImageTag() it mirrors, so that landing
        // one only edits this class's constructor body, not its props or SubmitEnvironment's
        // instantiation of it.
        String baseImageTag();

        // Same secret the billing Lambdas already read (BillingStack.stripeSecretKeyArn()).
        // Defaulted to blank rather than made required so a caller that has not been updated to
        // pass it yet still compiles; the Stripe reconciliation job simply gets no secret grant
        // and fails at invocation time until the caller is updated.
        @Value.Default
        default String stripeSecretKeyArn() {
            return "";
        }

        @Value.Default
        default String stripeTestSecretKeyArn() {
            return "";
        }

        // The GA4 property id, from cdk.json's ga4PropertyId context value. Not a secret, so it
        // travels through the same reflection loader as hostedZoneName rather than an env var.
        // Defaulted to blank so a caller that has not been updated to pass it yet still compiles;
        // the constructor below turns a blank value in prod into a synth-time failure instead of
        // a silently skipped ingestion job.
        @Value.Default
        default String ga4PropertyId() {
            return "";
        }

        // Same ARN-through-Secrets-Manager pattern as stripeSecretKeyArn.
        @Value.Default
        default String ga4ServiceAccountArn() {
            return "";
        }

        // The Google Cloud project holding the GA4 BigQuery export, from cdk.json's
        // ga4BigQueryProjectId context value. Same blank-in-prod-throws guard as ga4PropertyId:
        // a mistyped key would otherwise silently keep this blank and the event export job would
        // error at every invocation instead of failing synth once.
        @Value.Default
        default String ga4BigQueryProjectId() {
            return "";
        }

        // The BigQuery dataset holding the daily export tables, from cdk.json's
        // ga4BigQueryDatasetId context value.
        @Value.Default
        default String ga4BigQueryDatasetId() {
            return "";
        }

        // The BigQuery dataset's location, e.g. "europe-west2", from cdk.json's
        // ga4BigQueryLocation context value. A query job created in the wrong location fails
        // with a dataset-not-found error that reads like a permissions problem, so this has to
        // match the dataset's actual location exactly.
        @Value.Default
        default String ga4BigQueryLocation() {
            return "";
        }

        static ImmutableIngestionStackProps.Builder builder() {
            return ImmutableIngestionStackProps.builder();
        }
    }

    public IngestionStack(final Construct scope, final String id, final IngestionStackProps props) {
        super(scope, id, props);

        var sharedNames = props.sharedNames();
        var prefix = props.resourceNamePrefix();

        Tags.of(this).add("DataClassification", "internal");
        Tags.of(this).add("BackupRequired", "false");

        // Imported by name, not by cross-stack reference, matching how AnalyticsStack imports
        // the activity bus: AnalyticsStack owns the lake's lifecycle, this stack only writes
        // into it.
        this.lakeBucket = Bucket.fromBucketName(this, prefix + "-AnalyticsLake", sharedNames.analyticsLakeBucketName);
        this.glueDatabaseName = sharedNames.glueDatabaseName;

        var isProd = "prod".equals(props.envName());
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // ============================================================================
        // Stripe reconciliation job
        // ============================================================================
        // A plain DockerImageFunction, not the Lambda construct AnalyticsStack's transform
        // Lambda uses: that construct creates its own Errors alarm, which would collide with
        // the one registerScheduledJob adds below for the same function name. This job has no
        // provisioned concurrency and no alias either, since nothing but the nightly schedule
        // ever invokes it.
        var stripeReconcileFunctionName = prefix + "-stripe-reconcile";

        var stripeReconcileEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ANALYTICS_LAKE_BUCKET_NAME", sharedNames.analyticsLakeBucketName);
        if (props.stripeSecretKeyArn() != null && !props.stripeSecretKeyArn().isBlank()) {
            stripeReconcileEnv.with("STRIPE_SECRET_KEY_ARN", props.stripeSecretKeyArn());
        }
        if (props.stripeTestSecretKeyArn() != null
                && !props.stripeTestSecretKeyArn().isBlank()) {
            stripeReconcileEnv.with("STRIPE_TEST_SECRET_KEY_ARN", props.stripeTestSecretKeyArn());
        }

        IRepository stripeReconcileRepository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-StripeReconcile-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(sharedNames.ecrRepositoryArn)
                        .repositoryName(sharedNames.ecrRepositoryName)
                        .build());

        // IngestionStack is env-scoped (one deployment per environment, redeployed
        // indefinitely), so this function name is stable forever, not per-deployment: it has
        // already run and Lambda already auto-created its log group with no retention or removal
        // policy. A plain LogGroup construct here would fail at deploy with "already exists" - use
        // the idempotent create-if-missing path instead.
        var stripeReconcileLogGroup = ensureLogGroupWithDependency(
                this, prefix + "-StripeReconcileLogGroup", "/aws/lambda/" + stripeReconcileFunctionName);

        var stripeReconcileLambda = DockerImageFunction.Builder.create(this, prefix + "-StripeReconcileFn")
                .functionName(stripeReconcileFunctionName)
                .code(DockerImageCode.fromEcr(
                        stripeReconcileRepository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/analytics/stripeReconcile.handler"))
                                .build()))
                .timeout(Duration.minutes(5))
                .memorySize(512)
                .architecture(Architecture.ARM_64)
                .environment(stripeReconcileEnv)
                .logGroup(stripeReconcileLogGroup.logGroup())
                .build();
        stripeReconcileLambda.getNode().addDependency(stripeReconcileLogGroup.ensureResource());

        // Own prefix only, not the whole lake: the job never touches another entity's data.
        stripeReconcileLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:PutObject"))
                .resources(List.of(this.lakeBucket.getBucketArn() + "/curated/stripe/*"))
                .build());

        if (props.stripeSecretKeyArn() != null && !props.stripeSecretKeyArn().isBlank()) {
            var stripeSecretArnWithWildcard = props.stripeSecretKeyArn().endsWith("*")
                    ? props.stripeSecretKeyArn()
                    : props.stripeSecretKeyArn() + "-*";
            stripeReconcileLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(stripeSecretArnWithWildcard))
                    .build());
        }
        if (props.stripeTestSecretKeyArn() != null
                && !props.stripeTestSecretKeyArn().isBlank()) {
            var stripeTestSecretArnWithWildcard = props.stripeTestSecretKeyArn().endsWith("*")
                    ? props.stripeTestSecretKeyArn()
                    : props.stripeTestSecretKeyArn() + "-*";
            stripeReconcileLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(stripeTestSecretArnWithWildcard))
                    .build());
        }
        // Customer ids are hashed before they leave the Lambda, so it needs the same salt every
        // other hashSub() caller reads.
        SubHashSaltHelper.grantSaltAccess(stripeReconcileLambda, region, account, props.envName());

        registerIngestionJob(
                "StripeReconcile",
                stripeReconcileFunctionName,
                stripeReconcileLambda,
                "Pull yesterday's Stripe balance transactions, charges and subscription state into the analytics lake");

        // ============================================================================
        // GA4 report pull job
        // ============================================================================
        // The property id is not a secret, so a mistyped cdk.json key would otherwise silently
        // keep its blank default (KindCdk.getContextValueString swallows a missing key) and the
        // job would run forever with GA4_PROPERTY_ID unset. Failing synth in prod turns that into
        // a build-time error instead of a job that errors nightly into the DLQ.
        if (isProd && (props.ga4PropertyId() == null || props.ga4PropertyId().isBlank())) {
            throw new IllegalStateException(
                    "ga4PropertyId must be set in prod (see ga4PropertyId in cdk-environment/cdk.json)");
        }

        var ga4ReportPullFunctionName = prefix + "-ga4-report-pull";

        var ga4ReportPullEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ANALYTICS_LAKE_BUCKET_NAME", sharedNames.analyticsLakeBucketName);
        if (props.ga4PropertyId() != null && !props.ga4PropertyId().isBlank()) {
            ga4ReportPullEnv.with("GA4_PROPERTY_ID", props.ga4PropertyId());
        }
        if (props.ga4ServiceAccountArn() != null
                && !props.ga4ServiceAccountArn().isBlank()) {
            ga4ReportPullEnv.with("GA4_SERVICE_ACCOUNT_ARN", props.ga4ServiceAccountArn());
        }

        IRepository ga4ReportPullRepository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-Ga4ReportPull-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(sharedNames.ecrRepositoryArn)
                        .repositoryName(sharedNames.ecrRepositoryName)
                        .build());

        // Same exposure as stripeReconcileLambda above: env-scoped, stable function name,
        // already running - use the idempotent create-if-missing path, not a plain LogGroup.
        var ga4ReportPullLogGroup = ensureLogGroupWithDependency(
                this, prefix + "-Ga4ReportPullLogGroup", "/aws/lambda/" + ga4ReportPullFunctionName);

        var ga4ReportPullLambda = DockerImageFunction.Builder.create(this, prefix + "-Ga4ReportPullFn")
                .functionName(ga4ReportPullFunctionName)
                .code(DockerImageCode.fromEcr(
                        ga4ReportPullRepository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/analytics/ga4ReportPull.handler"))
                                .build()))
                .timeout(Duration.minutes(2))
                .memorySize(512)
                .architecture(Architecture.ARM_64)
                .environment(ga4ReportPullEnv)
                .logGroup(ga4ReportPullLogGroup.logGroup())
                .build();
        ga4ReportPullLambda.getNode().addDependency(ga4ReportPullLogGroup.ensureResource());

        // Own prefix only, not the whole lake: the job never touches another entity's data.
        ga4ReportPullLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:PutObject"))
                .resources(List.of(this.lakeBucket.getBucketArn() + "/curated/ga4/*"))
                .build());

        if (props.ga4ServiceAccountArn() != null
                && !props.ga4ServiceAccountArn().isBlank()) {
            var ga4SecretArnWithWildcard = props.ga4ServiceAccountArn().endsWith("*")
                    ? props.ga4ServiceAccountArn()
                    : props.ga4ServiceAccountArn() + "-*";
            ga4ReportPullLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(ga4SecretArnWithWildcard))
                    .build());
        }

        registerIngestionJob(
                "Ga4ReportPull",
                ga4ReportPullFunctionName,
                ga4ReportPullLambda,
                "Pull yesterday's GA4 traffic, pages and events reports into the analytics lake");

        // ============================================================================
        // GA4 BigQuery event export pull job
        // ============================================================================
        // Same reasoning as the ga4PropertyId guard above: a mistyped cdk.json key would
        // otherwise silently keep this blank and the job would error at every invocation
        // instead of failing synth once.
        if (isProd
                && (props.ga4BigQueryProjectId() == null
                        || props.ga4BigQueryProjectId().isBlank())) {
            throw new IllegalStateException(
                    "ga4BigQueryProjectId must be set in prod (see ga4BigQueryProjectId in cdk-environment/cdk.json)");
        }

        var ga4EventExportPullFunctionName = prefix + "-ga4-event-export-pull";

        var ga4EventExportPullEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ANALYTICS_LAKE_BUCKET_NAME", sharedNames.analyticsLakeBucketName);
        if (props.ga4BigQueryProjectId() != null
                && !props.ga4BigQueryProjectId().isBlank()) {
            ga4EventExportPullEnv.with("GA4_BIGQUERY_PROJECT_ID", props.ga4BigQueryProjectId());
        }
        if (props.ga4BigQueryDatasetId() != null
                && !props.ga4BigQueryDatasetId().isBlank()) {
            ga4EventExportPullEnv.with("GA4_BIGQUERY_DATASET_ID", props.ga4BigQueryDatasetId());
        }
        if (props.ga4BigQueryLocation() != null
                && !props.ga4BigQueryLocation().isBlank()) {
            ga4EventExportPullEnv.with("GA4_BIGQUERY_LOCATION", props.ga4BigQueryLocation());
        }
        if (props.ga4ServiceAccountArn() != null
                && !props.ga4ServiceAccountArn().isBlank()) {
            ga4EventExportPullEnv.with("GA4_SERVICE_ACCOUNT_ARN", props.ga4ServiceAccountArn());
        }

        IRepository ga4EventExportPullRepository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-Ga4EventExportPull-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(sharedNames.ecrRepositoryArn)
                        .repositoryName(sharedNames.ecrRepositoryName)
                        .build());

        // Same exposure as the other two jobs above: env-scoped, stable function name - use the
        // idempotent create-if-missing path, not a plain LogGroup.
        var ga4EventExportPullLogGroup = ensureLogGroupWithDependency(
                this,
                prefix + "-Ga4EventExportPullLogGroup",
                "/aws/lambda/" + ga4EventExportPullFunctionName);

        var ga4EventExportPullLambda =
                DockerImageFunction.Builder.create(this, prefix + "-Ga4EventExportPullFn")
                        .functionName(ga4EventExportPullFunctionName)
                        .code(DockerImageCode.fromEcr(
                                ga4EventExportPullRepository,
                                EcrImageCodeProps.builder()
                                        .tagOrDigest(props.baseImageTag())
                                        .cmd(List.of(
                                                "app/functions/analytics/ga4EventExportPull.handler"))
                                        .build()))
                        .timeout(Duration.minutes(5))
                        .memorySize(1024)
                        .architecture(Architecture.ARM_64)
                        .environment(ga4EventExportPullEnv)
                        .logGroup(ga4EventExportPullLogGroup.logGroup())
                        .build();
        ga4EventExportPullLambda.getNode().addDependency(ga4EventExportPullLogGroup.ensureResource());

        // Own prefix only, not the whole lake: the job never touches another entity's data.
        ga4EventExportPullLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:PutObject"))
                .resources(List.of(this.lakeBucket.getBucketArn() + "/curated/ga4_bq/*"))
                .build());

        // Same GA4 service-account secret ga4ReportPullLambda reads: one BigQuery-enabled
        // service account for both the Data API and the BigQuery export.
        if (props.ga4ServiceAccountArn() != null
                && !props.ga4ServiceAccountArn().isBlank()) {
            var ga4EventExportSecretArnWithWildcard = props.ga4ServiceAccountArn().endsWith("*")
                    ? props.ga4ServiceAccountArn()
                    : props.ga4ServiceAccountArn() + "-*";
            ga4EventExportPullLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(ga4EventExportSecretArnWithWildcard))
                    .build());
        }

        registerIngestionJob(
                "Ga4EventExportPull",
                ga4EventExportPullFunctionName,
                ga4EventExportPullLambda,
                "Pull two days ago's GA4 BigQuery event export into the analytics lake");

        // ============================================================================
        // Nightly orchestration: one Step Functions state machine, one EventBridge Scheduler
        // schedule, replacing the five independent rules and DLQs the jobs used before this
        // machine existed
        // ============================================================================
        // DataQuality and AnalyticsDashboard live in AnalyticsStack, which this stack already
        // depends on (see SubmitEnvironment), so their Lambdas are imported by name rather than
        // passed as a cross-stack object reference - the same import-by-name habit the rest of
        // this repo uses for a resource owned by a sibling stack.
        var dataQualityRunLambda =
                Function.fromFunctionName(this, prefix + "-DataQualityRun-Import", prefix + "-data-quality-run");
        var metricsPublishLambda = Function.fromFunctionName(
                this, prefix + "-AnalyticsMetricsPublish-Import", prefix + "-analytics-metrics-publish");

        new NightlyIngestionWorkflow(
                this,
                NightlyIngestionWorkflow.NightlyIngestionWorkflowProps.builder()
                        .idPrefix(prefix)
                        .envName(props.envName())
                        .stateMachineName(sharedNames.stateMachineName)
                        .stripeReconcileLambda(stripeReconcileLambda)
                        .ga4ReportPullLambda(ga4ReportPullLambda)
                        .ga4EventExportPullLambda(ga4EventExportPullLambda)
                        .dataQualityRunLambda(dataQualityRunLambda)
                        .metricsPublishLambda(metricsPublishLambda)
                        .build());

        infof("IngestionStack %s created successfully for %s", this.getNode().getId(), prefix);
    }

    /**
     * Wires one ingestion job's Lambda-errors alarm. No DLQ and no per-job schedule any more:
     * the nightly state machine ({@link NightlyIngestionWorkflow}) invokes every job directly and
     * a failure anywhere stops the chain, so replay is one state machine execution with an
     * explicit date rather than a DLQ redrive. The alarm carries no SNS action: the
     * alarm-state-change rule in OpsStack routes every alarm in the account to Telegram, which
     * keeps the app-scoped alert topic out of this env-scoped stack.
     *
     * @param name construct id prefix, unique within this stack
     * @param functionName the job Lambda's physical name, e.g. from a {@code SubmitSharedNames}
     *     field. Taken as a plain string rather than read off {@code lambdaFunction} itself:
     *     {@code Function.getFunctionName()} returns a deferred token even for an explicitly
     *     named function, and concatenating a suffix onto a token produces an {@code Fn::Join}
     *     instead of the plain resource name every other stack in this repo names its alarms
     *     after.
     * @param lambdaFunction the job Lambda to alarm on
     * @param description what the job does, used in the alarm description
     * @return the created alarm
     */
    Alarm registerIngestionJob(
            final String name, final String functionName, final Function lambdaFunction, final String description) {
        return Alarm.Builder.create(this, name + "-ErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription(description + ": Lambda errored at least once in 24 hours")
                .metric(lambdaFunction.metricErrors(
                        MetricOptions.builder().period(Duration.hours(24)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();
    }
}
