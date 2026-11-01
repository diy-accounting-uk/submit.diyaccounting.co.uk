/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import java.util.Map;
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
 * WP-7: the Lambda that turns the WP-6 Athena views into CloudWatch custom metrics, invoked as
 * the last step of the nightly chain.
 *
 * <p>Not a {@code Stack}: this lives inside {@code AnalyticsStack}, which owns the lake, the
 * Glue database and the Athena workgroup this construct queries. A plain {@code
 * DockerImageFunction} rather than the shared {@code Lambda} construct, matching {@code
 * IngestionStack}'s Stripe reconciliation job: that construct creates its own Errors alarm,
 * which would collide with the one this class adds for the same function name.
 *
 * <p>No schedule, DLQ or DLQ-depth alarm of its own: {@code IngestionStack}'s {@code
 * NightlyIngestionWorkflow} state machine invokes {@link #metricsPublishLambda} directly as the
 * final step, after the ingestion jobs and the data quality run, so a failed ingestion stops the
 * publish rather than the publish running regardless and putting a false zero in the metrics.
 *
 * <p>CloudWatch over QuickSight is the design's cost call: about $9/month all in, reusing the
 * alarm and Telegram routing that already exist, against QuickSight's $9-24 per author per month
 * before any reader.
 */
public class AnalyticsDashboard extends Construct {

    /** The namespace the Lambda's {@code cloudwatch:PutMetricData} grant is conditioned on, and
     * the published metrics are written to. Must match {@code METRICS_NAMESPACE} in {@code
     * app/functions/analytics/analyticsMetricsPublish.js} exactly. */
    private static final String METRICS_NAMESPACE = "Submit/Analytics";

    public final Function metricsPublishLambda;
    public final Alarm errorsAlarm;
    public final Alarm chargesWithoutActivationAlarm;

    @Value.Immutable
    public interface AnalyticsDashboardProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        String envName();

        SubmitSharedNames sharedNames();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        /** The analytics results bucket: the Lambda reads and writes its own Athena query
         * output here. */
        IBucket resultsBucket();

        /** The analytics lake bucket: the Lambda only ever reads from it, via Athena. */
        IBucket lakeBucket();

        String glueDatabaseName();

        String athenaWorkGroupName();

        static ImmutableAnalyticsDashboardProps.Builder builder() {
            return ImmutableAnalyticsDashboardProps.builder();
        }
    }

    public AnalyticsDashboard(final Construct scope, final AnalyticsDashboardProps props) {
        super(scope, props.idPrefix() + "-AnalyticsDashboard");

        var stack = Stack.of(scope);
        var region = stack.getRegion();
        var account = stack.getAccount();
        var prefix = props.idPrefix();

        // ============================================================================
        // Metrics-publish Lambda
        // ============================================================================
        var functionName = prefix + "-analytics-metrics-publish";

        var environment = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ATHENA_WORK_GROUP_NAME", props.athenaWorkGroupName())
                .with("GLUE_DATABASE_NAME", props.glueDatabaseName());

        IRepository repository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-AnalyticsMetricsPublish-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(props.ecrRepositoryArn())
                        .repositoryName(props.ecrRepositoryName())
                        .build());

        // AnalyticsStack is env-scoped (one deployment per environment, redeployed
        // indefinitely), so this function name is stable forever, not per-deployment: it has
        // already run in ci and prod, and Lambda already auto-created its log group with no
        // retention or removal policy. A plain LogGroup construct here would fail at deploy with
        // "already exists" - use the idempotent create-if-missing path instead.
        var metricsPublishLogGroup = ensureLogGroupWithDependency(
                stack, prefix + "-AnalyticsMetricsPublishLogGroup", "/aws/lambda/" + functionName);

        this.metricsPublishLambda = DockerImageFunction.Builder.create(this, prefix + "-AnalyticsMetricsPublishFn")
                .functionName(functionName)
                .code(DockerImageCode.fromEcr(
                        repository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/analytics/analyticsMetricsPublish.handler"))
                                .build()))
                .timeout(Duration.minutes(5))
                .memorySize(256)
                .architecture(Architecture.ARM_64)
                .environment(environment)
                .logGroup(metricsPublishLogGroup.logGroup())
                .build();
        this.metricsPublishLambda.getNode().addDependency(metricsPublishLogGroup.ensureResource());

        // Athena: run and poll queries against the one workgroup this stack owns.
        this.metricsPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "athena:StartQueryExecution",
                        "athena:GetQueryExecution",
                        "athena:GetQueryResults",
                        "athena:StopQueryExecution"))
                .resources(List.of(athenaWorkGroupArn(region, account, props.athenaWorkGroupName())))
                .build());

        // Glue: read the database and every table in it (the WP-6 views and the tables they
        // read). The table name wildcard is scoped to this one database, not every table in
        // the account.
        this.metricsPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetDatabase", "glue:GetTable", "glue:GetPartitions"))
                .resources(List.of(
                        glueCatalogArn(region, account),
                        glueDatabaseArn(region, account, props.glueDatabaseName()),
                        glueAllTablesArn(region, account, props.glueDatabaseName())))
                .build());

        // Athena writes its own query output to the results bucket and this Lambda reads it
        // back via GetQueryResults' underlying CSV, so both actions are needed even though the
        // Lambda never calls S3 directly for it.
        this.metricsPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:PutObject"))
                .resources(List.of(props.resultsBucket().getBucketArn() + "/*"))
                .build());
        // Athena checks the results bucket exists and where it lives before it starts a query.
        this.metricsPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetBucketLocation", "s3:ListBucket"))
                .resources(List.of(props.resultsBucket().getBucketArn()))
                .build());

        this.metricsPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(props.lakeBucket().getBucketArn() + "/*"))
                .build());
        this.metricsPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(props.lakeBucket().getBucketArn()))
                .build());

        // PutMetricData carries no resource-level ARN in IAM; the namespace condition is the
        // least-privilege form CloudWatch offers, the same pattern OpsStack uses for the
        // canary's SuccessPercent metric (OpsStack.java:403).
        this.metricsPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("cloudwatch:PutMetricData"))
                .resources(List.of("*"))
                .conditions(Map.of("StringEquals", Map.of("cloudwatch:namespace", METRICS_NAMESPACE)))
                .build());

        // ============================================================================
        // Lambda-errors alarm. No schedule, DLQ or DLQ-depth alarm: the nightly state machine
        // invokes this Lambda directly as the last step, so a failure here (or upstream) ends
        // the execution rather than retrying in isolation off a DLQ.
        // ============================================================================
        this.errorsAlarm = Alarm.Builder.create(this, prefix + "-AnalyticsMetricsPublish-ErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription("Analytics metrics publish errored at least once in 24 hours")
                .metric(this.metricsPublishLambda.metricErrors(
                        MetricOptions.builder().period(Duration.hours(24)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // ============================================================================
        // Charges-without-activation alarm: a paid Stripe charge on the reconciliation day with
        // no subscription-activated event, so a customer paid and the webhook did not grant the
        // bundle. The metric is one datapoint a night; a day with no row publishes nothing, which
        // is not a breach. No SnsAction: the alarm-state-change rule in OpsStack routes every
        // alarm to Telegram and opens the [ALARM] issue.
        // ============================================================================
        this.chargesWithoutActivationAlarm = Alarm.Builder.create(this, prefix + "-ChargesWithoutActivationAlarm")
                .alarmName(prefix + "-charges-without-activation")
                .alarmDescription(
                        "A paid Stripe charge has no activation. Runbook: .claude/skills/paid-without-activation/SKILL.md")
                .metric(metric("ChargesWithoutActivation"))
                .threshold(0)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();
    }

    private static Metric metric(String metricName) {
        return Metric.Builder.create()
                .namespace(METRICS_NAMESPACE)
                .metricName(metricName)
                .statistic("Sum")
                .period(Duration.hours(24))
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
