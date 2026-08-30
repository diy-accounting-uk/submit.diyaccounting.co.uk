/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
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
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.sqs.Queue;
import software.constructs.Construct;

/**
 * Environment-scoped orchestration for the scheduled jobs that pull third-party usage data into
 * the analytics lake: Stripe reconciliation, GA4 report pulls and CloudFront partition
 * maintenance. This stack owns the scheduling pattern only. Each job lands as one Lambda plus one
 * call to {@link #registerScheduledJob}, so later work adding a job never touches another job's
 * code.
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

        static ImmutableIngestionStackProps.Builder builder() {
            return ImmutableIngestionStackProps.builder();
        }
    }

    public IngestionStack(final Construct scope, final String id, final IngestionStackProps props) {
        super(scope, id, props);

        var sharedNames = props.sharedNames();
        var prefix = props.resourceNamePrefix();

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "IngestionStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");
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

        // prod: 02:15 daily. ci: 02:15 every Monday, so the third-party call stays low without
        // losing weekly coverage of the reconciliation path.
        var stripeReconcileSchedule = isProd
                ? Schedule.cron(CronOptions.builder().minute("15").hour("2").build())
                : Schedule.cron(CronOptions.builder()
                        .minute("15")
                        .hour("2")
                        .weekDay("MON")
                        .build());

        registerScheduledJob(
                "StripeReconcile",
                stripeReconcileFunctionName,
                stripeReconcileLambda,
                stripeReconcileSchedule,
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

        // prod: 03:15 daily, an hour after the Stripe job so the two nightly third-party pulls
        // do not start at the same minute. ci: 03:15 every Monday, same reasoning as Stripe's.
        var ga4ReportPullSchedule = isProd
                ? Schedule.cron(CronOptions.builder().minute("15").hour("3").build())
                : Schedule.cron(CronOptions.builder()
                        .minute("15")
                        .hour("3")
                        .weekDay("MON")
                        .build());

        registerScheduledJob(
                "Ga4ReportPull",
                ga4ReportPullFunctionName,
                ga4ReportPullLambda,
                ga4ReportPullSchedule,
                "Pull yesterday's GA4 traffic, pages and events reports into the analytics lake");

        infof("IngestionStack %s created successfully for %s", this.getNode().getId(), prefix);
    }

    /**
     * Wires one ingestion job into its schedule: a DLQ, an EventBridge rule that retries the
     * Lambda three times before parking the event on the DLQ, a Lambda-errors alarm and a
     * DLQ-depth alarm. Neither alarm carries an SNS action: the alarm-state-change rule in
     * OpsStack routes every alarm in the account to Telegram, which keeps the app-scoped alert
     * topic out of this env-scoped stack.
     *
     * @param name construct id prefix, unique within this stack
     * @param functionName the job Lambda's physical name, e.g. from a {@code SubmitSharedNames}
     *     field. Taken as a plain string rather than read off {@code lambdaFunction} itself:
     *     {@code Function.getFunctionName()} returns a deferred token even for an explicitly
     *     named function, and concatenating a suffix onto a token produces an {@code Fn::Join}
     *     instead of the plain resource name every other stack in this repo names its DLQs,
     *     rules and alarms after.
     * @param lambdaFunction the job Lambda to schedule
     * @param schedule when the job runs
     * @param description what the job does, used in the rule and alarm descriptions
     * @return the created rule
     */
    Rule registerScheduledJob(
            final String name,
            final String functionName,
            final Function lambdaFunction,
            final Schedule schedule,
            final String description) {
        var dlq = Queue.Builder.create(this, name + "-Dlq")
                .queueName(functionName + "-dlq")
                .retentionPeriod(Duration.days(14))
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        var rule = Rule.Builder.create(this, name + "-Schedule")
                .ruleName(functionName + "-schedule")
                .description(description)
                .schedule(schedule)
                .targets(List.of(LambdaFunction.Builder.create(lambdaFunction)
                        .retryAttempts(3)
                        .deadLetterQueue(dlq)
                        .maxEventAge(Duration.hours(2))
                        .build()))
                .build();

        Alarm.Builder.create(this, name + "-ErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription(description + ": Lambda errored at least once in 24 hours")
                .metric(lambdaFunction.metricErrors(
                        MetricOptions.builder().period(Duration.hours(24)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        Alarm.Builder.create(this, name + "-DlqDepthAlarm")
                .alarmName(functionName + "-dlq-depth")
                .alarmDescription(description + ": dead-letter queue holds at least one failed run")
                .metric(dlq.metricApproximateNumberOfMessagesVisible(
                        MetricOptions.builder().period(Duration.minutes(5)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        return rule;
    }
}
