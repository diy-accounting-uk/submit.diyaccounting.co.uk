/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.TimeZone;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.lambda.IFunction;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.scheduler.CronOptionsWithTimezone;
import software.amazon.awscdk.services.scheduler.Schedule;
import software.amazon.awscdk.services.scheduler.ScheduleExpression;
import software.amazon.awscdk.services.scheduler.ScheduleProps;
import software.amazon.awscdk.services.scheduler.TimeWindow;
import software.amazon.awscdk.services.scheduler.targets.StepFunctionsStartExecution;
import software.amazon.awscdk.services.stepfunctions.Chain;
import software.amazon.awscdk.services.stepfunctions.DefinitionBody;
import software.amazon.awscdk.services.stepfunctions.Errors;
import software.amazon.awscdk.services.stepfunctions.JsonPath;
import software.amazon.awscdk.services.stepfunctions.LogLevel;
import software.amazon.awscdk.services.stepfunctions.LogOptions;
import software.amazon.awscdk.services.stepfunctions.Parallel;
import software.amazon.awscdk.services.stepfunctions.RetryProps;
import software.amazon.awscdk.services.stepfunctions.StateMachine;
import software.amazon.awscdk.services.stepfunctions.StateMachineType;
import software.amazon.awscdk.services.stepfunctions.Succeed;
import software.amazon.awscdk.services.stepfunctions.tasks.LambdaInvoke;
import software.constructs.Construct;

/**
 * One Step Functions state machine, started by one EventBridge Scheduler schedule, replacing the
 * five independent EventBridge rules and five DLQs the ingestion and analytics jobs used before
 * this phase. {@code PLAN_USAGE_DATA_PIPELINE.md:1122} named this exact trigger for moving to
 * Step Functions: the metrics publish ran whether or not the ingestion jobs succeeded, so a
 * failed Stripe pull put a false zero on the dashboard with only the Lambda errors alarm saying
 * otherwise.
 *
 * <p>Definition: a {@code Parallel} branch runs the three ingestion jobs (Stripe reconciliation,
 * GA4 report pull, GA4 event export pull) at once, since they share no data; then the data
 * quality run; then the metrics publish; then {@code Succeed}. Every task retries twice on
 * {@code States.TaskFailed} with a 60-second interval and a backoff rate of 2, on top of {@code
 * retryOnServiceExceptions}. There is no {@code Catch}: a failure anywhere ends the execution in
 * {@code Failed} and stops the metrics publish, which is the entire reason for this phase.
 *
 * <p>Each task reads {@code $} directly rather than the previous task's output, so an explicit
 * {@code {"date": "..."}} on the execution input reaches every task unchanged and an empty input
 * lets each job fall back to its own default offset. The {@code Parallel} branch discards its own
 * result (three job outputs that nothing downstream needs) rather than replacing the execution
 * input with them, so the data quality and metrics publish tasks still see the original input.
 *
 * <p>Not a {@link software.constructs.Construct} subclass's sibling by inheritance but a plain
 * class, matching {@link DataQuality} and {@link AnalyticsDashboard}: it takes the parent scope
 * and builds its children against it, exposing the created resources as public fields. Lives in
 * {@code IngestionStack}, the orchestration stack; {@code DataQuality} and {@code
 * AnalyticsDashboard}'s Lambdas live in {@code AnalyticsStack} and are imported here by name,
 * the same import-by-name habit the rest of the repo uses for a resource owned by a sibling stack.
 */
public class NightlyIngestionWorkflow {

    public final StateMachine stateMachine;
    public final Schedule schedule;
    public final Alarm executionsFailedAlarm;
    public final Alarm executionsMissedAlarm;

    @Value.Immutable
    public interface NightlyIngestionWorkflowProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        String envName();

        /** The state machine's physical name, e.g. {@code SubmitSharedNames.stateMachineName}. */
        String stateMachineName();

        IFunction stripeReconcileLambda();

        IFunction ga4ReportPullLambda();

        IFunction ga4EventExportPullLambda();

        /** Imported by name from {@code AnalyticsStack}: {@code DataQuality.runLambda}. */
        IFunction dataQualityRunLambda();

        /** Imported by name from {@code AnalyticsStack}: {@code AnalyticsDashboard.metricsPublishLambda}. */
        IFunction metricsPublishLambda();

