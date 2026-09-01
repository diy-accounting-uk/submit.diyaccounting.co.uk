/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.IWidget;
import software.amazon.awscdk.services.cloudwatch.MathExpression;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.SingleValueWidget;
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
 * the last step of the nightly chain, and the dashboard that reads them.
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
 * publish rather than the publish running regardless and putting a false zero on the dashboard.
 *
 * <p>CloudWatch over QuickSight is the design's cost call (see PLAN_USAGE_DATA_PIPELINE.md's
 * WP-7 section): about $9/month all in, reusing the alarm and Telegram routing that already
 * exist, against QuickSight's $9-24 per author per month before any reader.
 */
public class AnalyticsDashboard extends Construct {

    /** The namespace the Lambda's {@code cloudwatch:PutMetricData} grant is conditioned on, and
     * every dashboard widget reads from. Must match {@code METRICS_NAMESPACE} in {@code
     * app/functions/analytics/analyticsMetricsPublish.js} exactly. */
    private static final String METRICS_NAMESPACE = "Submit/Analytics";

    public final Function metricsPublishLambda;
    public final Alarm errorsAlarm;
    public final Dashboard dashboard;

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
        var sharedNames = props.sharedNames();

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
        // Dashboard
        // ============================================================================
        var dashboardName = sharedNames.envResourceNamePrefix + "-analytics";
        var dashboardRows = new ArrayList<List<IWidget>>();

        dashboardRows.add(List.of(
                GraphWidget.Builder.create()
                        .title("Active Users")
                        .left(List.of(metric("ActiveUsers")))
                        .width(12)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("Sessions by Country (top 5)")
                        .left(List.of(search("Sessions", "Country")))
                        .width(12)
                        .height(6)
                        .build()));

        dashboardRows.add(List.of(GraphWidget.Builder.create()
                .title("Submissions by Outcome")
                .left(List.of(search("Submissions", "Outcome")))
                .width(24)
                .height(6)
                .build()));

        dashboardRows.add(List.of(SingleValueWidget.Builder.create()
                .title("Login-to-Submission Conversion (7 day)")
                .metrics(List.of(metric("LoginToSubmissionConversion")))
                .width(24)
                .height(4)
                .build()));

        dashboardRows.add(List.of(GraphWidget.Builder.create()
                .title("Revenue (GBP) by Product")
                .left(List.of(search("RevenueGbp", "Product")))
                .width(24)
                .height(6)
                .build()));

        dashboardRows.add(List.of(GraphWidget.Builder.create()
                .title("Passes Issued and Redeemed by Type")
                .left(List.of(search("PassesIssued", "PassType"), search("PassesRedeemed", "PassType")))
                .width(24)
                .height(6)
                .build()));

        dashboardRows.add(List.of(GraphWidget.Builder.create()
                .title("HMRC Failures by Class")
                .left(List.of(search("HmrcFailures", "FailureClass")))
                .width(24)
                .height(6)
                .build()));

        // The three counts plotted together so a gap between sources is visible without a
        // query. Not the two gap metrics themselves: METRIC_DEFINITIONS in
        // analyticsMetricsPublish.js publishes only the three raw counts, and this widget reads
        // exactly those three plain metric names, not a SEARCH.
        dashboardRows.add(List.of(GraphWidget.Builder.create()
                .title("Purchase Reconciliation: GA4 vs Stripe vs Activity Events")
                .left(List.of(metric("Ga4Purchases"), metric("StripePaidCharges"), metric("ActivityActivations")))
                .width(24)
                .height(6)
                .build()));

        this.dashboard = Dashboard.Builder.create(this, prefix + "-AnalyticsDashboard")
                .dashboardName(dashboardName)
                .widgets(dashboardRows)
                .build();

        cfnOutput(
                this,
                "AnalyticsDashboardUrl",
                "https://" + region + ".console.aws.amazon.com/cloudwatch/home?region=" + region + "#dashboards:name="
                        + dashboardName);
    }

    private static Metric metric(String metricName) {
        return Metric.Builder.create()
                .namespace(METRICS_NAMESPACE)
                .metricName(metricName)
                .statistic("Sum")
                .period(Duration.hours(24))
                .build();
    }

    /**
     * A SEARCH expression over every time series for one metric name, regardless of its
     * dimension value: the daily count of distinct outcomes, pass types, products, failure
     * classes or countries is data-driven, so CDK cannot enumerate them at synth time. Matches
     * the SEARCH pattern {@code ObservabilityStack} already uses for per-function Lambda
     * metrics (ObservabilityStack.java:697).
     */
    private static MathExpression search(String metricName, String dimensionName) {
        return MathExpression.Builder.create()
                .expression(String.format(
                        "SEARCH('{%s,%s} MetricName=\"%s\"', 'Sum', 86400)",
                        METRICS_NAMESPACE, dimensionName, metricName))
                .label(metricName + " by " + dimensionName)
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
