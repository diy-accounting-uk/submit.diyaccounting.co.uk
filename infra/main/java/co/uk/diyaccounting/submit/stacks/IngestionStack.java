/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.SubmitSharedNames;
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
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
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