        static ImmutableNightlyIngestionWorkflowProps.Builder builder() {
            return ImmutableNightlyIngestionWorkflowProps.builder();
        }
    }

    public NightlyIngestionWorkflow(final Construct scope, final NightlyIngestionWorkflowProps props) {
        var stack = Stack.of(scope);
        var prefix = props.idPrefix();
        var isProd = "prod".equals(props.envName());

        // ============================================================================
        // Definition
        // ============================================================================
        var ingestionParallel = Parallel.Builder.create(scope, prefix + "-Nightly-IngestJobs")
                .stateName("Run ingestion jobs")
                // Discards the three branch outputs so the original execution input ($) still
                // reaches the data quality and metrics publish tasks unchanged, rather than being
                // replaced by an array of ingestion job results nothing downstream needs.
                .resultPath(JsonPath.DISCARD)
                .build();
        ingestionParallel.branch(
                buildTask(scope, prefix + "-Nightly-StripeReconcile", "Stripe reconciliation", props.stripeReconcileLambda()));
        ingestionParallel.branch(
                buildTask(scope, prefix + "-Nightly-Ga4ReportPull", "GA4 report pull", props.ga4ReportPullLambda()));
        ingestionParallel.branch(buildTask(
                scope,
                prefix + "-Nightly-Ga4EventExportPull",
                "GA4 event export pull",
                props.ga4EventExportPullLambda()));

        var dataQualityTask =
                buildTask(scope, prefix + "-Nightly-DataQuality", "data quality run", props.dataQualityRunLambda());
        var metricsPublishTask = buildTask(
                scope, prefix + "-Nightly-MetricsPublish", "metrics publish", props.metricsPublishLambda());
        var succeed = Succeed.Builder.create(scope, prefix + "-Nightly-Succeed").build();

        var definition = Chain.start(ingestionParallel).next(dataQualityTask).next(metricsPublishTask).next(succeed);

        // ============================================================================
        // State machine
        // ============================================================================
        // A brand new resource, unlike the job Lambdas' log groups: no prior deploy has ever
        // created a log group for this state machine, so a plain LogGroup needs none of the
        // idempotent create-if-missing handling those functions' stable names require.
        var logGroup = LogGroup.Builder.create(scope, prefix + "-NightlyLogGroup")
                .logGroupName("/aws/vendedlogs/states/" + props.stateMachineName())
                .retention(RetentionDays.ONE_MONTH)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        this.stateMachine = StateMachine.Builder.create(scope, prefix + "-NightlyStateMachine")
                .stateMachineName(props.stateMachineName())
                .stateMachineType(StateMachineType.STANDARD)
                .definitionBody(DefinitionBody.fromChainable(definition))
                .tracingEnabled(false)
                .logs(LogOptions.builder()
                        .destination(logGroup)
                        .level(LogLevel.ERROR)
                        .includeExecutionData(false)
                        .build())
                .build();

        // ============================================================================
        // Schedule
        // ============================================================================
        // prod: 02:15 daily, the slot the Stripe reconciliation job used to run alone in. ci:
        // 02:15 every Monday, keeping the weekly cadence the third-party calls have today.
        var cronOptions = isProd
                ? CronOptionsWithTimezone.builder()
                        .minute("15")
                        .hour("2")
                        .timeZone(TimeZone.ETC_UTC)
                        .build()
                : CronOptionsWithTimezone.builder()
                        .minute("15")
                        .hour("2")
                        .weekDay("MON")
                        .timeZone(TimeZone.ETC_UTC)
                        .build();

        this.schedule = new Schedule(
                scope,
                prefix + "-NightlySchedule",
                ScheduleProps.builder()
                        .scheduleName(props.stateMachineName() + "-schedule")
                        .description("Start the nightly analytics ingestion and publish state machine")
                        .schedule(ScheduleExpression.cron(cronOptions))
                        .timeWindow(TimeWindow.off())
                        .target(StepFunctionsStartExecution.Builder.create(this.stateMachine)
                                .build())
                        .build());

        // ============================================================================
        // Alarms
        // ============================================================================
        this.executionsFailedAlarm = Alarm.Builder.create(scope, prefix + "-NightlyExecutionsFailedAlarm")
                .alarmName(props.stateMachineName() + "-failed")
                .alarmDescription("The nightly analytics ingestion state machine failed at least once in 24 hours")
                .metric(this.stateMachine.metricFailed(
                        MetricOptions.builder().period(Duration.hours(24)).statistic("Sum").build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // Catches the schedule silently not firing, which no per-job DLQ or errors alarm could
        // ever see: no execution means no Lambda ever ran, so nothing errors. ci's cadence is
        // weekly, so this alarm would false-positive there and is skipped.
        if (isProd) {
            this.executionsMissedAlarm = Alarm.Builder.create(scope, prefix + "-NightlyExecutionsMissedAlarm")
                    .alarmName(props.stateMachineName() + "-missed")
                    .alarmDescription("The nightly analytics ingestion state machine has not started an execution in 26 hours")
                    .metric(this.stateMachine.metricStarted(
                            MetricOptions.builder().period(Duration.hours(26)).statistic("Sum").build()))
                    .threshold(1)
                    .evaluationPeriods(1)
                    .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
                    .treatMissingData(TreatMissingData.BREACHING)
                    .build();
        } else {
            this.executionsMissedAlarm = null;
        }
    }

    private static LambdaInvoke buildTask(Construct scope, String id, String description, IFunction lambdaFunction) {
        var task = LambdaInvoke.Builder.create(scope, id)
                .stateName(description)
                .lambdaFunction(lambdaFunction)
                .payloadResponseOnly(true)
                .retryOnServiceExceptions(true)
                .inputPath("$")
                .build();
        task.addRetry(RetryProps.builder()
                .errors(List.of(Errors.TASKS_FAILED))
                .interval(Duration.seconds(60))
                .maxAttempts(2)
                .backoffRate(2)
                .build());
        return task;
    }
}
